// Web Bluetooth 传输层 (桌面 Chrome/Edge; Android WebView 走原生桥, 见 M4)
//
// 行为对齐 gan-web-bluetooth v3.0.2 连接层:
//   - requestDevice 过滤 GAN/MG/AiCube 前缀, optionalServices 声明三代服务
//   - MAC 通过 watchAdvertisements 的 advertisementreceived 事件自动获取
//     (Chrome 需实验特性开启; 拿不到则抛错, 由上层提示手动输入)
//   - 订阅 state 特征通知 → onBytes; 写命令走 command 特征

import { BleTransport, DeviceInfo } from "../types";
import { PROTOCOLS } from "../protocols/registry";
import { GAN_CIC_LIST, GAN_GEN2_SERVICE, GAN_GEN3_SERVICE, GAN_GEN4_SERVICE } from "../protocols/vendor/gan-cube-definitions";

// ---- Web Bluetooth 最小类型声明 (TS DOM lib 不含 navigator.bluetooth) ----
interface NBCharacteristicEvent extends Event {
  target: NBCharacteristic & EventTarget;
}
interface NBCharacteristic extends EventTarget {
  value: DataView | null;
  startNotifications(): Promise<NBCharacteristic>;
  stopNotifications(): Promise<NBCharacteristic>;
  writeValue(data: BufferSource): Promise<void>;
  writeValueWithResponse?(data: BufferSource): Promise<void>;
}
interface NBService {
  uuid: string;
  getCharacteristic(uuid: string): Promise<NBCharacteristic>;
}
interface NBLikeGatt {
  connected: boolean;
  connect(): Promise<NBLikeGatt>;
  getPrimaryServices(): Promise<NBService[]>;
  disconnect(): void;
}
interface NBAdvertisingEvent extends Event {
  manufacturerData?: Map<number, DataView> | DataView;
}
interface NBDevice extends EventTarget {
  name?: string;
  gatt?: NBLikeGatt;
  watchAdvertisements?(options?: { signal?: AbortSignal }): Promise<void>;
}
interface NavigatorBluetooth {
  requestDevice(options: unknown): Promise<NBDevice>;
}

/** 浏览器是否支持 Web Bluetooth */
export function webBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as unknown as { bluetooth?: NavigatorBluetooth }).bluetooth;
}

function bluetooth(): NavigatorBluetooth {
  const bt = (navigator as unknown as { bluetooth?: NavigatorBluetooth }).bluetooth;
  if (!bt) {
    throw new Error("当前浏览器不支持 Web Bluetooth (需 Chrome/Edge, 或使用 App 内原生蓝牙)");
  }
  return bt;
}

/** 左侧补零 (项目 lib 为 es6, 无 padStart) */
function pad2(n: number): string {
  const s = n.toString(16).toUpperCase();
  return s.length < 2 ? "0" + s : s;
}

/**
 * 容错归一化 MAC 字符串为 "AA:BB:CC:DD:EE:FF" 格式。
 * 接受: "AA:BB:CC:DD:EE:FF" / "aa-bb-cc-dd-ee-ff" / "AABBCCDDEEFF" / "aabbccddeeff" 等
 * 非法 (长度/字符不对) 返回 null。
 */
function normalizeMac(input: string): string | null {
  const hex = (input || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) {
    return null;
  }
  const parts: string[] = [];
  for (let i = 0; i < 12; i += 2) {
    parts.push(hex.slice(i, i + 2));
  }
  return parts.join(":");
}

