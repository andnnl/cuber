import { ModeOfOperation } from "aes-js";
import { BleTransport, DeviceInfo, LinkEvent } from "../types";
import { brandFaceletsToState } from "../facelets";

const KEY = new Uint8Array([87, 177, 249, 171, 205, 90, 232, 167, 156, 185, 140, 231, 87, 140, 81, 8]);
const FACES = "LRDUFB";
const AXES = ["L", "R", "D", "U", "F", "B"];

export class QiyiCipher {
  encrypt(frame: Uint8Array): Uint8Array { return new ModeOfOperation.ecb(KEY).encrypt(frame); }
  decrypt(frame: Uint8Array): Uint8Array { return new ModeOfOperation.ecb(KEY).decrypt(frame); }
}

export function qiyiCrc(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

export function buildQiyiMessage(content: Uint8Array): Uint8Array {
  const length = content.length + 4;
  const frame = new Uint8Array(Math.ceil(length / 16) * 16);
  frame[0] = 0xfe;
  frame[1] = length;
  frame.set(content, 2);
  const crc = qiyiCrc(frame.slice(0, 2 + content.length));
  frame[2 + content.length] = crc & 255;
  frame[3 + content.length] = crc >>> 8;
  return frame;
}

function addressBytes(mac: string): Uint8Array {
  const compact = mac.replace(/[^0-9a-f]/gi, "");
  if (!/^[0-9a-f]{12}$/i.test(compact)) throw new Error("奇艺魔方需要有效的 MAC 地址");
  const out = new Uint8Array(6);
  for (let i = 0; i < 6; i++) out[i] = parseInt(compact.slice((5 - i) * 2, (6 - i) * 2), 16);
  return out;
}

function nameMac(name: string): string | null {
  const match = /^(?:QY-QYSC|XMD-TORNADOV4-I)-.*?([0-9a-f]{4})$/i.exec(name);
  return match ? `CC:A3:00:00:${match[1].slice(0, 2)}:${match[1].slice(2)}` : null;
}

function timestamp(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0);
}

function stateFromFrame(bytes: Uint8Array): string | null {
  if (bytes.length < 36) return null;
  let state = "";
  for (let i = 0; i < 54; i++) {
    const code = (bytes[7 + (i >> 1)] >>> (i & 1 ? 4 : 0)) & 15;
    if (code >= FACES.length) return null;
    state += FACES[code];
  }
  return brandFaceletsToState(state);
}

function moveFromCode(raw: number): string | null {
  if (raw < 1 || raw > 12) return null;
  const face = AXES[(raw - 1) >> 1];
  return face + ((raw & 1) === 0 ? "'" : "");
}

export class QiyiCubeLink {
  private cipher = new QiyiCipher();
  private eventCb: ((e: LinkEvent) => void) | null = null;
  private disconnectCb: (() => void) | null = null;
  private closed = false;
  private info: DeviceInfo | null = null;
  private writes: Promise<void> = Promise.resolve();
  private lastMoveTimestamp = -1;
  private lastEmittedTimestamp = -1;
  private moveSerial = 0;
  private lastState = "";
  private helloReceived = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private mac = "";

  constructor(private transport: BleTransport) {}
  onEvent(cb: (e: LinkEvent) => void): void { this.eventCb = cb; }
  onDisconnect(cb: () => void): void { this.disconnectCb = cb; }

