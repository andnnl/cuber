// GAN Gen2 模拟魔方传输层 (测试/无真机开发用):
// 内部维护 cubie 状态, 命令帧走真实 AES 加解密回路, 通知帧按 Gen2 位布局构造,
// 与 GanCubeLink 组成完整链路测试 (加解密 + 驱动解析 + 事件转换)。

import { BleTransport, DeviceInfo } from "./types";
import { applyCubieMove, CubieState, solvedCubie } from "./move-diff";
import { GanGen2CubeEncrypter } from "./protocols/vendor/gan-cube-encrypter";
import { GAN_GEN2_SERVICE } from "./protocols/vendor/gan-cube-definitions";
import { macToSalt } from "./protocols/gan";

/** "R" / "R'" / "R2" → (面, 次数) */
function parseMove(move: string): { face: string; amount: number } {
  const face = move.charAt(0);
  const suffix = move.slice(1);
  const amount = suffix === "2" ? 2 : suffix === "'" ? 3 : 1;
  return { face, amount };
}

/** 大端位写入器 (与 GanProtocolMessageView 的读取方式互逆) */
class BitWriter {
  private bytes: Uint8Array;

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
  }

  write(bitOffset: number, bitLength: number, value: number): void {
    for (let i = 0; i < bitLength; i++) {
      const bit = (value >> (bitLength - 1 - i)) & 1;
      const pos = bitOffset + i;
      if (bit) {
        this.bytes[pos >> 3] |= 0x80 >> (pos & 7);
      }
    }
  }

  toBytes(): Uint8Array {
    return this.bytes;
  }
}

export class MockGanCubeTransport implements BleTransport {
  readonly kind = "mock" as const;

  private readonly mac: string;
  private readonly name: string;
  private state: CubieState = solvedCubie();
  private serial = 0;
  private encrypter: GanGen2CubeEncrypter | null = null;
  private bytesCb: ((data: Uint8Array) => void) | null = null;
  private disconnectCb: (() => void) | null = null;
  private connected = false;
  private pending: Uint8Array[] = []; // 回调注册前的帧缓冲

  // 供测试断言的统计
  public movesApplied: string[] = [];

  constructor(name = "GAN356 i Plus (Mock)", mac = "AA:BB:CC:DD:EE:FF") {
    this.name = name;
    this.mac = mac;
  }