/** 从广播 manufacturer data 提取 MAC (原库 extractMAC 逻辑: 末 6 字节反序 hex) */
function extractMAC(manufacturerData: Map<number, DataView> | DataView): string {
  let dataView: DataView | undefined;
  if (manufacturerData instanceof DataView) {
    // Bluefy 浏览器直接返回 DataView 的兼容分支 (原库行为)
    dataView = new DataView(manufacturerData.buffer.slice(2, 11));
  } else {
    for (const id of GAN_CIC_LIST) {
      if (manufacturerData.has(id)) {
        const got = manufacturerData.get(id)!;
        dataView = new DataView(got.buffer.slice(0, 9));
        break;
      }
    }
  }
  const mac: string[] = [];
  if (dataView && dataView.byteLength >= 6) {
    for (let i = 1; i <= 6; i++) {
      mac.push(pad2(dataView.getUint8(dataView.byteLength - i)));
    }
  }
  const result = mac.join(":");
  if (!result) {
    // 诊断: 收到了广播但 CIC 不在 GAN_CIC_LIST (0x0101-0xFF01) 范围内, 或数据太短
    const cics: number[] = [];
    if (!(manufacturerData instanceof DataView) && manufacturerData instanceof Map) {
      manufacturerData.forEach((_v, k) => cics.push(k));
    }
    console.warn(
      "[WebBluetooth] advertisementreceived 已收到, 但未从 manufacturer data 提取到 MAC。",
      "已识别的 CIC 范围 0x0101-0xFF01, 实际收到的 CIC:",
      cics.length ? cics.map((c) => "0x" + c.toString(16).toUpperCase()) : "(无)"
    );
  }
  return result;
}

/** watchAdvertisements 自动取 MAC, 15s 超时 (原库 autoRetrieveMacAddress 逻辑; 失败抛错, 原因透传给 UI) */
async function autoRetrieveMacAddress(device: NBDevice): Promise<string> {
  if (typeof device.watchAdvertisements !== "function") {
    throw new Error(
      "当前浏览器不支持自动获取 MAC (watchAdvertisements), 请点「MAC」按钮手动填写 (魔方底盖 / 电池仓有印)"
    );
  }
  let settled = false;
  return new Promise<string>((resolve, reject) => {
    const abort = new AbortController();
    const finish = (value: string | null, reason: string) => {
      if (settled) {
        return;
      }
      settled = true;
      device.removeEventListener("advertisementreceived", onAdv);
      abort.abort();
      if (reason) {
        console.warn("[WebBluetooth] autoRetrieveMacAddress 退出:", reason);
        reject(new Error(reason));
      } else {
        resolve(value as string);
      }
    };
    const onAdv = (evt: Event) => {
      const md = (evt as NBAdvertisingEvent).manufacturerData;
      if (!md) {
        finish(null, "未收到魔方广播数据 (缺 manufacturer data), 请关机重开魔方后重试");
        return;
      }
      const mac = extractMAC(md);
      finish(mac || null, mac ? "" : "广播数据中未提取到 MAC (CIC 不匹配)");
    };
    const onAbort = () => {
      finish(
        null,
        "未在 15s 内收到魔方广播: 魔方连接过一次后会停止广播, 请先关闭魔方电源再重新开机, 开机后立即点「连接魔方」; 或点「MAC」手动填写"
      );
    };
    device.addEventListener("advertisementreceived", onAdv);
    device.watchAdvertisements!({ signal: abort.signal }).catch((err) =>
      finish(null, "watchAdvertisements 调用失败: " + (err && err.message ? err.message : err))
    );
    setTimeout(onAbort, 15000);
  });
}

export class WebBluetoothTransport implements BleTransport {
  readonly kind = "web" as const;

  private device: NBDevice | null = null;
  private commandChar: NBCharacteristic | null = null;
  private bytesCb: ((data: Uint8Array) => void) | null = null;
  private disconnectCb: (() => void) | null = null;

