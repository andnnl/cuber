// CubeLink 门面: 组件层唯一入口
// 职责: 传输层工厂 + 连接状态机 + 最新状态缓存 (facelets/电量/硬件) + 事件透传
// 业务判定 (打乱匹配/十字完成) 由训练组件基于 facelets 事件自行实现

import { BleTransport, DeviceInfo, LinkEvent } from "./types";
import { GanCubeLink } from "./protocols/gan";
import { MockGanCubeTransport } from "./mock-transport";
import { WebBluetoothTransport, webBluetoothAvailable } from "./transport/web";
import { getNativeTransport, nativeBridgeAvailable } from "./transport/native";

export type CubeLinkKind = "web" | "mock" | "native";
export type CubeLinkStatus = "disconnected" | "connecting" | "connected";
export type TransportFactory = (kind: CubeLinkKind) => BleTransport;

export { webBluetoothAvailable, nativeBridgeAvailable, getNativeTransport };

/** 传输层工厂 (native = Android WebView 原生蓝牙桥) */
export function createTransport(kind: CubeLinkKind): BleTransport {
  if (kind === "mock") {
    return new MockGanCubeTransport();
  }
  if (kind === "web") {
    return new WebBluetoothTransport();
  }
  return getNativeTransport();
}

export class CubeLink {
  private transport: BleTransport | null = null;
  private gan: GanCubeLink | null = null;
  /** 每次连接/断开均递增；异步回调只能修改创建它的那一代会话。 */
  private generation = 0;

  status: CubeLinkStatus = "disconnected";
  deviceInfo: DeviceInfo | null = null;
  /** 最新 54 字符状态串 (Kociemba 布局, 与项目 serialize 一致) */
  facelets: string | null = null;
  battery: number | null = null;
  hardware: { name?: string; softwareVersion?: string } | null = null;

  private eventCbs: ((e: LinkEvent) => void)[] = [];
  private statusCbs: ((s: CubeLinkStatus) => void)[] = [];

  constructor(private transportFactory: TransportFactory = createTransport) {}

  onEvent(cb: (e: LinkEvent) => void): void {
    this.eventCbs.push(cb);
  }

  onStatus(cb: (s: CubeLinkStatus) => void): void {
    this.statusCbs.push(cb);
  }

  private setStatus(s: CubeLinkStatus): void {
    this.status = s;
    for (const cb of this.statusCbs) {
      cb(s);
    }
  }

  /**
   * 连接魔方。
   * web: 需在用户手势调用链内 (系统选择弹窗); opts.mac 可手动填写兜底 watchAdvertisements 失败。
   * mock: 直接连接内置模拟魔方 (无真机开发/演示)。
   * native: 需先经传输层 startScan 扫描, opts.address 指定所选设备。
   * autoReconnect: 刷新界面后自动重连 (免手势/弹窗), 配合 opts.mac/opts.address/opts.knownName。
   */
  async connect(kind: CubeLinkKind, opts?: { address?: string; mac?: string; autoReconnect?: boolean; knownName?: string }): Promise<DeviceInfo> {
    if (this.status !== "disconnected") {
      throw new Error("已连接或连接中");
    }
    const generation = ++this.generation;
    this.setStatus("connecting");
    let transport: BleTransport;
    try {
      transport = this.transportFactory(kind);
    } catch (err) {
      if (generation === this.generation) {
        this.setStatus("disconnected");
      }
      throw err;
    }
    const gan = new GanCubeLink(transport);
    this.transport = transport;
    this.gan = gan;
    gan.onEvent((e) => {
      if (generation === this.generation && this.gan === gan) {
        this.handleEvent(e);
      }
    });
    gan.onDisconnect(() => {
      if (generation !== this.generation || this.gan !== gan) {
        return;
      }
      this.transport = null;
      this.gan = null;
      this.deviceInfo = null;
      this.facelets = null;
      this.battery = null;
      this.hardware = null;
      this.setStatus("disconnected");
    });
    try {
      const info = await gan.connect(opts);
      if (generation !== this.generation || this.gan !== gan) {
        await gan.disconnect().catch(() => undefined);
        throw new Error("连接已取消");
      }
      this.deviceInfo = info;
      this.setStatus("connected");
      return info;
    } catch (err) {
      await gan.disconnect().catch(() => undefined);
      if (generation === this.generation && this.gan === gan) {
        this.transport = null;
        this.gan = null;
        this.setStatus("disconnected");
      }
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    ++this.generation;
    const gan = this.gan;
    this.gan = null;
    this.transport = null;
    this.deviceInfo = null;
    this.facelets = null;
    this.battery = null;
    this.hardware = null;
    this.setStatus("disconnected");
    if (gan) {
      await gan.disconnect();
    }
  }

  get connected(): boolean {
    return this.status === "connected";
  }

  /** 协议命令透传 (电量/硬件/facelets 刷新) */
  async requestFacelets(): Promise<void> {
    await this.gan?.requestFacelets();
  }

  async requestBattery(): Promise<void> {
    await this.gan?.requestBattery();
  }

  /** Mock 专用: 驱动模拟魔方转动 (kind="mock" 时可用) */
  mockApplyFormula(moves: string): void {
    if (this.transport instanceof MockGanCubeTransport) {
      this.transport.applyFormula(moves);
    }
  }

  private handleEvent(e: LinkEvent): void {
    switch (e.type) {
      case "facelets":
        this.facelets = e.facelets;
        break;
      case "battery":
        this.battery = e.level;
        break;
      case "hardware":
        this.hardware = { name: e.name, softwareVersion: e.softwareVersion };
        break;
      default:
        break;
    }
    for (const cb of this.eventCbs) {
      cb(e);
    }
  }
}
