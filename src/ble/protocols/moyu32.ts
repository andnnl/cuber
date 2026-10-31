import { ModeOfOperation } from "aes-js";
import { BleTransport, DeviceInfo, LinkEvent } from "../types";
import { brandFaceletsToState } from "../facelets";

const KEY = new Uint8Array([21, 119, 58, 92, 103, 14, 45, 31, 23, 103, 42, 19, 155, 103, 82, 87]);
const IV = new Uint8Array([17, 35, 38, 37, 134, 42, 44, 59, 85, 6, 127, 49, 126, 103, 33, 87]);
const FACES = "FBUDLR";

function bits(bytes: Uint8Array, start: number, count: number): number {
  let value = 0;
  for (let i = start; i < start + count; i++) value = (value << 1) | ((bytes[i >> 3] >> (7 - (i & 7))) & 1);
  return value;
}

export class Moyu32Cipher {
  private key = KEY.slice();
  private iv = IV.slice();

  constructor(mac: string) {
    const hex = mac.replace(/[^0-9a-f]/gi, "");
    if (!/^[0-9a-f]{12}$/i.test(hex)) throw new Error("MoYu32 需要有效的 MAC 地址");
    for (let i = 0; i < 6; i++) {
      const salt = parseInt(hex.slice((5 - i) * 2, (6 - i) * 2), 16);
      this.key[i] = (KEY[i] + salt) % 255;
      this.iv[i] = (IV[i] + salt) % 255;
    }
  }

  private chunk(buffer: Uint8Array, offset: number, decrypt: boolean): void {
    const aes = new ModeOfOperation.cbc(this.key, this.iv);
    buffer.set(decrypt ? aes.decrypt(buffer.slice(offset, offset + 16)) : aes.encrypt(buffer.slice(offset, offset + 16)), offset);
  }

  encode(bytes: Uint8Array): Uint8Array {
    if (bytes.length < 16) throw new Error("MoYu32 帧太短");
    const out = bytes.slice();
    this.chunk(out, 0, false);
    if (out.length > 16) this.chunk(out, out.length - 16, false);
    return out;
  }

  decode(bytes: Uint8Array): Uint8Array {
    if (bytes.length < 16) throw new Error("MoYu32 帧太短");
    const out = bytes.slice();
    if (out.length > 16) this.chunk(out, out.length - 16, true);
    this.chunk(out, 0, true);
    return out;
  }
}

function fallbackMac(name: string): string | null {
  const match = /^WCU_MY32_([0-9a-f]{2})([0-9a-f]{2})$/i.exec(name);
  return match ? `CF:30:16:00:${match[1]}:${match[2]}` : null;
}

export class Moyu32CubeLink {
  private cipher: Moyu32Cipher | null = null;
  private eventCb: ((e: LinkEvent) => void) | null = null;
  private disconnectCb: (() => void) | null = null;
  private closed = false;
  private previousCount = -1;
  private info: DeviceInfo | null = null;
  private writes: Promise<void> = Promise.resolve();
  private fallbackCipher: Moyu32Cipher | null = null;
  private cipherConfirmed = false;

  constructor(private transport: BleTransport) {}
  onEvent(cb: (e: LinkEvent) => void): void { this.eventCb = cb; }
  onDisconnect(cb: () => void): void { this.disconnectCb = cb; }

  async connect(opts?: { address?: string; mac?: string; autoReconnect?: boolean; knownName?: string; knownDeviceId?: string }, connectedInfo?: DeviceInfo): Promise<DeviceInfo> {
    this.closed = false;
    this.info = connectedInfo || await this.transport.connect(opts);
    const mac = opts?.mac || this.info.mac || fallbackMac(this.info.name);
    if (!mac) throw new Error("MoYu32 无法获取加密 MAC，请手动填写设备地址");
    this.cipher = new Moyu32Cipher(mac);
    const alternate = fallbackMac(this.info.name);
    this.fallbackCipher = alternate && alternate.toUpperCase() !== mac.toUpperCase() ? new Moyu32Cipher(alternate) : null;
    this.cipherConfirmed = false;
    this.transport.onBytes(bytes => this.handleFrame(bytes));
    this.transport.onDisconnect(() => { if (!this.closed) this.disconnectCb?.(); });
    await this.send(0xa1);
    await this.requestFacelets();
    await this.requestBattery();
    return { ...this.info, brand: "MoYu32", mac };
  }

  async disconnect(): Promise<void> { this.closed = true; await this.transport.disconnect(); }
  async requestFacelets(): Promise<void> { await this.send(0xa3); }
  async requestBattery(): Promise<void> { await this.send(0xa4); }

  private send(opcode: number): Promise<void> {
    if (this.closed || !this.cipher) return Promise.resolve();
    const command = new Uint8Array(20);
    command[0] = opcode;
    const frame = this.cipher.encode(command);
    this.writes = this.writes.catch(() => undefined).then(() => this.transport.write(frame));
    return this.writes;
  }

  private handleFrame(frame: Uint8Array): void {
    if (this.closed || !this.cipher || frame.length < 20) return;
    let raw: Uint8Array;
    try { raw = this.cipher.decode(frame); } catch { return; }
    if (raw[0] !== 0xa1 && raw[0] !== 0xa3 && raw[0] !== 0xa4 && raw[0] !== 0xa5 && raw[0] !== 0xab &&
      this.fallbackCipher && !this.cipherConfirmed) {
      const candidate = this.fallbackCipher.decode(frame);
      if ([0xa1, 0xa3, 0xa4, 0xa5].indexOf(candidate[0]) >= 0) {
        this.cipher = this.fallbackCipher;
        this.fallbackCipher = null;
        raw = candidate;
        this.requestFacelets().catch(() => undefined);
      }
    }
    if ([0xa1, 0xa3, 0xa4, 0xa5].indexOf(raw[0]) >= 0) this.cipherConfirmed = true;
    if (raw[0] === 0xa3) {
      const order = [2, 5, 0, 3, 4, 1];
      let facelets = "";
      for (const index of order) {
        for (let i = 0; i < 8; i++) {
          const code = bits(raw, 8 + index * 24 + i * 3, 3);
          if (code >= FACES.length) return;
          facelets += FACES[code];
          if (i === 3) facelets += FACES[index];
        }
      }
      if (!brandFaceletsToState(facelets)) return;
      const count = bits(raw, 152, 8);
      const forward = (count - this.previousCount + 256) & 255;
      if (this.previousCount >= 0 && (forward === 0 || forward > 128)) return;
      this.previousCount = count;
      this.eventCb?.({ type: "facelets", facelets, serial: this.previousCount });
      this.transport.confirmMac?.();
    } else if (raw[0] === 0xa4) {
      this.eventCb?.({ type: "battery", level: raw[1] });
    } else if (raw[0] === 0xa5) {
      const count = bits(raw, 88, 8);
      if (this.previousCount < 0) { this.previousCount = count; this.requestFacelets().catch(() => undefined); return; }
      const delta = (count - this.previousCount + 256) & 255;
      if (!delta) return;
      const moves: string[] = [];
      for (let i = 0; i < Math.min(delta, 5); i++) {
        const code = bits(raw, 96 + i * 5, 5);
        if (code >= 12) { this.requestFacelets().catch(() => undefined); return; }
        moves.push(FACES[code >> 1] + (code & 1 ? "'" : ""));
      }
      this.previousCount = count;
      if (delta > 5) this.requestFacelets().catch(() => undefined);
      for (let i = moves.length - 1; i >= 0; i--) {
        this.eventCb?.({ type: "move", move: moves[i], serial: (count - i + 256) & 255 });
      }
    }
  }
}
