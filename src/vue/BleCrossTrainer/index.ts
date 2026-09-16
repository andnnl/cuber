import { Component, Provide, Ref, Vue } from "vue-property-decorator";
import World from "../../cuber/world";
import { FACE } from "../../cuber/define";
import Viewport from "../Viewport";
import Setting from "../Setting";
import { PreferanceData, PaletteData } from "../../data";
import { CubeLink, CubeLinkKind, CubeLinkStatus, webBluetoothAvailable, nativeBridgeAvailable, getNativeTransport } from "../../ble/cube-link";
import { LinkEvent } from "../../ble/types";
import { SOLVED_FACELETS, brandFaceletsToState, isCrossDone, f2lSlotsDone } from "../../ble/facelets";
import { applyFaceletMove, applyFormulaFrom, simplifyMoves } from "../../ble/move-diff";
import { mapBaseOpsFacelets, BaseOp } from "../CrossF2LTrainer/pieces";
import Solver from "../../solver/Solver";
import * as WasmSolver from "../../wasm/WasmSolver";
import { indexedDBStorage } from "../../util/IndexedDBStorage";
import { BLE_THEME_CSS } from "./theme";

// 组件模板中的 <style> 标签会被 vue-template-compiler 剥离 (从未生效),
// 样式统一定义在 theme.ts, mounted 时注入 document.head
const THEME_STYLE_ID = "ble-cross-trainer-theme";

