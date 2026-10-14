import { CubeLink, CubeLinkKind, CubeLinkStatus } from "./cube-link";
import { DeviceInfo, LinkEvent } from "./types";
import { getNativeTransport, NativeBridgeTransport } from "./transport/native";

export type SessionSnapshot = {
  status: CubeLinkStatus;
  deviceName: string;
  battery: number | null;
  facelets: string | null;
  lastMoveSerial: number | null;
  generation: number;
  error: string;
};

type ConnectOptions = { address?: string; mac?: string; autoReconnect?: boolean; knownName?: string };
type SnapshotCallback = (snapshot: SessionSnapshot) => void;
type EventCallback = (event: LinkEvent) => void;

/** 唯一设备连接与实体状态。页面订阅不会触发重连，也不会回放既往 MOVE。 */
export class CubeSession {
  private state: SessionSnapshot = {
    status: "disconnected",
    deviceName: "",
    battery: null,
    facelets: null,
    lastMoveSerial: null,
    generation: 0,
    error: "",
  };
  private listeners = new Set<{ snapshot: SnapshotCallback; event: EventCallback }>();
  private stopEvent: () => void;
  private stopStatus: () => void;
  private reconnectStarted = false;

  constructor(private readonly link: CubeLink = new CubeLink(),
    private readonly nativeTransport: () => Pick<NativeBridgeTransport, "onScan" | "onError" | "startScan" | "stopScan"> = getNativeTransport) {
    this.stopEvent = link.onEvent((event) => {
      if (event.type === "facelets") this.state.facelets = event.facelets;
      if (event.type === "battery") this.state.battery = event.level;
      if (event.type === "move" && !event.recovered && typeof event.serial === "number") {
        this.state.lastMoveSerial = event.serial;
      }
      this.publishSnapshot();
      for (const listener of [...this.listeners]) listener.event(event);
    });
    this.stopStatus = link.onStatus((status) => {
      this.state.status = status;
      if (status === "connecting") {
        this.state.generation++;
        this.state.error = "";
        this.state.lastMoveSerial = null;
      }
      if (status === "disconnected") {
        this.state.facelets = null;
        this.state.battery = null;
        this.state.lastMoveSerial = null;
      }
      this.publishSnapshot();
    });
  }

  get snapshot(): SessionSnapshot {
    return { ...this.state };
  }

  subscribe(snapshot: SnapshotCallback, event: EventCallback): () => void {
    const listener = { snapshot, event };
    this.listeners.add(listener);
    snapshot(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  private publishSnapshot(): void {
    const current = this.snapshot;
    for (const listener of [...this.listeners]) listener.snapshot(current);
  }

  async connect(kind: CubeLinkKind, opts?: ConnectOptions): Promise<DeviceInfo> {
    try {
      const info = await this.link.connect(kind, opts);
      this.state.deviceName = info.name || opts?.knownName || "";
      this.state.error = "";
      const address = info.mac || opts?.mac || opts?.address;
      if (kind !== "mock" && address && typeof window !== "undefined") {
        try {
          window.localStorage.setItem("bleLastKind", kind);
          window.localStorage.setItem("bleLastMac", address);
          window.localStorage.setItem("bleLastName", this.state.deviceName);
        } catch {
          // 存储不可用不妨碍本次连接。
        }
      }
      this.publishSnapshot();
      return info;
    } catch (error) {
      this.state.error = (error as Error).message || String(error);
      this.publishSnapshot();
      throw error;
    }
  }

  async tryAutoReconnect(): Promise<void> {
    if (this.reconnectStarted || this.state.status !== "disconnected" || typeof window === "undefined") return;
    this.reconnectStarted = true;
    let kind: string | null;
    let address: string | null;
    let name: string | null;
    try {
      kind = window.localStorage.getItem("bleLastKind");
      address = window.localStorage.getItem("bleLastMac");
      name = window.localStorage.getItem("bleLastName");
    } catch {
      return;
    }
    if (!address || (kind !== "web" && kind !== "native")) return;
    try {
      await this.connect(kind, kind === "native"
        ? { address, knownName: name || "" }
        : { mac: address, knownName: name || "", autoReconnect: true });
      if (name && this.state.deviceName === address) {
        this.state.deviceName = name;
        this.publishSnapshot();
      }
    } catch {
      // 错误留在 snapshot，用户可再次手动连接。
    }
  }

  async disconnect(): Promise<void> {
    await this.link.disconnect();
    this.state.deviceName = "";
    this.publishSnapshot();
  }

  requestFacelets(): Promise<void> { return this.link.requestFacelets(); }
  requestBattery(): Promise<void> { return this.link.requestBattery(); }
  mockApplyFormula(moves: string): void { this.link.mockApplyFormula(moves); }

  /** 扫描窗口只借用共享传输层；关闭时撤销监听，连接会话不受影响。 */
  scanNative(onScan: (devices: { address: string; name: string }[]) => void,
    onError: (message: string) => void): () => void {
    const transport = this.nativeTransport();
    const stopScan = transport.onScan(onScan);
    const stopError = transport.onError(onError);
    transport.startScan(15000);
    return () => {
      transport.stopScan();
      stopScan();
      stopError();
    };
  }

  dispose(): void {
    this.stopEvent();
    this.stopStatus();
    this.listeners.clear();
    this.link.disconnect().catch(() => undefined);
  }
}
