// 蓝牙智能魔方抽象层类型定义
// 传输层 (Web Bluetooth / Android 原生桥 / Mock) 与协议层 (GAN/Giiker/MoYu) 解耦:
// 传输层只负责字节流, 协议层负责解密与解码

/** 魔方事件 (已解码, 面序为项目 serialize 同款 URFDLB×9 布局) */
export type LinkEvent =
  | { type: "facelets"; facelets: string }
  | { type: "move"; move: string }
  | { type: "battery"; level: number }
  | { type: "hardware"; name?: string; softwareVersion?: string };

/** 已支持的魔方品牌 */
export type CubeBrand = "GAN" | "GAN Gen1";

export interface DeviceInfo {
  name: string;
  brand: string;
  /** 媒体访问控制地址 (Gen2+ 加密 salt 需要; 原生传输直接取自广播, Web 侧靠 watchAdvertisements) */
  mac?: string;
  /** GATT 主服务 UUID (用于协议代际识别; Mock/原生直接给出, Web 连接后枚举) */
  serviceUuids?: string[];
}

/**
 * 传输层接口: 只负责 GATT 字节流与连接生命周期
 * - connect: 浏览器 = 系统配对弹窗 (需用户手势); 原生 = 按 address 连接 (先 requestScan)
 * - onBytes 收到的是协议原始通知帧 (可能是加密的, 由协议层解密)
 */
export interface BleTransport {
  readonly kind: "web" | "native" | "mock";
  connect(opts?: { address?: string }): Promise<DeviceInfo>;
  disconnect(): Promise<void>;
  onBytes(cb: (data: Uint8Array) => void): void;
  onDisconnect(cb: () => void): void;
  /** 写特征 (协议命令帧, 协议层负责加密) */
  write(bytes: Uint8Array): Promise<void>;
  /** 仅原生: 扫描请求与扫描结果 (WebView 无系统选择器, 设备列表由 JS 弹窗展示) */
  requestScan?(timeoutMs: number): Promise<void>;
  onScan?(cb: (devices: { address: string; name: string }[]) => void): void;
}

/** 协议注册表条目 */
export interface ProtocolMeta {
  brand: string;
  serviceUuid: string;
  /** 需订阅的通知特征 (GAN 需要 state + moves 两个) */
  notifyUuids: string[];
  /** 命令写特征 (请求 facelets/电量等) */
  writeUuid?: string;
  /** 是否已实现解析 */
  supported: boolean;
}

/** 扫描/连接过程中的状态回调 */
export type LinkStatus =
  | "disconnected"
  | "connecting"
  | "scanning"
  | "connected";