  async connect(opts?: { mac?: string; autoReconnect?: boolean; knownName?: string }): Promise<DeviceInfo> {
    const bt = bluetooth();
    // autoReconnect: 经 getDevices 免弹窗找回上次授权的设备 (刷新后自动重连);
    // 常规路径: requestDevice 系统选择弹窗 (需用户手势)
    const device = opts?.autoReconnect
      ? await this.reconnectKnown(bt, opts.knownName || "")
      : await bt.requestDevice({
          filters: [{ namePrefix: "GAN" }, { namePrefix: "MG" }, { namePrefix: "AiCube" }],
          optionalServices: [GAN_GEN2_SERVICE, GAN_GEN3_SERVICE, GAN_GEN4_SERVICE],
        });
    this.device = device;
    // 手动填写的 MAC 优先: 跳过 watchAdvertisements, 直接用用户提供的 MAC
    let mac: string | null = opts?.mac ? normalizeMac(opts.mac) : null;
    if (!mac) {
      mac = await autoRetrieveMacAddress(device);
    } else {
      console.info("[WebBluetooth] 使用手动填写的 MAC:", mac, "(跳过 watchAdvertisements)");
    }
    const gatt = device.gatt!;
    await gatt.connect();
    const services = await gatt.getPrimaryServices();
    let matched = false;
    for (const service of services) {
      const meta = PROTOCOLS.find((p) => p.serviceUuid.toLowerCase() === service.uuid.toLowerCase());
      if (!meta || !meta.writeUuid) {
        continue;
      }
      const commandChar = await service.getCharacteristic(meta.writeUuid);
      const stateChar = await service.getCharacteristic(meta.notifyUuids[0]);
      stateChar.addEventListener("characteristicvaluechanged", this.handleNotify);
      await stateChar.startNotifications();
      this.commandChar = commandChar;
      matched = true;
      break;
    }
    if (!matched) {
      gatt.disconnect();
      throw new Error("设备未提供 GAN 魔方 BLE 服务, 不受支持");
    }
    device.addEventListener("gattserverdisconnected", this.handleGattDisconnect);
    return {
      name: device.name || "GAN Cube",
      brand: "GAN",
      mac: mac || undefined,
      serviceUuids: services.map((s) => s.uuid),
    };
  }

  /** 刷新后自动重连: 经 getDevices 免弹窗找回上次授权的设备 (Chrome 114+)。
   * requestDevice 必须用户手势且每次弹窗, 无法后台重连; getDevices 返回用户曾授权过的设备,
   * 按上次记忆的设备名匹配, 其次按 GAN/MG/AiCube 前缀兜底 */
  private async reconnectKnown(bt: NavigatorBluetooth, knownName: string): Promise<NBDevice> {
    const btx = bt as unknown as { getDevices?: () => Promise<NBDevice[]> };
    if (typeof btx.getDevices !== "function") {
      throw new Error("当前浏览器不支持免弹窗重连, 请点「连接魔方」重新选择一次 (授权后下次刷新可自动重连)");
    }
    const known: NBDevice[] = (await btx.getDevices()) || [];
    const found =
      known.find((d) => !!d.name && d.name === knownName) ||
      known.find((d) => !!d.name && /^(GAN|MG|AiCube)/.test(d.name));
    if (!found) {
      throw new Error("未找到上次授权的魔方, 请点「连接魔方」重新选择一次 (授权后下次刷新可自动重连)");
    }
    return found;
  }

  async disconnect(): Promise<void> {
    this.device?.gatt?.disconnect();
  }

  onBytes(cb: (data: Uint8Array) => void): void {
    this.bytesCb = cb;
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCb = cb;
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.commandChar) {
      throw new Error("未连接");
    }
    if (typeof this.commandChar.writeValueWithResponse === "function") {
      await this.commandChar.writeValueWithResponse(bytes);
    } else {
      await this.commandChar.writeValue(bytes);
    }
  }

  private handleNotify = (evt: Event): void => {
    const value = (evt as NBCharacteristicEvent).target.value;
    if (!value || !this.bytesCb) {
      return;
    }
    this.bytesCb(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  };

  private handleGattDisconnect = (): void => {
    if (this.disconnectCb) {
      this.disconnectCb();
    }
  };
}
