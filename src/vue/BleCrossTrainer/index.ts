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
import Solver from "../../solver/Solver";
import * as WasmSolver from "../../wasm/WasmSolver";
import { indexedDBStorage } from "../../util/IndexedDBStorage";
import { BLE_THEME_CSS } from "./theme";

// 组件模板中的 <style> 标签会被 vue-template-compiler 剥离 (从未生效),
// 样式统一定义在 theme.ts, mounted 时注入 document.head
const THEME_STYLE_ID = "ble-cross-trainer-theme";

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
  phase: "disconnected" | "ready" | "scrambling" | "solving" | "success" = "disconnected";
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
  statusText = "未连接魔方";

  // ---- 计时 (data 属性 + rAF/interval 双刷新, 不能用 computed: 依赖不变会缓存冻结) ----
  private timerStart = 0;
  private running = false;
  elapsedText = "";
  private timerTick: any = null;
  private resultTimer: any = null;

  // ---- 状态跟踪: predicted = 权威状态 + 未确认 move 推演; 权威 facelets 事件到来时校正 ----
  private predicted: string | null = null;

  // ---- Mock 演示 ----
  private solver: Solver = new Solver();
  isMock = false;
  mockInput = "";

  mounted(): void {
    // 注入面板主题样式 (模板内 <style> 会被编译器剥离, 只能动态注入)
    if (!document.getElementById(THEME_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = THEME_STYLE_ID;
      style.textContent = BLE_THEME_CSS;
      document.head.appendChild(style);
    }
    this.autoNext = window.localStorage.getItem("bleAutoNext") !== "0";
    const savedMode = window.localStorage.getItem("bleTrainMode");
    if (savedMode === "xcross") {
      this.trainMode = "xcross";
    }
    (window as any).__bleCross = this; // 临时调试
    this.link.onStatus((s) => this.onLinkStatus(s));
    this.link.onEvent((e) => this.handleEvent(e));
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

  private startSolving(): void {
    this.phase = "solving";
    this.moveCount = 0;
    this.userMoves = [];
    this.userSolution = "";
    this.completedSlots = [];
    this.bestSolution = "";
    this.bestReady = false;
    this.bestX = [];
    this.bestXReady = false;
    this.timerStart = Date.now();
    this.running = true;
    this.statusText =
      this.trainMode === "xcross"
        ? "XCross 进行中: 还原十字并顺带完成任一组 F2L"
        : "十字进行中: 把 4 条底棱还原到底面";
    // 记录求解基准态 (打乱目标态; skipScramble 时为当时状态), 模式切换时据此重求
    this.solveBaseState = this.scrambleTarget || this.predicted || "";
    // 对打乱态预求最优解 (异步, 完成前结果区显示「求解中…」)
    if (this.solveBaseState) {
      this.requestBest(this.solveBaseState);
    }
  }

  /** 按当前模式求解最优解 (cross 单组 / xcross 4 组槽位并行) */
  private requestBest(state: string): void {
    if (this.trainMode === "xcross") {
      this.requestBestXCross(state);
    } else {
      this.requestBestSolution(state);
    }
  }

  /** 对指定状态求十字最优解 (失败/出错时留空, 展示层显示占位) */
  private bestReqId = 0;
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
    this.userSolution = simplifyMoves(this.userMoves).join(" ");
    this.moveCount = this.userSolution ? this.userSolution.split(/\s+/).length : 0;
    this.completedSlots = this.trainMode === "xcross" ? f2lSlotsDone(state) : [];
    this.successCount++;
    this.statusText = "✅ " + (this.trainMode === "xcross" ? "XCross 完成!" : "十字完成!");
    this.elapsedText = this.computeElapsed(); // 固化最终用时
    this.link.requestFacelets().catch(() => undefined); // 请求权威确认
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

  /** 新一轮: 以魔方当前物理状态为基准生成打乱公式, 等待用户拧到目标态 */
  newScramble(): void {
    if (this.status !== "connected") {
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

  /** 「自动下轮」勾选变更: 持久化偏好 */
  saveAutoNext(): void {
    window.localStorage.setItem("bleAutoNext", this.autoNext ? "1" : "0");
  }

  /** 练习模式切换: 持久化 + 重置最优解展示; solving 中切换则按本轮基准态重求 */
  saveTrainMode(): void {
    window.localStorage.setItem("bleTrainMode", this.trainMode);
    this.bestSolution = "";
    this.bestReady = false;
    this.bestX = [];
    this.bestXReady = false;
    if (this.phase === "solving" && this.solveBaseState) {
      this.requestBest(this.solveBaseState);
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
    const seconds = Math.max(0, (Date.now() - this.timerStart) / 1000);
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
