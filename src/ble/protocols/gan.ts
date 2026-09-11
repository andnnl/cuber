// GAN 智能魔方适配层: BleTransport 字节流 ↔ LinkEvent
//
// 依据 gan-web-bluetooth v3.0.2 (MIT) 连接层实证:
//   - salt = MAC 字节反序; Gen2 且设备名以 "AiCube" 开头用 GAN_ENCRYPTION_KEYS[1], 其余用 [0]
//   - 通知帧 (≥16 字节) 先解密再交给协议驱动; 命令帧总是先加密再写特征
//   - 代际由 GATT 主服务 UUID 决定 (Gen2/3/4), 三代加密方案相同

import { BleTransport, DeviceInfo, LinkEvent } from "../types";
import {
  GanCubeCommand,
  GanCubeEvent,
  GanProtocolDriver,
  GanCubeRawConnection,
  GanGen2ProtocolDriver,
  GanGen3ProtocolDriver,
  GanGen4ProtocolDriver,
} from "./vendor/gan-protocol-core";
import { GanGen2CubeEncrypter } from "./vendor/gan-cube-encrypter";
import {
  GAN_GEN2_SERVICE,
  GAN_GEN3_SERVICE,
  GAN_GEN4_SERVICE,
  GAN_ENCRYPTION_KEYS,
} from "./vendor/gan-cube-definitions";

export type GanGen = 2 | 3 | 4;

/** 服务 UUID → GAN 代际 */
export function ganGenForService(uuid: string): GanGen | null {
  const u = (uuid || "").toLowerCase();
  if (u === GAN_GEN2_SERVICE.toLowerCase()) return 2;
  if (u === GAN_GEN3_SERVICE.toLowerCase()) return 3;
  if (u === GAN_GEN4_SERVICE.toLowerCase()) return 4;
  return null;
}

/** "AA:BB:CC:DD:EE:FF" → 反序 6 字节 salt (与原库 connectGanCube 一致) */
export function macToSalt(mac: string): Uint8Array {
  const bytes = (mac || "").split(/[:-\s]+/).filter(Boolean).map((c) => parseInt(c, 16));
  if (bytes.length !== 6 || bytes.some(isNaN)) {
    throw new Error(`非法 MAC 地址: ${mac}`);
  }
  return new Uint8Array(bytes.reverse());
}

/** GAN 魔方门面: 持有传输层 + 代际驱动 + 加密器, 对上只发 LinkEvent */
export class GanCubeLink {
  readonly brand: string;
  private transport: BleTransport;
  private gen: GanGen | null = null;
  private driver: GanProtocolDriver | null = null;
  private encrypter: GanGen2CubeEncrypter | null = null;
  private info: DeviceInfo | null = null;
  private eventCb: ((e: LinkEvent) => void) | null = null;
  private disconnectCb: (() => void) | null = null;

  constructor(transport: BleTransport, brand = "GAN") {
    this.transport = transport;
    this.brand = brand;
  }

  /** 协议驱动用的原始连接 (命令发送走加密) */
  private rawConnection: GanCubeRawConnection = {
    sendCommandMessage: (message: Uint8Array) => this.writeEncrypted(message),
    disconnect: () => this.transport.disconnect(),
  };

  onEvent(cb: (e: LinkEvent) => void): void {
    this.eventCb = cb;
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCb = cb;
  }

  /**
   * 连接并完成代际识别。
   * 浏览器需在用户手势内调用 (requestDevice 弹窗); 原生可先 requestScan。
   * 无 MAC 时抛错 (Gen2+ 解密必需, Web 侧由 watchAdvertisements 自动获取)。
   */
  async connect(opts?: { address?: string }): Promise<DeviceInfo> {
    const info = await this.transport.connect(opts);
    const gen = (info.serviceUuids ?? []).map(ganGenForService).find((g) => g !== null) ?? null;
    if (!gen) {
      throw new Error("未发现 GAN 魔方 BLE 服务, 设备不受支持");
    }
    if (!info.mac) {
      throw new Error("无法获取魔方 MAC 地址 (解密必需), 请重试连接或手动填写");
    }
    this.gen = gen;
    this.info = info;
    this.driver =
      gen === 2 ? new GanGen2ProtocolDriver() : gen === 3 ? new GanGen3ProtocolDriver() : new GanGen4ProtocolDriver();
    const key =
      gen === 2 && (info.name || "").startsWith("AiCube") ? GAN_ENCRYPTION_KEYS[1] : GAN_ENCRYPTION_KEYS[0];
    this.encrypter = new GanGen2CubeEncrypter(
      new Uint8Array(key.key),
      new Uint8Array(key.iv),
      macToSalt(info.mac)
    );
    this.transport.onBytes((data) => this.handleBytes(data));
    this.transport.onDisconnect(() => {
      if (this.disconnectCb) {
        this.disconnectCb();
      }
    });
    // 初始状态 + 电量请求 (facelets 必须先到, MOVE 事件才会被接受)
    await this.requestFacelets();
    this.requestBattery().catch(() => undefined);
    return info;
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  get deviceInfo(): DeviceInfo | null {
    return this.info;
  }

  get protocolGen(): GanGen | null {
    return this.gen;
  }

  /** 请求全量状态 (facelets 事件) */
  async requestFacelets(): Promise<void> {
    await this.sendCommand({ type: "REQUEST_FACELETS" });
  }

  async requestBattery(): Promise<void> {
    await this.sendCommand({ type: "REQUEST_BATTERY" });
  }

  async requestHardware(): Promise<void> {
    await this.sendCommand({ type: "REQUEST_HARDWARE" });
  }

  /** 构建并加密发送协议命令 (命令帧总是加密, 与原库一致) */
  async sendCommand(command: GanCubeCommand): Promise<void> {
    if (!this.driver) {
      throw new Error("尚未连接");
    }
    const msg = this.driver.createCommandMessage(command);
    if (msg) {
      await this.writeEncrypted(msg);
    }
  }

  private async writeEncrypted(message: Uint8Array): Promise<void> {
    if (!this.encrypter) {
      throw new Error("尚未连接");
    }
    await this.transport.write(this.encrypter.encrypt(message));
  }

  /** 通知帧入口: 解密 → 协议驱动 → LinkEvent */
  private async handleBytes(data: Uint8Array): Promise<void> {
    if (!this.driver || !this.encrypter || data.length < 16) {
      return;
    }
    const decrypted = this.encrypter.decrypt(data);
    let events: GanCubeEvent[] = [];
    try {
      events = await this.driver.handleStateEvent(this.rawConnection, decrypted);
    } catch {
      return; // 坏帧丢弃
    }
    for (const e of events) {
      const link = toLinkEvent(e);
      if (link && this.eventCb) {
        this.eventCb(link);
      }
    }
  }
}

/** 协议事件 → 统一 LinkEvent (不支持的事件返回 null) */
function toLinkEvent(e: GanCubeEvent): LinkEvent | null {
  switch (e.type) {
    case "FACELETS":
      return { type: "facelets", facelets: e.facelets };
    case "MOVE":
      return { type: "move", move: e.move };
    case "BATTERY":
      return { type: "battery", level: e.batteryLevel };
    case "HARDWARE":
      return { type: "hardware", name: e.hardwareName, softwareVersion: e.softwareVersion };
    default:
      return null;
  }
}
