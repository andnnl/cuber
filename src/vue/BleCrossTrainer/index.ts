import { Component, Provide, Ref, Vue } from "vue-property-decorator";
import World from "../../cuber/world";
import { FACE } from "../../cuber/define";
import Viewport from "../Viewport";
import Setting from "../Setting";
import { PreferanceData, PaletteData } from "../../data";
import { CubeLink, CubeLinkKind, CubeLinkStatus, webBluetoothAvailable, nativeBridgeAvailable, getNativeTransport } from "../../ble/cube-link";
import { LinkEvent } from "../../ble/types";
import { SOLVED_FACELETS, brandFaceletsToState, isCrossDone, f2lSlotsDone } from "../../ble/facelets";
import { applyFaceletMove, applyFormulaFrom, simplifyMoves, z2Move, toTrainFrame } from "../../ble/move-diff";
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

// 训练帧槽位名 → 物理(显示)帧槽位名: 训练帧变换 T 为 z2 视角 (L↔R, F/B 不变),
// XCross 解法/完成槽位按训练帧判定 (如 FL), 展示换回物理帧名 (如 FR)
function slotToPhysical(slot: string): string {
  return slot.charAt(1) === "L" ? slot.charAt(0) + "R" : slot.charAt(0) + "L";
}

// 白十字或黄十字是否任一完成 (核心帧黄十字直判 + 训练帧白十字, 见 toTrainFrame)
function hasAnyCrossDone(state: string): boolean {
  return isCrossDone(state) || isCrossDone(toTrainFrame(state));
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

  // ---- 手动 MAC 输入 (Web Bluetooth watchAdvertisements 失败时的兜底) ----
  // 魔方底盖 / 电池仓通常有印, 用户填一次后 localStorage 持久化复用
  manualMac = "";
  macInputOpen = false;

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
  // 本轮用户实际走的转动记号 (solving 阶段收集, 物理帧, 完成后化简展示 userSolutionText)
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
  // 起始态十字已完成时置位 (自动下轮直接开始/完成态跳过): 须先观察到十字被拆散,
  // 成功判定才生效, 防止尚未打乱就再次误判成功
  private needBreak = false;
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

  // ---- z2 姿态 (同 CrossF2L 默认 3D): 默认 (false) 3D 按物理原样显示 (白顶绿前);
  // z2 按钮按下 (true) 后 3D 魔方整体 z2 翻转动画成 黄顶绿前, 转动/公式/解法展示
  // 同步做 z2 共轭换名 (U↔D, R↔L)。内部状态 (predicted/打乱/判定) 恒为物理帧,
  // 切换视角不改写任何状态数据 ----
  z2On = false;

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
    // 与 CrossF2L mounted 一致: 把存档的显示偏好与配色刷到 3D 场景
    // (不刷的话材质停留在原版 COLORS: U=黄 → 打开就是黄顶, 而 CrossF2L 是白顶)。
    // 须包 $nextTick (CrossF2L 同款写法): 同步调用时 preferance 的 dark setter 会访问
    // 入口 vm, 而根实例此刻尚未构造完成 (TDZ ReferenceError), mounted 中断 → 3D 不渲染
    this.$nextTick(() => {
      this.preferance.refresh();
      this.palette.refresh();
      // 训练器基准显示 = 白顶绿前 (同 CrossF2L「默认」预设)。原版 COLORS 的 U 面是黄色,
      // 配色存档为空/版本不符被丢弃时 3D 会显示黄顶, 与硬件白顶帧矛盾 → 自动切回「默认」预设
      const uColor = this.palette.getColor("U");
      const rgb = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(uColor.trim());
      if (rgb) {
        const r = parseInt(rgb[1], 16);
        const g = parseInt(rgb[2], 16);
        const b = parseInt(rgb[3], 16);
        if (r > 200 && g > 150 && b < 100) {
          this.palette.applyPreset("默认"); // 白顶黄底 (U=#F0F0F0), 持久化, 用户仍可在配色菜单改
          console.log("[配色] 检测到 U 面为黄色 (会显示成黄顶), 已自动切换为「默认」白顶预设");
        }
      }
    });
    this.autoNext = window.localStorage.getItem("bleAutoNext") !== "0";
    this.showBest = window.localStorage.getItem("bleShowBest") !== "0";
    const savedMode = window.localStorage.getItem("bleTrainMode");
    if (savedMode === "xcross") {
      this.trainMode = "xcross";
    }
    // 持久化的手动 MAC (用户上次填写过, 下次复用避免再次输入)
    this.manualMac = window.localStorage.getItem("bleManualMac") || "";
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
    this.tryAutoReconnect();
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
    if (this.stateTimer !== null) {
      window.clearTimeout(this.stateTimer);
      this.stateTimer = null;
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

  async connect(kind: CubeLinkKind, opts?: { address?: string; mac?: string; autoReconnect?: boolean; knownName?: string }): Promise<void> {
    if (this.status !== "disconnected") {
      return;
    }
    // Web 模式: 用户填写了手动 MAC 则优先使用 (兜底 watchAdvertisements 失败)
    if (kind === "web" && !opts?.mac && this.manualMac.trim()) {
      opts = { ...(opts || {}), mac: this.manualMac.trim() };
    }
    try {
      this.statusText = opts?.mac
        ? `连接魔方 (使用手动 MAC ${opts.mac})...`
        : kind === "web"
        ? "请在弹窗中选择你的 GAN 魔方..."
        : "连接魔方...";
      const info = await this.link.connect(kind, opts);
      this.deviceName = info.name;
      this.isMock = kind === "mock";
      // 记忆本次连接 (mock 不记): 刷新界面后 tryAutoReconnect 免操作重连
      const lastMac = info.mac || opts?.mac || opts?.address || "";
      if (kind !== "mock" && lastMac) {
        window.localStorage.setItem("bleLastKind", kind);
        window.localStorage.setItem("bleLastMac", lastMac);
        window.localStorage.setItem("bleLastName", info.name || "");
      }
      // 连接成功后首个 facelets 事件到达时自动生成第一次打乱 (见 onAuthoritative)
    } catch (err) {
      this.statusText = "连接失败: " + ((err as Error).message || String(err));
    }
  }

  /** 刷新/重开界面后自动重连上次连接过的魔方 (connect 成功时已记忆, mock 不记):
   * APK 原生按地址直连 (免手势); 浏览器经 Web Bluetooth getDevices 免弹窗找回已授权设备,
   * MAC 复用记忆值 (跳过 watchAdvertisements, 魔方连接过一次后会停止广播)。
   * 失败 (魔方未开机/浏览器不支持) 仅提示, 不影响手动连接 */
  private async tryAutoReconnect(): Promise<void> {
    if (this.isManual || this.status !== "disconnected") {
      return;
    }
    const kind = window.localStorage.getItem("bleLastKind");
    const mac = window.localStorage.getItem("bleLastMac") || "";
    const name = window.localStorage.getItem("bleLastName") || "";
    if ((kind !== "web" && kind !== "native") || !mac) {
      return;
    }
    this.statusText = "自动重连上次的魔方" + (name ? ` (${name})` : "") + "...";
    try {
      if (kind === "native") {
        await this.connect("native", { address: mac });
      } else {
        await this.connect("web", { mac, autoReconnect: true, knownName: name });
      }
      // native 免扫描直连时传输层拿不到广播名 (info.name=地址), 换回记忆的设备名
      if (this.deviceName === mac && name) {
        this.deviceName = name;
      }
    } catch {
      // 组件 connect 内部已写入失败文案
    }
    // 断言重置收窄 (方法开头 if 已把 this.status 收窄为 "disconnected", 直接比较被判恒真)
    const finalStatus = this.status as CubeLinkStatus;
    if (finalStatus !== "connected") {
      this.statusText = "自动重连失败 (魔方未开机?): 请开机后点「连接魔方」; " + this.statusText;
    }
  }

  /** 手动练习入口 (无蓝牙): 用鼠标拧 3D 魔方完成训练流程 */
  startManual(): void {
    if (this.status === "connected") {
      return;
    }
    this.isManual = true;
    this.z2On = false; // 手动模式无物理帧概念 (z2 按钮隐藏), 复位避免遗留翻转影响公式展示
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
    await this.connect("native", { address });
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
      // 连接后超时未收到 facelets: 手动 MAC 填错时加密失效收不到有效帧, 提示检查
      this.armStateWatchdog();
    } else if (s === "connecting") {
      this.phase = "disconnected";
    } else {
      if (this.phase !== "disconnected") {
        this.statusText = "蓝牙连接已断开";
      }
      this.phase = "disconnected";
      this.running = false;
      this.scramble = "";
      this.calibStep = -1; // 断开时若在校准则终止
    }
  }

  /** 连接后 10s 未收到任何 facelets (predicted 仍为空) 视为状态超时: 手动 MAC 可能填错 */
  private stateTimer: any = null;
  private armStateWatchdog(): void {
    if (this.stateTimer !== null) {
      return;
    }
    this.stateTimer = window.setTimeout(() => {
      this.stateTimer = null;
      if (this.status === "connected" && this.predicted === null) {
        this.statusText =
          "已连接但未收到魔方状态: 若使用了手动 MAC, 请确认填写正确 (魔方底盖/电池仓的 12 位十六进制); 填错会导致加密失效, 请断开后核对重连";
      }
    }, 10000);
  }

  // ================= z2 姿态切换 (整体旋转, 同 CrossF2L 的 z2 按钮) =================

  /** 展示层转动换名: z2On 时物理帧 → 3D 翻转帧 (z2 共轭: U↔D, R↔L; ' 与 2 后缀保留) */
  private displayMove(move: string): string {
    return this.z2On ? z2Move(move) : move;
  }

  /** 展示层公式换名 (打乱/最优解/用户解法): z2On 时逐记号 z2 共轭 */
  private displayFormula(formula: string): string {
    return this.z2On
      ? formula
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((m) => z2Move(m))
          .join(" ")
      : formula;
  }

  /** 打乱公式展示 (z2On 时换名到当前视角) */
  get scrambleText(): string {
    return this.displayFormula(this.scramble);
  }

  /** Cross 最优解展示 */
  get bestSolutionText(): string {
    return this.displayFormula(this.bestSolution);
  }

  /** XCross 四槽位最优解展示 */
  get bestXDisplay(): { slot: string; formula: string; steps: number }[] {
    return this.bestX.map((b) => ({ slot: b.slot, steps: b.steps, formula: this.displayFormula(b.formula) }));
  }

  /** 用户解法展示 */
  get userSolutionText(): string {
    return this.displayFormula(this.userSolution);
  }

  /** 3D 场景整体 z2 翻转 (fast=true 瞬间完成, 用于权威重绘后恢复翻转姿态) */
  private applyZ2Flip(fast: boolean): void {
    for (const group of this.world.cube.table.groups["z"]) {
      group.twist(Math.PI, fast);
    }
    this.world.dirty = true;
  }

  /**
   * z2 按钮 (CrossF2L 同款): 3D 魔方整体 z2 翻转动画, 白顶绿前 ⇄ 黄顶绿前, 再按切回。
   * 物理帧状态数据 (predicted/打乱/判定) 一律不动, 仅 3D 视角与展示层记号换名,
   * 任意阶段切换均自洽; 换名后的转动/公式与翻转后的 3D 画面保持一致
   */
  toggleZ2(): void {
    // 排空在飞/排队中的镜像动画, 从静止姿态出发翻转 (同 CrossF2L rotateBase 前置 finish)
    this.world.cube.twister.finish();
    this.z2On = !this.z2On;
    this.applyZ2Flip(false); // 平滑动画
    // 目标十字随视角底色变化 (黄底⇄白底): 刷新提示语; 进行中按新目标重求最优解
    // (判定双色自适应, 不受视角影响)
    if (this.phase === "observing" || this.phase === "solving") {
      this.statusText =
        this.trainMode === "xcross"
          ? "XCross 进行中: 还原" + this.crossTargetText() + "并顺带完成任一组 F2L"
          : "十字进行中: 还原" + this.crossTargetText();
      if (this.solveBaseState) {
        this.bestSolution = "";
        this.bestReady = false;
        this.bestX = [];
        this.bestXReady = false;
        this.requestBest(this.mapStateForJudge(this.solveBaseState));
      }
    }
  }

  // ================= 校准 (调试): 引导转动实体魔方, 对比硬件上报记号 =================

  // 校准步骤: 期望硬件在白顶绿前持握下上报的记号 (3D 默认视角即白顶绿前, 不做换算)
  private calibSteps = [
    { key: "U", tip: "校准 1/3: 白面所在的 顶层, 从上往下看 顺时针 转 90°" },
    { key: "R", tip: "校准 2/3: 右侧 层, 从右往左看 顺时针 转 90°" },
    { key: "F", tip: "校准 3/3: 绿面所在的 前层, 面对魔方 顺时针 转 90°" },
  ];
  // 当前校准步 (-1 未在校准; 0..2 进行中), 模板用
  calibStep = -1;
  private calibLog: { expected: string; actual: string }[] = [];

  /** 校准按钮: 开始/取消。在默认白顶绿前视角下 (无任何换算) 引导 3 步转动,
   * 逐条记录硬件上报记号, 结束后自动判定: 硬件帧与白顶绿前一致 / 差一个 z2 / 其他 */
  calibrate(): void {
    if (this.status !== "connected") {
      return;
    }
    if (this.calibStep >= 0) {
      // 再次点击 = 取消
      this.calibStep = -1;
      this.statusText = "校准已取消";
      return;
    }
    if (this.z2On) {
      this.toggleZ2(); // 先切回默认白顶视角 (含翻转动画), 保证零换算对比
    }
    this.world.cube.twister.finish();
    this.calibLog = [];
    this.calibStep = 0;
    this.statusText = "校准开始, 请持握 白顶绿前 · " + this.calibSteps[0].tip;
    console.log("[校准] 开始: 请持握 白顶绿前 (3D 已同视角, 无换算), 按提示逐个转动实体魔方");
  }

  /** 校准中收到物理转动: 原样镜像动画 + 记录上报记号, 不参与训练判定 */
  private onCalibMove(move: string): void {
    const expected = this.calibSteps[this.calibStep].key;
    const mark = move === expected ? "✓ 一致" : move === z2Move(expected) ? "(z2 换名)" : "✗ 不匹配";
    console.log(`[校准] 期望 ${expected}, 实际收到 ${move} ${mark}`);
    this.calibLog.push({ expected, actual: move });
    this.world.cube.twister.push(move); // 原样镜像, 便于肉眼对比 3D 与实体
    if (this.calibStep < this.calibSteps.length - 1) {
      this.calibStep++;
      this.statusText = this.calibSteps[this.calibStep].tip;
    } else {
      this.finishCalib();
    }
  }

  /** 校准结束: 汇总 3 步对比, 自动判定硬件帧向 (一致 / z2 / 其他) */
  private finishCalib(): void {
    this.calibStep = -1;
    const pairs = this.calibLog.map((p) => `${p.expected}→${p.actual}`).join(" ");
    const same = this.calibLog.every((p) => p.actual === p.expected);
    const z2 = this.calibLog.every((p) => p.actual === z2Move(p.expected));
    console.log(`[校准] 完成: ${pairs}`);
    if (same) {
      this.statusText = `校准完成 ${pairs}: 硬件帧=白顶绿前, 默认视角正确, 无需 z2`;
      console.log("[校准] 结论: 硬件帧与白顶绿前一致, 默认视角正确");
    } else if (z2) {
      this.toggleZ2(); // 自动切到黄顶视角, 转动/公式展示同步换名
      this.statusText = `校准完成 ${pairs}: 硬件帧=黄顶绿前, 已自动切到 z2 黄顶视角`;
      console.log("[校准] 结论: 硬件帧与白顶绿前差一个 z2, 已自动切换黄顶视角");
    } else {
      this.statusText = `校准完成 ${pairs}: 混合/异常, 请把控制台 [校准] 日志发来分析`;
      console.log("[校准] 结论: 混合/异常结果, 请把以上完整日志发来分析 (是否有漏转/多转/转错层)");
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

  /** 权威状态到达 (连接时全量 / 周期同步 / Mock 每步都发)。状态恒为物理帧 (raw) */
  private onAuthoritative(raw: string): void {
    // 已收到状态帧 → MAC/加密链路正常, 关闭状态超时看门狗
    if (this.stateTimer !== null) {
      window.clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }
    // 首包或与推演不符 (丢事件/被外力转动): 以实体为准重绘 3D, 并恢复 z2 翻转姿态;
    // 一致时不重绘 (保留进行中的镜像动画流畅性)
    if (raw !== this.predicted) {
      this.predicted = raw;
      this.syncScene(raw);
      if (this.z2On) {
        this.applyZ2Flip(true);
      }
    }
    // 连接后首个 facelets 可能在 setStatus("connected") 回调前到达 (GanCubeLink.connect
    // 内 await requestFacelets 先于 CubeLink.setStatus 完成): 此时 phase 仍是
    // "connecting" 置的 "disconnected", 不能只认 "ready", 否则首包被丢弃永久卡等待
    if (this.calibStep >= 0) {
      return; // 校准中: 状态推演已同步, 跳过训练判定/自动开轮 (校准转层会改状态)
    }
    if (this.status === "connected" && (this.phase === "ready" || this.phase === "disconnected")) {
      this.newScramble();
      return;
    }
    this.judge(raw);
  }

  /** 物理转动事件: 校准记录 / 推演状态 (物理帧) + 判定 + 3D 动画镜像 (展示层按 z2On 换名) */
  private onMoveEvent(move: string): void {
    if (this.calibStep >= 0) {
      // 校准流程: 状态推演照常维护 (转层真实发生了), 但只记录上报记号, 不参与判定
      if (this.predicted) {
        const next = applyFaceletMove(this.predicted, move);
        if (next) {
          this.predicted = next;
        }
      }
      this.onCalibMove(move);
      return;
    }
    if (this.phase === "observing" && !this.isManual) {
      // 自动下轮直接开始: 首次物理转动即开始还原计时 (该步计入还原)
      this.phase = "solving";
      this.solveStart = Date.now();
      this.timerStart = this.solveStart;
      this.statusText =
        this.trainMode === "xcross"
          ? "XCross 进行中: 还原" + this.crossTargetText() + "并顺带完成任一组 F2L"
          : "十字进行中: 还原" + this.crossTargetText();
    }
    if (this.predicted) {
      const next = applyFaceletMove(this.predicted, move);
      if (!next) {
        return;
      }
      this.predicted = next;
      if (this.phase === "solving") {
        this.userMoves.push(move); // 物理帧记号 (与判定/求解同帧); 展示经 userSolutionText 换名
        // 步数按 HTM 口径实时化简 (魔方对 180° 转发 2 个 1/4 转事件, D2 应计 1 步)
        this.moveCount = simplifyMoves(this.userMoves).length;
      }
      // 打乱阶段 3D 停留在目标态预览 (等实物拧到一致), 其余阶段实时镜像
      if (this.phase !== "scrambling") {
        this.world.cube.twister.push(this.displayMove(move));
      }
      this.judge(next);
    } else {
      // 尚未收到权威状态, 仅镜像动画
      this.world.cube.twister.push(this.displayMove(move));
    }
  }

  // ================= 训练判定 =================

  /** 状态提示里的十字目标描述 (按当前持握视角的底面中心色; 判定本身双色自适应) */
  private crossTargetText(): string {
    return this.z2On ? "白色十字 (4 条白棱围住白色中心)" : "黄色十字 (4 条黄棱围住黄色中心)";
  }

  /** 本轮训练目标是否达成: 十字双色自适应 —— 白色十字 (4 条白棱围住白色中心) 或
   * 黄色十字 (4 条黄棱围住黄色中心) 任一完成即算 (用户按底色持握还原: 黄底还原黄十字,
   * 白底还原白十字, 两种十字在状态串中位于不同面, 故都判定)。
   * 黄十字 = 核心帧标准 D 面十字 (isCrossDone 直判); 白十字经训练帧变换呈现为 D 面十字
   * (见 toTrainFrame)。xcross = 十字 + 围绕同一中心的任一 F2L 槽位 (角+棱) */
  private isTrainDone(state: string): boolean {
    const train = toTrainFrame(state);
    if (this.trainMode === "cross") {
      return isCrossDone(train) || isCrossDone(state);
    }
    if (isCrossDone(train)) {
      return f2lSlotsDone(train).length > 0;
    }
    return isCrossDone(state) && f2lSlotsDone(state).length > 0;
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
          ? "XCross 进行中: 还原" + this.crossTargetText() + "并顺带完成任一组 F2L"
          : "十字进行中: 还原" + this.crossTargetText();
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
    if (this.needBreak) {
      // 同 judge: 起始态十字已完成时, 须先拆散才允许判定成功
      if (hasAnyCrossDone(state)) {
        return;
      }
      this.needBreak = false;
    }
    if (this.isTrainDone(state)) {
      this.finishSuccess(state);
    }
  }

  private judge(state: string): void {
    if (this.phase === "scrambling") {
      if (this.scrambleTarget && state === this.scrambleTarget) {
        this.startSolving();
        // 3D 对齐回打乱目标态 (预览动画可能未播完/被权威同步打断): 保证还原阶段镜像基准正确
        this.syncScene(this.scrambleTarget);
        if (this.z2On) {
          this.applyZ2Flip(true);
        }
      }
      return;
    }
    if (this.phase === "solving") {
      if (this.needBreak) {
        // 起始态十字已完成: 须先观察到十字被拆散才允许判定成功
        if (hasAnyCrossDone(state)) {
          return;
        }
        this.needBreak = false;
      }
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
        ? "XCross 进行中: 还原" + this.crossTargetText() + "并顺带完成任一组 F2L"
        : "十字进行中: 还原" + this.crossTargetText();
    // 记录求解基准态 (打乱目标态; skipScramble/手动模式为当时状态), 模式切换时据此重求
    this.solveBaseState = baseState || this.scrambleTarget || this.predicted || "";
    // 起始态十字若已完成 (自动下轮直接开始等): 须先拆散十字, 成功判定才生效
    this.needBreak = hasAnyCrossDone(this.solveBaseState);
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
      // 目标十字按当前持握视角底色: 黄底 (z2On=false) → 黄十字 = 核心帧标准 D 面, 直接求解;
      // 白底 (z2On=true) → 白十字, 经训练帧求解, 解逐记号 z2Move 换回核心帧再存
      const solutions = await this.solver.solveCross(this.z2On ? toTrainFrame(state) : state, 1, 8);
      // 慢速求解 (BFS fallback) 可能耗时数秒: 若期间已开始新一轮则作废本次结果
      if (reqId !== this.bestReqId) {
        return;
      }
      const best = ((solutions && solutions[0]) || "").trim();
      if (best.indexOf("error") !== 0) {
        this.bestSolution = best
          ? best.split(/\s+/).map((m) => (this.z2On ? z2Move(m) : m)).join(" ")
          : ""; // 空串 = 打乱态十字已复原, 最优 0 步
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
            // 黄底 (z2On=false): 核心帧直接求解, 槽位名即物理帧; 白底 (z2On=true):
            // 训练帧求解, 解逐记号 z2Move 换回核心帧, 槽位名换回物理帧 (FL↔FR, BL↔BR)
            const sols = await this.solver.solveXCross(this.z2On ? toTrainFrame(state) : state, slot, 1);
            const best = ((sols && sols[0]) || "").trim();
            const ok = best && best.indexOf("error") !== 0;
            const mapMove = (m: string) => (this.z2On ? z2Move(m) : m);
            const slotName = this.z2On ? slotToPhysical(slot) : slot;
            return {
              slot: slotName,
              formula: ok ? best.split(/\s+/).map(mapMove).join(" ") : "",
              steps: ok ? best.split(/\s+/).length : 0,
            };
          } catch (e) {
            console.error(`[BleCrossTrainer] XCross (${slot}) 求解失败`, e);
            return { slot: this.z2On ? slotToPhysical(slot) : slot, formula: "", steps: 0 };
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
    // 已还原的 F2L 槽位跟随完成的十字: 白十字经训练帧判定后换回物理帧名 (FL↔FR, BL↔BR);
    // 黄十字直接用核心帧槽位名
    if (this.trainMode === "xcross") {
      const train = toTrainFrame(state);
      this.completedSlots = isCrossDone(train) ? f2lSlotsDone(train).map(slotToPhysical) : f2lSlotsDone(state);
    } else {
      this.completedSlots = [];
    }
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
    // 勾选「自动下轮」时 2.5s 展示结果后自动开始下一轮 (免点「跳过, 直接开始」:
    // 不生成打乱匹配等待, 自行打乱魔方后首次转动开始计时); 未勾选则等用户手动点「新打乱」
    if (this.autoNext) {
      this.resultTimer = window.setTimeout(() => {
        this.resultTimer = null;
        this.nextRoundDirect();
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
    // 点击即直接显示打乱最终态 (瞬时, 不逐步播放动画); 实物照公式拧,
    // 拧到一致自动开始计时 (打乱期间 3D 不跟随转动, 见 onMoveEvent)
    this.syncScene(this.scrambleTarget);
    if (this.z2On) {
      this.applyZ2Flip(true);
    }
    this.statusText = "已显示打乱态: 照公式拧实物, 拧到一致后自动开始计时";
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

  /** 手动 MAC 输入变更: 持久化, 下次复用避免再次输入 (空串清除保存值) */
  saveManualMac(): void {
    const v = this.manualMac.trim();
    if (v) {
      window.localStorage.setItem("bleManualMac", v);
    } else {
      window.localStorage.removeItem("bleManualMac");
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
    const base = this.predicted || SOLVED_FACELETS;
    this.scrambleTarget = "";
    // 放弃目标态预览: 3D 对齐回实物当前状态, 以实际状态开始本轮
    this.syncScene(base);
    if (this.z2On) {
      this.applyZ2Flip(true);
    }
    this.startSolving(base);
    // 当前状态十字可能已完成 (如复原态直接跳过): 立即判定一次
    if (this.predicted) {
      this.judge(this.predicted);
    }
  }

  /** 自动下轮: 不生成打乱匹配等待, 以当前状态直接进入下一轮 (等同自动点「跳过, 直接开始」)。
   * 进入观察态: 首次物理转动开始还原计时; 起始态十字已完成时须先拆散才可判定成功 */
  private nextRoundDirect(): void {
    if (this.isManual || this.status !== "connected") {
      this.newScramble(); // 手动模式/断连兜底: 走常规打乱流程
      return;
    }
    const base = this.predicted || SOLVED_FACELETS;
    this.scramble = "";
    this.scrambleTarget = "";
    this.elapsedText = "";
    // 3D 对齐回实物当前状态
    this.syncScene(base);
    if (this.z2On) {
      this.applyZ2Flip(true);
    }
    this.startSolving(base);
    this.phase = "observing";
    this.observeStart = Date.now();
    this.solveStart = 0;
    this.running = true; // 驱动计时显示
    this.statusText = "已进入下一轮: 打乱魔方后首次转动开始计时还原";
  }

  // ================= 3D 场景同步 =================

  /** 把 3D 场景直接设置为指定 54 串状态 (物理帧; reset 后按 serialize 同序逐贴纸上色)。
   * z2On 的翻转姿态由调用方随后 applyZ2Flip 恢复 */
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
    // 求解目标随当前视角底色 (同最优解): 黄底核心帧直解, 白底经训练帧换回核心帧
    const solutions = await this.solver.solveCross(this.z2On ? toTrainFrame(state) : state, 1, 8);
    const solution = ((solutions && solutions[0]) || "").trim();
    if (solution.indexOf("error") === 0) {
      this.statusText = "演示: 十字求解失败 " + solution;
      return;
    }
    if (!solution) {
      return; // 十字已复原 (空解法), 判定链路会自行收敛
    }
    const coreSolution = solution.split(/\s+/).map((m) => (this.z2On ? z2Move(m) : m)).join(" ");
    for (const token of coreSolution.split(/\s+/)) {
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
