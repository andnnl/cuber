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
  return mac.join(":");
}

/** watchAdvertisements 自动取 MAC, 10s 超时 (原库 autoRetrieveMacAddress 逻辑) */
async function autoRetrieveMacAddress(device: NBDevice): Promise<string | null> {
  if (typeof device.watchAdvertisements !== "function") {
    return null;
  }
  return new Promise<string | null>((resolve) => {
    const abort = new AbortController();
    const onAdv = (evt: Event) => {
      device.removeEventListener("advertisementreceived", onAdv);
      abort.abort();
      const mac = extractMAC((evt as NBAdvertisingEvent).manufacturerData!);
      resolve(mac || null);
    };
    const onAbort = () => {
      device.removeEventListener("advertisementreceived", onAdv);
      abort.abort();
      resolve(null);
    };
    device.addEventListener("advertisementreceived", onAdv);
    device.watchAdvertisements!({ signal: abort.signal }).catch(onAbort);
    setTimeout(onAbort, 10000);
  });
}

export class WebBluetoothTransport implements BleTransport {
  readonly kind = "web" as const;

  private device: NBDevice | null = null;
  private commandChar: NBCharacteristic | null = null;
  private bytesCb: ((data: Uint8Array) => void) | null = null;
  private disconnectCb: (() => void) | null = null;

  async connect(): Promise<DeviceInfo> {
    const bt = bluetooth();
    const device = await bt.requestDevice({
      filters: [{ namePrefix: "GAN" }, { namePrefix: "MG" }, { namePrefix: "AiCube" }],
      optionalServices: [GAN_GEN2_SERVICE, GAN_GEN3_SERVICE, GAN_GEN4_SERVICE],
    });
    this.device = device;
    const mac = await autoRetrieveMacAddress(device);
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
