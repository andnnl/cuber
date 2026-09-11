// Android WebView 原生蓝牙桥传输层 (对应 android/.../BleBridge.java)
//
// 桥协议:
//   JS → Java: window.__bleNative 的 5 个 @JavascriptInterface 方法
//     scan() / stopScan() / connect(address) / disconnect() / write(charUuid, base64)
//   Java → JS: evaluateJavascript 调 window.__ble.dispatch(type, payloadJson)
//     scan {address,name} / services {services:[{uuid,notify[],write[]}]} /
//     notify {data:base64} / disconnected {} / error {message} / bluetoothOn {}
//
// WebView 无系统设备选择器, 设备列表由 JS 弹窗展示: 先 startScan 收集,
// 用户点选后 connect({address}) 完成 GATT 连接 + 服务发现 + 订阅通知。

import { BleTransport, DeviceInfo } from "../types";
import { PROTOCOLS } from "../protocols/registry";

interface NativeServiceJson {
  uuid: string;
  notify: string[];
  write: string[];
}

/** WebView 内 (BleBridge 注入 window.__bleNative) 才可用 */
export function nativeBridgeAvailable(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { __bleNative?: unknown }).__bleNative;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

export class NativeBridgeTransport implements BleTransport {
  readonly kind = "native" as const;

  private bridge: { scan(): void; stopScan(): void; connect(address: string): void; disconnect(): void; write(charUuid: string, base64: string): void };

  private bytesCb: ((data: Uint8Array) => void) | null = null;
  private disconnectCb: (() => void) | null = null;
  private scanCbs: ((devices: { address: string; name: string }[]) => void)[] = [];
  private devices = new Map<string, { address: string; name: string }>();
  private scanTimer: any = null;

  // connect 流程 pending 状态 (services/disconnected/error 事件消费)
  private connectResolve: ((info: DeviceInfo) => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;
  private connectTimer: any = null;
  private pendingAddress = "";
  private pendingName = "";
  private serviceUuids: string[] = [];
  private commandChar = "";
  private connected = false;

  constructor() {
    this.bridge = (window as unknown as { __bleNative: NativeBridgeTransport["bridge"] }).__bleNative;
    // 桥回调唯一分发口 (单例, 见 getNativeTransport)
    (window as unknown as { __ble: unknown }).__ble = {
      dispatch: (type: string, payloadJson: string) => this.handleEvent(type, payloadJson),
    };
  }

  // ---- 扫描 (连接前设备选择, WebView 无系统选择器) ----

  startScan(timeoutMs = 15000): void {
    this.devices.clear();
    this.bridge.scan();
    if (this.scanTimer) {
      window.clearTimeout(this.scanTimer);
    }
    this.scanTimer = window.setTimeout(() => this.stopScan(), timeoutMs);
  }

  stopScan(): void {
    if (this.scanTimer) {
      window.clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.bridge.stopScan();
  }

  onScan(cb: (devices: { address: string; name: string }[]) => void): void {
    this.scanCbs.push(cb);
    cb(this.currentDevices()); // 立即回放当前已发现的列表
  }

  currentDevices(): { address: string; name: string }[] {
    return Array.from(this.devices.values());
  }

  private emitScan(): void {
    const list = this.currentDevices();
    for (const cb of this.scanCbs) {
      cb(list);
    }
  }

  // ---- BleTransport ----

  async connect(opts?: { address?: string }): Promise<DeviceInfo> {
    const address = opts?.address;
    if (!address) {
      throw new Error("请先扫描并选择魔方");
    }
    if (this.connected) {
      throw new Error("已有连接");
    }
    this.pendingAddress = address;
    this.pendingName = this.devices.get(address)?.name || address;
    this.stopScan();
    return new Promise<DeviceInfo>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.bridge.connect(address);
      // 服务发现超时保护 (系统蓝牙无法回调时兜底)
      this.connectTimer = window.setTimeout(() => {
        this.failConnect(new Error("连接超时"));
      }, 15000);
    });
  }

  async disconnect(): Promise<void> {
    this.bridge.disconnect();
    this.connected = false;
  }

  onBytes(cb: (data: Uint8Array) => void): void {
    this.bytesCb = cb;
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCb = cb;
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.connected || !this.commandChar) {
      throw new Error("未连接");
    }
    this.bridge.write(this.commandChar, bytesToBase64(bytes));
  }

  // ---- Java 桥事件分发 ----

  private handleEvent(type: string, payloadJson: string): void {
    let payload: Record<string, any> = {};
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      return;
    }
    switch (type) {
      case "scan": {
        const dev = { address: String(payload.address || ""), name: String(payload.name || "") };
        if (!dev.address || this.devices.has(dev.address)) {
          return;
        }
        this.devices.set(dev.address, dev);
        this.emitScan();
        break;
      }
      case "services": {
        const services: NativeServiceJson[] = payload.services || [];
        this.serviceUuids = services.map((s) => s.uuid);
        const meta = PROTOCOLS.find(
          (p) => p.writeUuid && services.some((s) => s.uuid.toLowerCase() === p.serviceUuid.toLowerCase())
        );
        if (!meta || !meta.writeUuid) {
          this.failConnect(new Error("设备未提供 GAN 魔方 BLE 服务, 不受支持"));
          return;
        }
        const svc = services.find((s) => s.uuid.toLowerCase() === meta.serviceUuid.toLowerCase())!;
        if (svc.write.map((w) => w.toLowerCase()).indexOf(meta.writeUuid.toLowerCase()) < 0) {
          this.failConnect(new Error("找不到 GAN 命令写特征"));
          return;
        }
        this.commandChar = meta.writeUuid;
        this.connected = true;
        this.okConnect({
          name: this.pendingName || "GAN Cube",
          brand: "GAN",
          mac: this.pendingAddress || undefined,
          serviceUuids: this.serviceUuids,
        });
        break;
      }
      case "notify": {
        if (!payload.data || !this.bytesCb) {
          return;
        }
        const bin = atob(payload.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        this.bytesCb(bytes);
        break;
      }
      case "disconnected": {
        this.connected = false;
        if (this.connectReject) {
          this.failConnect(new Error("连接已断开"));
          return;
        }
        if (this.disconnectCb) {
          this.disconnectCb();
        }
        break;
      }
      case "error": {
        const message = String(payload.message || "蓝牙错误");
        if (this.connectReject) {
          this.failConnect(new Error(message));
          return;
        }
        console.error("[BleBridge]", message);
        break;
      }
      default:
        break; // scanStart / bluetoothOn 等无需处理
    }
  }

  private okConnect(info: DeviceInfo): void {
    const resolve = this.connectResolve;
    this.cleanupConnect();
    if (resolve) {
      resolve(info);
    }
  }

  private failConnect(err: Error): void {
    const reject = this.connectReject;
    this.cleanupConnect();
    if (reject) {
      reject(err);
    }
  }

  private cleanupConnect(): void {
    this.connectResolve = null;
    this.connectReject = null;
    if (this.connectTimer) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }
}

let singleton: NativeBridgeTransport | null = null;

/** 传输层单例 (window.__ble 分发口只能注册一次, 扫描与连接共用同一实例) */
export function getNativeTransport(): NativeBridgeTransport {
  if (!singleton) {
    singleton = new NativeBridgeTransport();
  }
  return singleton;
}