// 手动练习解法展示: 过滤整体转记号 (x/y/z), 层转 (含 M/E/S 中层) 保留
function manualSolutionOf(exp: string): string {
  return exp
    .trim()
    .split(/\s+/)
    .filter((m) => !/^[xyz][2']?$/.test(m))
    .join(" ");
}

// 54 串位置 → (cubelet 初始索引, FACE) 写入映射。
// 遍历顺序与 Cube.serialize() 完全一致 (URFDLB 六组各 9 字符), 先 reset 再逐贴纸
// stick 即可把 3D 场景设置为任意 54 串状态 (蓝牙魔方接入时镜像用)。
type FaceletTarget = [number, FACE];
const FACELET_TARGETS: FaceletTarget[] = (() => {
  const targets: FaceletTarget[] = [];
  // U: y=2, for z asc, for x asc
  for (let z = 0; z < 3; z++) {
    for (let x = 0; x < 3; x++) {
      targets.push([z * 9 + 2 * 3 + x, FACE.U]);
    }
  }
  // R: x=2, for y desc, for z desc
  for (let y = 2; y >= 0; y--) {
    for (let z = 2; z >= 0; z--) {
      targets.push([z * 9 + y * 3 + 2, FACE.R]);
    }
  }
  // F: z=2, for y desc, for x asc
  for (let y = 2; y >= 0; y--) {
    for (let x = 0; x < 3; x++) {
      targets.push([2 * 9 + y * 3 + x, FACE.F]);
    }
  }
  // D: y=0, for z desc, for x asc
  for (let z = 2; z >= 0; z--) {
    for (let x = 0; x < 3; x++) {
      targets.push([z * 9 + 0 * 3 + x, FACE.D]);
    }
  }
  // L: x=0, for y desc, for z asc
  for (let y = 2; y >= 0; y--) {
    for (let z = 0; z < 3; z++) {
      targets.push([z * 9 + y * 3 + 0, FACE.L]);
    }
  }
  // B: z=0, for y desc, for x desc
  for (let y = 2; y >= 0; y--) {
    for (let x = 2; x >= 0; x--) {
      targets.push([0 * 9 + y * 3 + x, FACE.B]);
    }
  }
  return targets;
})();

@Component({
  template: require("./index.html"),
  components: {
    viewport: Viewport,
    setting: Setting,
  },
})
export default class BleCrossTrainer extends Vue {
  @Provide("world")
  world: World = new World();

  @Provide("preferance")
  preferance: PreferanceData = new PreferanceData(this.world);

  @Provide("palette")
  palette: PaletteData = new PaletteData(this.world);

  @Ref("viewport")
  viewport: Viewport;

  // ---- 蓝牙连接 ----
  private link: CubeLink = new CubeLink();
  webBt: boolean = webBluetoothAvailable();
  nativeBt: boolean = nativeBridgeAvailable(); // APK 内 (BleBridge 注入 window.__bleNative)
  status: CubeLinkStatus = "disconnected";
  deviceName = "";
  battery: number | null = null;

  // ---- 扫描设备弹窗 (APK 原生传输: WebView 无系统选择器) ----
  scanDialog = false;
  scanDevices: { address: string; name: string }[] = [];
  scanStatus = "";
  private scanCbRegistered = false;

  // ---- 训练状态机: disconnected → ready → scrambling → solving → success (→ scrambling) ----
  // 手动练习新增 observing: 打乱后可整体转动观察, 首次转动才进入 solving 计时
  phase: "disconnected" | "ready" | "scrambling" | "observing" | "solving" | "success" = "disconnected";
  // 练习模式: cross = 只还原十字; xcross = 十字 + 任一 F2L 槽位 (localStorage "bleTrainMode")
  trainMode: "cross" | "xcross" = "cross";
  // 当前打乱公式 (显示给用户照着拧) 与打乱目标态 (54 串, = 魔方当前态 + 公式推演)
  scramble = "";
  private scrambleTarget = "";
  // 十字还原步数 (仅 solving 阶段计数)
  moveCount = 0;
  // 本轮用户实际走的转动记号 (solving 阶段收集, 完成后与最优解对比展示)
  private userMoves: string[] = [];
  userSolution = "";
  // WASM 对打乱态求出的十字最优解 (startSolving 时异步预求解)
  bestSolution = "";
  // 最优解求解是否已结束 (空串解法 = 十字已复原 0 步, 需与「求解中」区分)
  bestReady = false;
  // XCross 模式: 4 个槽位各自的最优解 (startSolving 时并行预求解)
  bestX: { slot: string; formula: string; steps: number }[] = [];
  bestXReady = false;
  // 本轮完成时已还原的 F2L 槽位 (xcross 模式结果高亮用)
  completedSlots: string[] = [];
  // 本轮最优解的求解基准态 (打乱目标态; skipScramble 时为当时状态), 模式切换重求用
  private solveBaseState = "";
  // 成功/失败计数: 完成 +1, solving 中点「新打乱」放弃本轮算失败 +1
  successCount = 0;
  failCount = 0;
  // 正确后自动进入下一打乱 (localStorage 持久化, 值 "1"/"0")
  autoNext = true;
  // 是否显示推荐的最优解 (localStorage 持久化, 值 "1"/"0"): 关闭时不求解也不展示, 避免剧透
  showBest = true;
  statusText = "未连接魔方";

  // ---- 计时 (data 属性 + rAF/interval 双刷新, 不能用 computed: 依赖不变会缓存冻结) ----
  private timerStart = 0;
  private running = false;
  elapsedText = "";
  private timerTick: any = null;
  private resultTimer: any = null;
  // 手动练习: 观察用时与还原用时分开计 (observing 起点 / 首次转动起点)
  observeStart = 0;
  solveStart = 0;
  // 完成后展示: 观察用时 (蓝牙模式为空不显示)
  observeText = "";

  // ---- 状态跟踪: predicted = 权威状态 + 未确认 move 推演; 权威 facelets 事件到来时校正 ----
  private predicted: string | null = null;

  // ---- Mock 演示 ----
  private solver: Solver = new Solver();
  isMock = false;
  mockInput = "";

  // ---- 手动练习 (无蓝牙): 鼠标拧 3D 魔方, 打乱直接作用于 3D 场景 ----
  isManual = false;
  // 观察/还原期间的整体转序列 (y/y'/x/z, 按时间序, history 已合并同向):
  // 整体转保留在物理状态中 (魔方停在用户当前持握姿态), 判定/求解前按此序列
  // 把状态串字符改名回打乱姿态 (中心恢复标准 URFDLB), 任意多次组合均成立
  private observedOps: BaseOp[] = [];

  mounted(): void {
    // 注入面板主题样式 (模板内 <style> 会被编译器剥离, 只能动态注入)
    if (!document.getElementById(THEME_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = THEME_STYLE_ID;
      style.textContent = BLE_THEME_CSS;
      document.head.appendChild(style);
    }
    this.autoNext = window.localStorage.getItem("bleAutoNext") !== "0";
    this.showBest = window.localStorage.getItem("bleShowBest") !== "0";
    const savedMode = window.localStorage.getItem("bleTrainMode");
    if (savedMode === "xcross") {
      this.trainMode = "xcross";
    }
    (window as any).__bleCross = this; // 临时调试
    this.link.onStatus((s) => this.onLinkStatus(s));
    this.link.onEvent((e) => this.handleEvent(e));
    // 手动练习: 每次转层动画结束 (含鼠标拧动/回弹) 后判定
    this.world.callbacks.push(() => this.onManualTwist());
    this.resize();
    this.loop();
    // 计时显示兜底刷新 (切后台时 rAF 暂停, interval 仍触发)
    this.timerTick = window.setInterval(() => {
      if (this.running) {
        this.elapsedText = this.computeElapsed();
      }
    }, 250);
    this.initSolver();
  }

  beforeDestroy(): void {
    if (this.timerTick !== null) {
      window.clearInterval(this.timerTick);
      this.timerTick = null;
    }
    if (this.resultTimer !== null) {
      window.clearTimeout(this.resultTimer);
      this.resultTimer = null;
    }
  }

  // ================= 连接 =================

  /** 连接入口: APK 内走原生扫描弹窗, 浏览器走 Web Bluetooth 系统弹窗 */
  onConnectTap(): void {
    if (this.nativeBt) {
      this.openScanDialog();
    } else if (this.webBt) {
      this.connect("web");
    }
  }

  async connect(kind: CubeLinkKind, address?: string): Promise<void> {
    if (this.status !== "disconnected") {
      return;
    }
    try {
      this.statusText = kind === "web" ? "请在弹窗中选择你的 GAN 魔方..." : "连接魔方...";
      const info = await this.link.connect(kind, address ? { address } : undefined);
      this.deviceName = info.name;
      this.isMock = kind === "mock";
      // 连接成功后首个 facelets 事件到达时自动生成第一次打乱 (见 onAuthoritative)
    } catch (err) {
      this.statusText = "连接失败: " + ((err as Error).message || String(err));
    }
  }

  /** 手动练习入口 (无蓝牙): 用鼠标拧 3D 魔方完成训练流程 */
  startManual(): void {
    if (this.status === "connected") {
      return;
    }
    this.isManual = true;
    this.deviceName = "鼠标练习 (无蓝牙)";
    this.statusText = "手动练习: 点击「新打乱」开始";
  }

  /** 退出手动练习, 恢复初始状态 */
  stopManual(): void {
    if (!this.isManual) {
      return;
    }
    this.isManual = false;
    this.deviceName = "";
    this.phase = "disconnected";
    this.running = false;
    this.scramble = "";
    this.statusText = "未连接魔方";
    const cube = this.world.cube;
    cube.twister.finish();
    cube.reset();
    cube.dirty = true;
  }

  /** 打开扫描弹窗并开始 BLE 扫描 (APK) */
  openScanDialog(): void {
    this.scanDialog = true;
    this.scanDevices = [];
    this.scanStatus = "扫描中, 请确保魔方已开机...";
    const transport = getNativeTransport();
    if (!this.scanCbRegistered) {
      this.scanCbRegistered = true;
      transport.onScan((devices) => {
        this.scanDevices = devices;
        if (this.scanDialog && devices.length > 0) {
          this.scanStatus = "点击要连接的魔方";
        }
      });
    }
    transport.startScan(15000);
    window.setTimeout(() => {
      if (this.scanDialog && this.scanDevices.length === 0) {
        this.scanStatus = "未发现魔方, 请确认已开机且靠近手机后重试";
      }
    }, 15500);
  }

  async pickDevice(address: string): Promise<void> {
    this.scanDialog = false;
    getNativeTransport().stopScan();
    await this.connect("native", address);
  }

  async disconnect(): Promise<void> {
    await this.link.disconnect();
  }

  private onLinkStatus(s: CubeLinkStatus): void {
    this.status = s;
    if (s === "connected") {
      this.phase = "ready";
      this.statusText = "已连接, 等待魔方状态...";
      // connect 流程内的首个 facelets 可能在本回调前派发 (竞态, 首包被丢):
      // 主动再请求一次全量, 确保 connected 之后必有事件到达以触发首轮打乱
      this.link.requestFacelets().catch(() => undefined);
    } else if (s === "connecting") {
      this.phase = "disconnected";
    } else {
      if (this.phase !== "disconnected") {
        this.statusText = "蓝牙连接已断开";
      }
      this.phase = "disconnected";
      this.running = false;
      this.scramble = "";
    }
  }

  // ================= 事件入口 =================

  private handleEvent(e: LinkEvent): void {
    if (e.type === "battery") {
      this.battery = e.level;
      return;
    }
    if (e.type === "facelets") {
      const valid = brandFaceletsToState(e.facelets);
      if (!valid) {
        // 串非法 (中心错位/长度不对): 请求全量重同步
        this.link.requestFacelets().catch(() => undefined);
        return;
      }
      this.onAuthoritative(valid);
      return;
    }
    if (e.type === "move") {
      this.onMoveEvent(e.move);
      return;
    }
  }

  /** 权威状态到达 (连接时全量 / 周期同步 / Mock 每步都发) */
  private onAuthoritative(facelets: string): void {
    const drift = this.predicted !== null && facelets !== this.predicted;
    this.predicted = facelets;
    if (drift) {
      // 推演与实体不一致 (丢事件/被外力转动): 以实体为准重绘 3D
      this.syncScene(facelets);
    }
    // 连接后首个 facelets 可能在 setStatus("connected") 回调前到达 (GanCubeLink.connect
    // 内 await requestFacelets 先于 CubeLink.setStatus 完成): 此时 phase 仍是
    // "connecting" 置的 "disconnected", 不能只认 "ready", 否则首包被丢弃永久卡等待
    if (this.status === "connected" && (this.phase === "ready" || this.phase === "disconnected")) {
      this.newScramble();
      return;
    }
    this.judge(facelets);
  }

  /** 物理转动事件: 推演状态 + 判定 + 3D 动画镜像 */
  private onMoveEvent(move: string): void {
    if (this.predicted) {
      const next = applyFaceletMove(this.predicted, move);
      if (!next) {
        return;
      }
      this.predicted = next;
      if (this.phase === "solving") {
        this.userMoves.push(move);
        // 步数按 HTM 口径实时化简 (魔方对 180° 转发 2 个 1/4 转事件, D2 应计 1 步)
        this.moveCount = simplifyMoves(this.userMoves).length;
      }
      this.world.cube.twister.push(move);
      this.judge(next);
    } else {
      // 尚未收到权威状态, 仅镜像动画
      this.world.cube.twister.push(move);
    }
  }

  // ================= 训练判定 =================

  /** 本轮训练目标是否达成: cross = 十字; xcross = 十字 + 任一 F2L 槽位 (角+棱) */
  private isTrainDone(state: string): boolean {
    if (!isCrossDone(state)) {
      return false;
    }
    return this.trainMode === "cross" || f2lSlotsDone(state).length > 0;
  }

  /** 从 history 全量重建整体转序列 (history 已合并同向记号, 无冗余) */
  private syncObservedOps(): void {
    this.observedOps = this.world.cube.history.list
      .filter((a) => /^[xyz]$/.test(a.sign))
      .map((a) => ({ axis: a.sign as BaseOp["axis"], times: a.reverse ? -a.times : a.times }));
  }

  /** 手动练习状态串 → 打乱姿态坐标系 (整体转只改面标签字符, 映射后中心恢复标准 URFDLB) */
  mapStateForJudge(state: string): string {
    return mapBaseOpsFacelets(state, this.observedOps);
  }

  /** 手动练习: 每次转层动画结束 (鼠标拧动/回弹) 后刷新步数并判定 */
  private onManualTwist(): void {
    if (!this.isManual) {
      return;
    }
    const cube = this.world.cube;
    // 整体转 (观察期观察、还原期调整持握) 全量累积, 供状态串映射回打乱姿态
    this.syncObservedOps();
    // 整体转改变当前视角坐标系: 最优解按新视角重求 (映射打乱基准态, 记号对应当前屏幕的面)
    const sig = JSON.stringify(this.observedOps);
    if (sig !== this.bestRotationSig && this.solveBaseState) {
      this.bestRotationSig = sig;
      this.bestSolution = "";
      this.bestReady = false;
      this.bestX = [];
      this.bestXReady = false;
      this.requestBest(this.mapStateForJudge(this.solveBaseState));
    }
    if (this.phase === "observing") {
      // 观察期整体转 (含 y 后 y' 合并抵消): 保留当前姿态继续观察, 不计步不结束观察
      const hasLayerMove = cube.history.list.some((a) => !/^[xyz]$/.test(a.sign));
      if (!hasLayerMove) {
        return;
      }
      // 首次层转: 结束观察, 开始还原计时。魔方停在用户当前持握姿态 (整体转不回正),
      // 判定/最优解由 observedOps 字符映射自动换算, 与屏幕所见完全一致
      this.phase = "solving";
      this.solveStart = Date.now();
      this.timerStart = this.solveStart;
      this.statusText =
        this.trainMode === "xcross"
          ? "XCross 进行中: 还原十字并顺带完成任一组 F2L"
          : "十字进行中: 把 4 条底棱还原到底面";
      // 落入下方判定 (首步层转已在 history 中)
    }
    if (this.phase !== "solving") {
      return;
    }
    // history 自动合并相邻同面 (R,R→R2 / R,R'→抵消), moves 排除整体转, 即 HTM 口径;
    // 解法展示过滤整体转记号 (moves 已排除, 展示层对齐)
    this.moveCount = cube.history.moves;
    this.userSolution = manualSolutionOf(cube.history.exp);
    // 整体转只改字符 (面标签), 按映射表改名回打乱姿态后判定 (中心恢复标准 URFDLB)
    const state = mapBaseOpsFacelets(cube.serialize(), this.observedOps);
    if (this.isTrainDone(state)) {
      this.finishSuccess(state);
    }
  }

  private judge(state: string): void {
    if (this.phase === "scrambling") {
      if (this.scrambleTarget && state === this.scrambleTarget) {
        this.startSolving();
      }
      return;
    }
    if (this.phase === "solving") {
      if (this.isTrainDone(state)) {
        this.finishSuccess(state);
      }
      return;
    }
    if (this.phase === "success") {
      // 展示窗口内权威状态显示目标其实未达成 (推演漂移误判): 回退继续计时
      if (!this.isTrainDone(state)) {
        this.phase = "solving";
        this.timerStart = Date.now();
        this.running = true;
        this.statusText = this.trainMode === "xcross" ? "XCross 进行中 (状态已校正)" : "十字进行中 (状态已校正)";
      }
      return;
    }
  }

  private startSolving(baseState?: string): void {
    this.phase = "solving";
    this.moveCount = 0;
    this.userMoves = [];
    this.userSolution = "";
    this.completedSlots = [];
    this.bestSolution = "";
    this.bestReady = false;
    this.bestX = [];
    this.bestXReady = false;
    this.observeText = "";
    this.timerStart = Date.now();
    this.running = true;
    this.statusText =
      this.trainMode === "xcross"
        ? "XCross 进行中: 还原十字并顺带完成任一组 F2L"
        : "十字进行中: 把 4 条底棱还原到底面";
    // 记录求解基准态 (打乱目标态; skipScramble/手动模式为当时状态), 模式切换时据此重求
    this.solveBaseState = baseState || this.scrambleTarget || this.predicted || "";
    // 记录请求最优解时的整体转签名: 手动练习后续整体转会改变当前视角坐标系, 需据此重求
    this.bestRotationSig = JSON.stringify(this.observedOps);
    // 对打乱态预求最优解 (异步, 完成前结果区显示「求解中…」)。
    // 手动练习中整体转后视角坐标系变化, 最优解按映射后的基准态求出, 记号对应当前屏幕的面
    if (this.solveBaseState) {
      this.requestBest(this.mapStateForJudge(this.solveBaseState));
    }
  }

  /** 按当前模式求解最优解 (cross 单组 / xcross 4 组槽位并行); 关闭「显示最优解」时不求 */
  private requestBest(state: string): void {
    if (!this.showBest) {
      return;
    }
    if (this.trainMode === "xcross") {
      this.requestBestXCross(state);
    } else {
      this.requestBestSolution(state);
    }
  }

  /** 对指定状态求十字最优解 (失败/出错时留空, 展示层显示占位) */
  private bestReqId = 0;
  /** 上次请求最优解时的整体转签名 (observedOps 序列化): 变化则需按新视角重求 */
  private bestRotationSig = "[]";
  private async requestBestSolution(state: string): Promise<void> {
    const reqId = ++this.bestReqId;
    try {
      const solutions = await this.solver.solveCross(state, 1, 8);
      // 慢速求解 (BFS fallback) 可能耗时数秒: 若期间已开始新一轮则作废本次结果
      if (reqId !== this.bestReqId) {
        return;
      }
      const best = ((solutions && solutions[0]) || "").trim();
      if (best.indexOf("error") !== 0) {
        this.bestSolution = best; // 空串 = 打乱态十字已复原, 最优 0 步
      }
    } catch (e) {
      console.error("[BleCrossTrainer] 最优解求解失败", e);
    } finally {
      if (reqId === this.bestReqId) {
        this.bestReady = true;
      }
    }
  }

  /** XCross: 对 4 个槽位并行各求一组最优解 (仅 WASM 支持, 无 JS 回退) */
  private async requestBestXCross(state: string): Promise<void> {
    const reqId = ++this.bestReqId;
    try {
      const slots = ["FL", "FR", "BL", "BR"];
      const results = await Promise.all(
        slots.map(async (slot) => {
          try {
            const sols = await this.solver.solveXCross(state, slot, 1);
            const best = ((sols && sols[0]) || "").trim();
            const ok = best && best.indexOf("error") !== 0;
            return { slot, formula: ok ? best : "", steps: ok ? best.split(/\s+/).length : 0 };
          } catch (e) {
            console.error(`[BleCrossTrainer] XCross (${slot}) 求解失败`, e);
            return { slot, formula: "", steps: 0 };
          }
        })
      );
      if (reqId !== this.bestReqId) {
        return;
      }
      this.bestX = results;
    } finally {
      if (reqId === this.bestReqId) {
        this.bestXReady = true;
      }
    }
  }

  /** Cross 模式最优解步数 */
  get bestSteps(): number {
    return this.bestSolution ? this.bestSolution.trim().split(/\s+/).length : 0;
  }

  private finishSuccess(state: string): void {
    this.running = false;
    this.phase = "success";
    if (this.isManual) {
      // 手动模式: 记号来自 3D 魔方 history (已在 onManualTwist 实时刷新, 过滤整体转)
      this.userSolution = manualSolutionOf(this.world.cube.history.exp);
      this.moveCount = this.userSolution ? this.userSolution.split(/\s+/).length : 0;
    } else {
      this.userSolution = simplifyMoves(this.userMoves).join(" ");
      this.moveCount = this.userSolution ? this.userSolution.split(/\s+/).length : 0;
    }
    this.completedSlots = this.trainMode === "xcross" ? f2lSlotsDone(state) : [];
    this.successCount++;
    this.statusText = "✅ " + (this.trainMode === "xcross" ? "XCross 完成!" : "十字完成!");
    this.elapsedText = this.computeElapsed(); // 固化最终还原用时
    if (this.isManual) {
      // 手动模式: 固化观察用时 (结果区与还原用时分开展示)
      this.observeText = this.solveStart
        ? ((this.solveStart - this.observeStart) / 1000).toFixed(1) + "s"
        : "0.0s";
    }
    if (!this.isManual) {
      this.link.requestFacelets().catch(() => undefined); // 请求权威确认
    }
    if (this.resultTimer !== null) {
      window.clearTimeout(this.resultTimer);
    }
    // 勾选「自动下轮」时 2.5s 展示结果后自动生成下一次打乱; 未勾选则等用户手动点「新打乱」
    if (this.autoNext) {
      this.resultTimer = window.setTimeout(() => {
        this.resultTimer = null;
        this.newScramble();
      }, 2500);
    }
  }

  // ================= 打乱 =================

  /** 新一轮: 蓝牙模式以魔方当前物理状态为基准等待拧到目标态; 手动模式直接打乱 3D */
  newScramble(): void {
    if (this.status !== "connected" && !this.isManual) {
      return;
    }
    // solving 中主动放弃本轮: 计一次失败
    if (this.phase === "solving") {
      this.failCount++;
      this.running = false;
    }
    if (this.resultTimer !== null) {
      window.clearTimeout(this.resultTimer);
      this.resultTimer = null;
    }
    if (this.isManual) {
      // 手动模式: 3D 魔方直接打乱 (setup 瞬时完成, history 清空后记号从拧动开始累计),
      // 打乱后先进入观察阶段: 可 y/z/x 整体转动观察, 首次转动才开始还原计时
      const cube = this.world.cube;
      const formula = cube.twister.scrambler();
      this.scramble = formula;
      this.scrambleTarget = "";
      this.predicted = null;
      this.elapsedText = "";
      this.observeText = "";
      this.observedOps = [];
      this.running = false;
      cube.twister.setup(formula);
      this.startSolving(cube.serialize());
      this.phase = "observing";
      this.observeStart = Date.now();
      this.solveStart = 0;
      this.running = true; // 驱动观察计时显示
      this.statusText = "观察阶段: 可整体转动魔方观察, 首次转动开始还原计时";
      return;
    }
    const base = this.predicted ?? SOLVED_FACELETS;
    const formula = this.world.cube.twister.scrambler();
    this.scramble = formula;
    this.scrambleTarget = applyFormulaFrom(base, formula);
    this.phase = "scrambling";
    this.moveCount = 0;
    this.running = false;
    this.elapsedText = "";
    this.statusText = "请按公式打乱魔方 (白上绿前持握, 字母对应方向)";
  }

  /** 重置本轮: 手动模式瞬时回打乱态重新观察; 蓝牙模式 (solving 中) 重置还原计时并刷新权威状态 */
  resetRound(): void {
    if (this.isManual) {
      if (this.phase !== "observing" && this.phase !== "solving" && this.phase !== "success") {
        return;
      }
      if (this.resultTimer !== null) {
        window.clearTimeout(this.resultTimer);
        this.resultTimer = null;
      }
      const cube = this.world.cube;
      cube.twister.setup(this.scramble); // 瞬时回打乱态 (setup 内部清空 history)
      this.observedOps = [];
      this.elapsedText = "";
      this.observeText = "";
      this.userSolution = "";
      this.moveCount = 0;
      this.startSolving(cube.serialize()); // 基准态不变, 刷新最优解展示
      this.phase = "observing";
      this.observeStart = Date.now();
      this.solveStart = 0;
      this.running = true;
      this.statusText = "已重置回打乱态: 可整体转动观察, 首次转动开始还原计时";
      return;
    }
    // 蓝牙模式: solving 中重置还原计时/已记步数, 重新收集, 并请求权威 facelets 刷新判定
    if (this.phase === "solving") {
      this.moveCount = 0;
      this.userSolution = "";
      this.userMoves = [];
      this.solveStart = Date.now();
      this.timerStart = this.solveStart;
      this.running = true;
      this.statusText = "已重置计时: 继续还原十字";
      this.link.requestFacelets().catch(() => undefined);
    }
  }

  /** 「自动下轮」勾选变更: 持久化偏好 */
  saveAutoNext(): void {
    window.localStorage.setItem("bleAutoNext", this.autoNext ? "1" : "0");
  }

  /** 「显示最优解」勾选变更: 持久化; 中途开启时补求本轮最优解 (观察/还原/完成阶段都补) */
  saveShowBest(): void {
    window.localStorage.setItem("bleShowBest", this.showBest ? "1" : "0");
    const phase = this.phase;
    if (
      this.showBest &&
      (phase === "observing" || phase === "solving" || phase === "success") &&
      this.solveBaseState &&
      !this.bestReady &&
      !this.bestXReady
    ) {
      this.requestBest(this.mapStateForJudge(this.solveBaseState));
    }
  }

  /** 练习模式切换: 持久化 + 重置最优解展示; solving 中切换则按本轮基准态重求 */
  saveTrainMode(): void {
    window.localStorage.setItem("bleTrainMode", this.trainMode);
    this.bestSolution = "";
    this.bestReady = false;
    this.bestX = [];
    this.bestXReady = false;
    if (this.phase === "solving" && this.solveBaseState) {
      // 手动练习整体转后按当前视角坐标系重求 (BLE 模式 observedOps 为空, 映射恒等)
      this.requestBest(this.mapStateForJudge(this.solveBaseState));
    }
  }

  /** 跳过打乱匹配, 直接开始十字 (持握方向不一致导致永远匹配不上时的兜底) */
  skipScramble(): void {
    if (this.phase !== "scrambling") {
      return;
    }
    this.scrambleTarget = "";
    this.startSolving();
    // 当前状态十字可能已完成 (如复原态直接跳过): 立即判定一次
    if (this.predicted) {
      this.judge(this.predicted);
    }
  }

  // ================= 3D 场景同步 =================

  /** 把 3D 场景直接设置为指定 54 串状态 (reset 后按 serialize 同序逐贴纸上色) */
  private syncScene(facelets: string): void {
    const cube = this.world.cube;
    cube.twister.finish();
    cube.reset();
    for (let i = 0; i < 54; i++) {
      const target = FACELET_TARGETS[i];
      cube.stick(target[0], target[1], facelets[i]);
    }
    cube.dirty = true;
  }

  // ================= 计时 =================

  private computeElapsed(): string {
    // 观察阶段显示观察计时; 还原阶段显示还原计时 (从首次转动起算)
    const base = this.phase === "observing" ? this.observeStart : this.solveStart || this.timerStart;
    const seconds = Math.max(0, (Date.now() - base) / 1000);
    return seconds.toFixed(1) + "s";
  }

  // ================= Mock 演示 (无真机走通全流程) =================

  mockApply(): void {
    const formula = this.mockInput.trim();
    if (formula) {
      this.link.mockApplyFormula(formula);
      this.mockInput = "";
    }
  }

  /** 自动演示: 注入打乱 → WASM 求十字 → 逐步转动 → 判定完成 → 自动下一轮 */
  async mockDemo(): Promise<void> {
    if (this.status !== "connected" || !this.isMock) {
      return;
    }
    if (this.phase !== "scrambling") {
      this.newScramble();
    }
    this.link.mockApplyFormula(this.scramble); // 触发打乱匹配 → 自动开始计时
    // 事件经 async driver (微任务) 派发, flush 后 predicted 才是打乱后的真实状态
    await new Promise((resolve) => setTimeout(resolve, 50));
    const state = this.predicted ?? "";
    if (!state) {
      return;
    }
    const solutions = await this.solver.solveCross(state, 1, 8);
    const solution = ((solutions && solutions[0]) || "").trim();
    if (solution.indexOf("error") === 0) {
      this.statusText = "演示: 十字求解失败 " + solution;
      return;
    }
    if (!solution) {
      return; // 十字已复原 (空解法), 判定链路会自行收敛
    }
    for (const token of solution.split(/\s+/)) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      this.link.mockApplyFormula(token);
    }
  }

  // ================= 求解器表加载 (仅演示用) =================

  private async initSolver(): Promise<void> {
    try {
      await WasmSolver.initWasm();
      // 加载优先级: 内置 bin (随包分发) > IndexedDB 缓存 > 现场生成
      if (await this.loadBundledTable()) {
        return;
      }
      await indexedDBStorage.init();
      const cached = await indexedDBStorage.loadTable();
      if (cached) {
        try {
          await WasmSolver.loadTableFromBytes(cached);
        } catch (e) {
          console.error("[BleCrossTrainer] 加载缓存搜索表失败", e);
          await this.generateWasmTable();
        }
      } else {
        await this.generateWasmTable();
      }
    } catch (e) {
      console.error("[BleCrossTrainer] WASM 初始化失败, 演示将使用内置 BFS", e);
    }
  }

  private async loadBundledTable(): Promise<boolean> {
    try {
      const resp = await fetch("cube_cross_table.bin");
      if (!resp.ok) {
        return false;
      }
      const bytes = new Uint8Array(await resp.arrayBuffer());
      await WasmSolver.loadTableFromBytes(bytes);
      return true;
    } catch (e) {
      return false;
    }
  }

  private async generateWasmTable(): Promise<void> {
    try {
      await WasmSolver.generateTable(8);
      const bytes = await WasmSolver.getTableBytes();
      await indexedDBStorage.saveTable(bytes);
    } catch (e) {
      console.error("[BleCrossTrainer] 生成搜索表失败", e);
    }
  }

  // ================= 布局 =================

  width = 0;
  height = 0;
  size = 0;

  onResize(): void {
    this.resize();
  }

  resize(): void {
    this.width = document.documentElement.clientWidth;
    this.height = document.documentElement.clientHeight;
    this.size = Math.ceil(Math.min(this.width / 6, this.height / 12));
    this.viewport?.resize(this.width, this.height - this.size * 2.4);
  }

  loop(): void {
    requestAnimationFrame(this.loop.bind(this));
    if (this.running) {
      this.elapsedText = this.computeElapsed();
    }
    this.viewport?.draw();
  }

  // ================= 帮助 =================

  helpDialog = false;
}