  async connect(): Promise<DeviceInfo> {
    this.encrypter = new GanGen2CubeEncrypter(
      new Uint8Array([0x01, 0x02, 0x42, 0x28, 0x31, 0x91, 0x16, 0x07, 0x20, 0x05, 0x18, 0x54, 0x42, 0x11, 0x12, 0x53]),
      new Uint8Array([0x11, 0x03, 0x32, 0x28, 0x21, 0x01, 0x76, 0x27, 0x20, 0x95, 0x78, 0x14, 0x32, 0x12, 0x02, 0x43]),
      macToSalt(this.mac)
    );
    this.connected = true;
    this.pending = [];
    return {
      name: this.name,
      brand: "GAN",
      mac: this.mac,
      serviceUuids: [GAN_GEN2_SERVICE],
    };
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      this.connected = false;
      if (this.disconnectCb) {
        this.disconnectCb();
      }
    }
  }

  onBytes(cb: (data: Uint8Array) => void): void {
    this.bytesCb = cb;
    // 派发缓冲帧
    for (const frame of this.pending) {
      cb(frame);
    }
    this.pending = [];
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCb = cb;
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.encrypter) {
      throw new Error("Mock 未连接");
    }
    const plain = this.encrypter.decrypt(bytes);
    switch (plain[0]) {
      case 0x04: // REQUEST_FACELETS
        this.sendFrame(this.buildFaceletsFrame());
        break;
      case 0x09: // REQUEST_BATTERY
        this.sendFrame(this.buildBatteryFrame(87));
        break;
      case 0x05: // REQUEST_HARDWARE
        this.sendFrame(this.buildHardwareFrame("GANMOCK1"));
        break;
      default:
        break; // 未知命令忽略
    }
  }

  /** 测试驱动: 物理转动 (记号与引擎一致), 产生 MOVE + FACELETS 通知 */
  applyMove(move: string): void {
    if (!this.connected) {
      throw new Error("Mock 未连接");
    }
    const token = move.trim();
    const { face, amount } = parseMove(token);
    if ("URFDLB".indexOf(face) < 0) {
      throw new Error(`非法转动: ${move}`);
    }
    if (amount === 2) {
      // 180° = 两个连续 1/4 转事件
      this.state = applyCubieMove(this.state, face, 1);
      this.serial = (this.serial + 1) & 0xff;
      this.sendFrame(this.buildMoveFrame(face, false));
      this.state = applyCubieMove(this.state, face, 1);
      this.serial = (this.serial + 1) & 0xff;
      this.sendFrame(this.buildMoveFrame(face, false));
      this.movesApplied.push(token);
    } else {
      this.state = applyCubieMove(this.state, face, amount);
      this.serial = (this.serial + 1) & 0xff;
      this.sendFrame(this.buildMoveFrame(face, amount === 3));
      this.movesApplied.push(token);
    }
    this.sendFrame(this.buildFaceletsFrame());
  }

  /** 测试驱动: 按空格分隔公式连续转动 */
  applyFormula(moves: string): void {
    for (const token of moves.trim().split(/\s+/)) {
      if (token) {
        this.applyMove(token);
      }
    }
  }

  /** 测试驱动: 直接判定内部 cubie 状态是否复原十字 */
  get facelets(): string {
    return this.cubieToFacelets(this.state);
  }

  private cubieToFacelets(s: CubieState): string {
    // 复用 move-diff 的映射逻辑: 经 applyCubieMove 恒等往返即可由 toFacelets 导出,
    // 这里直接内联 vendor 同款映射 (CORNER/EDGE_FACELET_MAP 与 move-diff 相同)
    const C = [
      [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
      [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
    ];
    const E = [
      [5, 10], [7, 19], [3, 37], [1, 46],
      [32, 16], [28, 25], [30, 43], [34, 52],
      [23, 12], [21, 41], [50, 39], [48, 14],
    ];
    const faces = "URFDLB";
    const out: string[] = [];
    for (let i = 0; i < 54; i++) {
      out[i] = faces[Math.floor(i / 9)];
    }
    for (let i = 0; i < 8; i++) {
      for (let p = 0; p < 3; p++) {
        out[C[i][(p + s.co[i]) % 3]] = faces[Math.floor(C[s.cp[i]][p] / 9)];
      }
    }
    for (let i = 0; i < 12; i++) {
      for (let p = 0; p < 2; p++) {
        out[E[i][(p + s.eo[i]) % 2]] = faces[Math.floor(E[s.ep[i]][p] / 9)];
      }
    }
    return out.join("");
  }

  private sendFrame(frame: Uint8Array): void {
    if (!this.encrypter) {
      return;
    }
    const encrypted = this.encrypter.encrypt(frame);
    if (this.bytesCb) {
      this.bytesCb(encrypted);
    } else {
      this.pending.push(encrypted);
    }
  }

  /** Gen2 FACELETS 帧: 类型4b | serial8b | cp7×3b | co7×2b | ep11×4b | eo11×1b (共102b, 补齐20字节) */
  private buildFaceletsFrame(): Uint8Array {
    const w = new BitWriter(20);
    w.write(0, 4, 0x04);
    w.write(4, 8, this.serial);
    for (let i = 0; i < 7; i++) {
      w.write(12 + i * 3, 3, this.state.cp[i]);
    }
    for (let i = 0; i < 7; i++) {
      w.write(33 + i * 2, 2, this.state.co[i]);
    }
    for (let i = 0; i < 11; i++) {
      w.write(47 + i * 4, 4, this.state.ep[i]);
    }
    for (let i = 0; i < 11; i++) {
      w.write(91 + i, 1, this.state.eo[i]);
    }
    return w.toBytes();
  }

  /** Gen2 MOVE 帧: 类型4b | serial8b | face4b | direction1b */
  private buildMoveFrame(face: string, ccw: boolean): Uint8Array {
    const w = new BitWriter(20);
    w.write(0, 4, 0x02);
    w.write(4, 8, this.serial);
    w.write(12, 4, "URFDLB".indexOf(face));
    w.write(16, 1, ccw ? 1 : 0);
    return w.toBytes();
  }

  private buildBatteryFrame(level: number): Uint8Array {
    const w = new BitWriter(20);
    w.write(0, 4, 0x09);
    w.write(8, 8, level);
    return w.toBytes();
  }

  private buildHardwareFrame(name: string): Uint8Array {
    const w = new BitWriter(20);
    w.write(0, 4, 0x05);
    w.write(8, 8, 1); // hwMajor
    w.write(16, 8, 0); // hwMinor
    w.write(24, 8, 3); // swMajor
    w.write(32, 8, 2); // swMinor
    w.write(104, 1, 0); // gyroSupported
    for (let i = 0; i < 8 && i < name.length; i++) {
      w.write(i * 8 + 40, 8, name.charCodeAt(i));
    }
    return w.toBytes();
  }
}