  async connect(opts?: { address?: string; mac?: string; autoReconnect?: boolean; knownName?: string; knownDeviceId?: string }, connectedInfo?: DeviceInfo): Promise<DeviceInfo> {
    this.closed = false;
    this.info = connectedInfo || await this.transport.connect(opts);
    this.mac = opts?.mac || this.info.mac || nameMac(this.info.name) || "";
    if (!this.mac) throw new Error("奇艺魔方缺少握手 MAC，请手动填写设备地址");
    this.transport.onBytes(data => this.handleFrame(data));
    this.transport.onDisconnect(() => { if (!this.closed) this.disconnectCb?.(); });
    await this.sendHello(this.mac);
    const fallback = nameMac(this.info.name);
    if (fallback && fallback.toUpperCase() !== this.mac.toUpperCase()) {
      this.retryTimer = setTimeout(() => {
        if (!this.closed && !this.helloReceived) this.sendHello(fallback).catch(() => undefined);
      }, 1500);
    }
    return { ...this.info, brand: "QiYi", mac: this.mac };
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await this.transport.disconnect();
  }
  async requestFacelets(): Promise<void> { if (!this.helloReceived) await this.sendHello(this.mac); }
  async requestBattery(): Promise<void> { /* battery accompanies each state frame */ }

  private sendHello(mac: string): Promise<void> {
    const header = new Uint8Array([0, 0x6b, 1, 0, 0, 0x22, 6, 0, 2, 8, 0]);
    const content = new Uint8Array(header.length + 6);
    content.set(header);
    content.set(addressBytes(mac), header.length);
    return this.send(content);
  }

  private send(content: Uint8Array): Promise<void> {
    if (this.closed) return Promise.resolve();
    const message = this.cipher.encrypt(buildQiyiMessage(content));
    this.writes = this.writes.catch(() => undefined).then(() => this.transport.write(message));
    return this.writes;
  }

  private handleFrame(frame: Uint8Array): void {
    if (this.closed || !frame.length || frame.length % 16) return;
    let raw: Uint8Array;
    try { raw = this.cipher.decrypt(frame); } catch { return; }
    if (raw[0] !== 0xfe || raw[1] < 9 || raw[1] > raw.length || qiyiCrc(raw.slice(0, raw[1])) !== 0) return;
    const message = raw.slice(0, raw[1]);
    const opcode = message[2];
    if (opcode !== 2 && opcode !== 3 && opcode !== 4) return;
    this.helloReceived = true;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.send(message.slice(2, 7)).catch(() => undefined);
    const state = stateFromFrame(message);
    if (!state) return;
    const frameTime = timestamp(message, 3);
    const future: { code: number; time: number }[] = [];
    if (opcode === 3 && this.lastMoveTimestamp >= 0) {
      const candidates: { code: number; time: number }[] = [{ code: message[34], time: frameTime }];
      for (let i = 0; i < 11; i++) {
        const at = 36 + i * 5;
        if (at + 5 > message.length || message.slice(at, at + 5).every(byte => byte === 255)) continue;
        candidates.push({ time: timestamp(message, at), code: message[at + 4] });
      }
      candidates.sort((a, b) => a.time - b.time);
      const seen = new Set<string>();
      for (const item of candidates) {
        const move = moveFromCode(item.code);
        const key = `${item.time}:${item.code}`;
        if (!move || seen.has(key) || item.time <= this.lastMoveTimestamp || item.time <= this.lastEmittedTimestamp) continue;
        seen.add(key);
        if (item.time > frameTime) { future.push(item); continue; }
        this.moveSerial = (this.moveSerial % 255) + 1;
        this.lastEmittedTimestamp = item.time;
        this.eventCb?.({ type: "move", move, serial: this.moveSerial });
      }
    }
    if (state !== this.lastState || opcode === 4 || opcode === 3) {
      this.eventCb?.({ type: "facelets", facelets: state, serial: this.moveSerial || undefined });
      this.lastState = state;
      this.transport.confirmMac?.();
    }
    for (const item of future) {
      const move = moveFromCode(item.code)!;
      this.moveSerial = (this.moveSerial % 255) + 1;
      this.lastEmittedTimestamp = item.time;
      this.eventCb?.({ type: "move", move, serial: this.moveSerial });
    }
    this.eventCb?.({ type: "battery", level: message[35] });
    this.lastMoveTimestamp = Math.max(this.lastMoveTimestamp, frameTime);
  }
}
