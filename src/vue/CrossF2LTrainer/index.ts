import { Component, Provide, Ref, Vue, Watch } from "vue-property-decorator";
import World from "../../cuber/world";
import Cubelet from "../../cuber/cubelet";
import tweener from "../../cuber/tweener";
import { F2L_SLOTS } from "../../cuber/f2l";
import Solver from "../../solver/Solver";
import * as WasmSolver from "../../wasm/WasmSolver";
import { indexedDBStorage } from "../../util/IndexedDBStorage";
import Viewport from "../Viewport";
import Setting from "../Setting";
import { PreferanceData, PaletteData } from "../../data";
import { pieceName, pieceTypeOf, rotatePositionIndex, rotatePositionByOps, mapBaseOpsFacelets, convertBaseOpsFaceNames, BaseOp } from "./pieces";
import { HIGHLIGHT_COLORS, highlightPiece, restorePositionHighlight, highlightPosition, highlightAnchor, restoreAnchor, clearAllHighlights, tickHighlights } from "./highlight";

@Component({
  template: require("./index.html"),
  components: {
    viewport: Viewport,
    setting: Setting,
  },
})
export default class CrossF2LTrainer extends Vue {
  @Provide("world")
  world: World = new World();

  @Provide("preferance")
  preferance: PreferanceData = new PreferanceData(this.world);

  @Provide("palette")
  palette: PaletteData = new PaletteData(this.world);

  constructor() {
    super();
    // 从配色菜单持久化的 preset 恢复方案选择 (constructor 中赋值不会触发 scheme watch)
    this.scheme = this.palette.preset === "白底" ? "白底" : "默认";
  }

  // 阶段: idle(预判/准备) -> playing(播放动画) -> judged(已判定)
  private phase: "idle" | "playing" | "judged" = "idle";

  private slot: string = "FR";
  private scramble = "";
  private solutions: string[] = [];
  private selectedSolution = -1;
  private solving = false;

  // 目标 F2L 块 (颜色 A): 按还原位置识别, 如 FR 槽位 = 角块 DFR + 棱块 FR

  // 用户预判 (颜色 B): 预测目标 F2L 块 Cross 后会到达的位置
  // predictedXxxIndex: 位置索引 (标准坐标系, 随整体转动映射更新)
  // predictedXxxPiece: 未播放时覆层锚定的块 (平滑跟随所有转动); 播放时冻结为位置绑定后置空
  private predictedCornerIndex: number | null = null;
  private predictedEdgeIndex: number | null = null;
  private predictedCornerPiece: Cubelet | null = null;
  private predictedEdgePiece: Cubelet | null = null;
  // 当前等待用户点选的块类型
  private predictTarget: "corner" | "edge" | null = "corner";

  private result = "";

  // 计时: 预判开始时启动, Cross 动画播放完毕停止
  private timerStart = 0;
  private timerStop = 0;
  private running = false;

  private solver: Solver = new Solver();

  // 整体视角转动的待还原记录 (axis, 有符号 90° 次数)
  // 仅记录临时拖拽; z2/y/y' 按钮的基准旋转单独记于 baseOps
  private pendingRestore: { axis: string; times: number }[] = [];

  // 基准视角: z2 / y / y' 按钮累计的整体旋转操作序列 (按时间顺序, axis 轴 times 个 90°)。
  // z2 与 y 不对易, 须用序列表达任意复合视角 (如 z2→y→z2)。
  // 解法按基准视角坐标系求解; 「恢复视角」只抵消基准之后的临时拖拽, 回到基准视角;
  // 打乱/重置等重开流程保留当前视角 (不回标准视角)
  private baseOps: BaseOp[] = [];

  // 置位表示有整体转动动画进行中, 动画结束后需按新坐标系重新求解 (旧解法已失效)
  private pendingSolve = false;

  // 置位表示本次解法在标准坐标系执行 (播放前逆放了基准旋转, 见 play),
  // 播放结束后需重放 baseOps 恢复基准视角再做判定
  private playingUndoBase = false;

  // 配色方案: "默认" (白顶黄底) / "白底" (黄顶白底), 纯配色切换,
  // 与基准视角 (z2/y/y' 按钮) 完全解耦, 切换不重开轮、不影响解法
  // (serialize 输出材质字符, 与显示配色无关)
  // scheme 可在面板中切换 (默认/白底), 与配色菜单 preset 双向同步
  private scheme: "默认" | "白底" = "默认";

  // 自定义打乱公式输入 (留空则由「打乱」按钮随机生成)
  private customScramble = "";

  // 基准姿态的逆 (逆序复合, 每个 op 的逆 = 同轴 +times):
  // 把物理位置映射回标准位置, 用于求「当前视角下位于某槽位的标准块」
  private get inverseBaseOps(): BaseOp[] {
    return [...this.baseOps].reverse();
  }

  // 位于槽位处的块 (基准视角下): 标准系槽位索引经基准姿态的逆映射后的位置块
  private get mappedCornerIndex(): number {
    return rotatePositionByOps(this.selectedSlot.cornerIndex, this.inverseBaseOps);
  }

  private get mappedEdgeIndex(): number {
    return rotatePositionByOps(this.selectedSlot.edgeIndex, this.inverseBaseOps);
  }

  // 应用基准姿态: 打乱重置到标准坐标后, 按时间顺序重放 baseOps 恢复基准视角
  // (瞬间完成, 不计入视角还原记录)
  private applyBaseOrientation(): void {
    for (const op of this.baseOps) {
      for (const group of this.world.cube.table.groups[op.axis]) {
        group.twist(op.times * (Math.PI / 2), true);
      }
    }
    this.world.dirty = true;
  }

  // 逆放基准旋转: 物理回到标准坐标系 (瞬间完成, 不计入视角还原记录)
  private applyInverseBaseOps(): void {
    for (let i = this.baseOps.length - 1; i >= 0; i--) {
      const op = this.baseOps[i];
      for (const group of this.world.cube.table.groups[op.axis]) {
        group.twist(-op.times * (Math.PI / 2), true);
      }
    }
    this.world.dirty = true;
  }

  // 整体转动回调: 记录待还原信息; 非播放状态下预判位置索引同步旋转 (青色框跟随魔方)
  private onWholeTurn(axis: string, times: number): void {
    this.pendingRestore.push({ axis, times });
    if (this.phase !== "playing") {
      this.followPrediction(axis, times);
    }
  }

  // 预判位置索引跟随: 仅映射索引
  // 未播放时覆层锚定在块上, 随整体转动自动平滑跟随, 无需重挂
  // 注意: 整体转动的 group.twist(+times·90°) 绕的是负轴 (AXIS_VECTOR 为负向量),
  // 等效于绕正轴 -times 次 +90°, 因此映射时需传入 -times
  private followPrediction(axis: string, times: number): void {
    const corner = this.predictedCornerIndex;
    if (corner !== null) {
      this.predictedCornerIndex = rotatePositionIndex(corner, axis, -times);
    }
    const edge = this.predictedEdgeIndex;
    if (edge !== null) {
      this.predictedEdgeIndex = rotatePositionIndex(edge, axis, -times);
    }
  }

  // 视角自动还原延时器 (点击选块后延迟 1 秒触发平滑回放)
  private restoreTimer: any = null;

  // 还原视角: 逆序抵消所有临时拖拽记录, 回到基准视角 (y/y' 切换后的姿态)
  // fast=true 瞬间完成 (播放/重置等需要立即归位的场景); 默认平滑动画回放
  private restoreView(fast: boolean = false): void {
    if (this.restoreTimer !== null) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
    if (this.pendingRestore.length === 0) {
      return;
    }
    for (let i = this.pendingRestore.length - 1; i >= 0; i--) {
      const { axis, times } = this.pendingRestore[i];
      // 预判位置索引逆向映射, 与块一起回到标准坐标
      if (this.phase !== "playing") {
        this.followPrediction(axis, -times);
      }
      const groups = this.world.cube.table.groups[axis[0]];
      for (const group of groups) {
        group.twist(-times * (Math.PI / 2), fast);
      }
    }
    this.pendingRestore = [];
    this.world.dirty = true;
  }

  // z2 / y / y' 按钮: 整体旋转切换基准视角, 旋转动画结束后按新坐标系重新求解,
  // 得到当前视角下最顺手的十字解法。基准旋转不计入 pendingRestore (不会被「恢复视角」抵消)
  rotateBase(axis: "y" | "z", times: number): void {
    if (this.phase !== "idle" || this.solving || this.pendingSolve) {
      return;
    }
    // 排空 twister 队列 (如打乱动画未播完的剩余动作) 并完成在飞动画, 确保所有层已解锁:
    // 仅 tweener.finish 无法处理队列中未开始的动作, 残留的锁会导致整体旋转被部分拒绝
    // (部分 group 转动成功、部分失败), 物理状态与 baseOps 记录失同步
    this.world.cube.twister.finish();
    this.restoreView(true); // 先抵消临时拖拽, 从基准视角出发旋转
    // 预判与当前视角关联: 青色框锚定物理块随整体转动平滑跟随, 索引同步映射到新视角坐标系
    // (与拖拽转动的 onWholeTurn 同构)。切视角只是整体旋转, 不改变物理块排列, 重解后的
    // 物理落点与切视角前一致, 预判判定语义不变, 无需清除
    this.followPrediction(axis, times);
    for (const group of this.world.cube.table.groups[axis]) {
      group.twist(times * (Math.PI / 2), false); // 平滑动画
    }
    this.baseOps.push({ axis, times });
    this.world.dirty = true;
    // 旧解法基于旋转前坐标系, 立即从列表移除防止误选; 动画结束后重新求解
    this.solutions = [];
    this.selectedSolution = -1;
    this.pendingSolve = true;
  }

  rotateY(times: number): void {
    this.rotateBase("y", times);
  }

  // z2 按钮: 与 y/y' 同质的视角切换 (整体绕 z 轴 180°)
  rotateZ2(): void {
    this.rotateBase("z", 2);
  }

  // 整体转动动画结束后的延迟求解: 坐标系变动导致旧解法失效
  private checkPendingSolve(): void {
    if (!this.pendingSolve) {
      return;
    }
    this.pendingSolve = false;
    if (this.phase !== "idle") {
      return;
    }
    // 抵消旋转动画期间可能发生的临时拖拽, 保证解法匹配基准视角
    this.restoreView(true);
    this.solve();
  }

  @Ref("viewport")
  viewport: Viewport;

  width = 0;
  height = 0;
  size = 0;

  get selectedSlot() {
    return F2L_SLOTS.find((s) => s.name === this.slot) || F2L_SLOTS[0];
  }

  get targetCornerName(): string {
    return pieceName(this.selectedSlot.cornerIndex);
  }

  get targetEdgeName(): string {
    return pieceName(this.selectedSlot.edgeIndex);
  }

  get predictedCornerName(): string {
    return this.predictedCornerIndex !== null ? pieceName(this.predictedCornerIndex) : "";
  }

  get predictedEdgeName(): string {
    return this.predictedEdgeIndex !== null ? pieceName(this.predictedEdgeIndex) : "";
  }

  get predictPrompt(): string {
    if (this.phase === "playing") {
      return "Cross 转动中, 请观察紫色目标块的移动...";
    }
    if (this.phase === "judged") {
      return "本回合结束, 点击「重置」可基于同一打乱重新训练";
    }
    const cornerDone = this.predictedCornerIndex !== null;
    const edgeDone = this.predictedEdgeIndex !== null;
    if (!cornerDone) {
      return `请点击你预测 Cross 完成后 角块${this.targetCornerName} 会到达的位置 (点击该位置的角块; 可拖动空白处旋转魔方查看背面, 选块后视角自动还原)`;
    }
    if (!edgeDone) {
      return `请点击你预测 Cross 完成后 棱块${this.targetEdgeName} 会到达的位置 (点击该位置的棱块; 可拖动空白处旋转魔方查看背面, 选块后视角自动还原)`;
    }
    return "预判完成, 可继续点击调整预判 (再次点击同一位置取消), 选择解法后即可播放 Cross";
  }

  // 计时展示 (实时刷新): mm:ss.d
  get elapsedDisplay(): string {
    if (this.timerStart <= 0) {
      return "";
    }
    const end = this.running ? performance.now() : this.timerStop;
    const seconds = Math.max(0, (end - this.timerStart) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return m > 0 ? `${m}分 ${s.toFixed(1)}秒` : `${s.toFixed(1)}秒`;
  }

  get canPlay(): boolean {
    return (
      this.phase === "idle" &&
      this.solutions.length > 0 &&
      this.selectedSolution >= 0 &&
      this.selectedSolution < this.solutions.length &&
      this.predictedCornerIndex !== null &&
      this.predictedEdgeIndex !== null &&
      this.predictTarget === null
    );
  }

  mounted(): void {
    (window as any).__crossF2L = this; // 临时调试
    this.resize();
    this.loop();
    this.world.callbacks.push(() => this.onAnimationEnd());
    // 锁定手动转层, 防止训练过程中误操作破坏状态 (点击选块不受影响)
    this.world.controller.lock = true;
    // 记录整体视角转动 (拖拽空白处): 记录待还原信息, 非播放时青色预判框跟随魔方旋转
    this.world.controller.wholeTurnCallbacks.push((axis, times) => this.onWholeTurn(axis, times));
    // 注册 3D 场景点击拾取, 用于预判选块
    this.world.controller.taps.push((index) => this.onTap(index));
    // 初始化 WASM 求解器 (失败时 Solver 内部自动回退到 TS 求解器)
    this.$nextTick(async () => {
      this.preferance.refresh();
      this.palette.refresh();
      await this.initSolver();
      this.rescramble();
    });
  }

  private async initSolver(): Promise<void> {
    try {
      await WasmSolver.initWasm();
      await indexedDBStorage.init();
      const cached = await indexedDBStorage.loadTable();
      if (cached) {
        try {
          await WasmSolver.loadTableFromBytes(cached);
        } catch (e) {
          console.error("[CrossF2LTrainer] 加载缓存搜索表失败", e);
          await this.generateWasmTable();
        }
      } else {
        await this.generateWasmTable();
      }
    } catch (e) {
      console.error("[CrossF2LTrainer] WASM 求解器初始化失败, 将使用内置求解器", e);
    }
  }

  private async generateWasmTable(): Promise<void> {
    try {
      await WasmSolver.generateTable(8);
      const bytes = await WasmSolver.getTableBytes();
      await indexedDBStorage.saveTable(bytes);
    } catch (e) {
      console.error("[CrossF2LTrainer] 生成搜索表失败", e);
    }
  }

  // 随机打乱并开始新一轮训练
  async rescramble(): Promise<void> {
    this.startRound(this.world.cube.twister.scrambler());
  }

  // 应用用户输入的打乱公式并开始新一轮训练
  applyCustomScramble(): void {
    const exp = (this.customScramble || "").trim().replace(/\s+/g, " ");
    if (!exp) {
      return;
    }
    // 轻量校验: 仅支持标准面转 U R F D L B 及 '/2 后缀
    const tokens = exp.split(" ");
    const ok = tokens.every((t) => /^[URFDLB]('2|2'|'|2)?$/.test(t));
    if (!ok) {
      this.result = "打乱公式无效 (仅支持 U R F D L B 与 '/2 后缀)";
      return;
    }
    this.startRound(exp);
  }

  // 开始新一轮: 清空状态, 应用打乱公式 (随机或用户输入), 重放 baseOps 恢复基准视角并求解
  // (视角与配色解耦且跨轮保留: 重新打乱不重置视角)
  private startRound(exp: string): void {
    this.pendingSolve = false;
    tweener.finish();
    this.restoreView(true);
    this.clearSelection();
    this.result = "";
    this.solutions = [];
    this.selectedSolution = -1;
    this.phase = "idle";
    this.stopTimer(true);
    clearAllHighlights(this.world);
    this.scramble = exp;
    this.world.cube.twister.setup(exp);
    this.applyBaseOrientation();
    this.markTargetSlot();
    this.solve();
  }

  // 切换配色方案 (默认/白底): 纯配色切换, 同步 preset 持久化;
  // 不重开轮、不重算解法 (serialize 输出材质字符, 与显示配色无关)
  @Watch("scheme")
  onSchemeChange(scheme: string): void {
    this.palette.setPreset(scheme);
    this.palette.save();
  }

  // 切换槽位: 清除旧高亮与预判, 更新为新槽位的目标块高亮
  @Watch("slot")
  onSlotChange(): void {
    if (this.phase === "playing") {
      return;
    }
    this.reset();
  }

  // 重置: 保留打乱状态, 清除解法选择/预判/判定 (保留当前基准视角)
  reset(): void {
    this.pendingSolve = false;
    tweener.finish();
    this.restoreView(true);
    this.clearSelection();
    this.result = "";
    this.solutions = [];
    this.selectedSolution = -1;
    this.phase = "idle";
    this.stopTimer(true);
    clearAllHighlights(this.world);
    this.world.cube.twister.setup(this.scramble);
    // 重置回打乱态后同样重放基准视角旋转
    this.applyBaseOrientation();
    this.markTargetSlot();
    // 重置后回到基准视角打乱姿态, 重新求解 (此前视角可能转过, 旧解法坐标系已失效)
    this.solve();
  }

  // 计时控制
  private stopTimer(clear: boolean): void {
    if (this.running) {
      this.timerStop = performance.now();
    }
    this.running = false;
    if (clear) {
      this.timerStart = 0;
      this.timerStop = 0;
    }
  }

  // 清除预判 (颜色 B), 允许重新点选
  clearPrediction(): void {
    this.clearSelection();
    if (this.phase === "judged") {
      // 重新预判 = 回到 idle, 但槽位实际块已变动, 需要还原到打乱状态重新来
      this.reset();
      return;
    }
    clearAllHighlights(this.world);
    this.markTargetSlot();
  }

  private clearSelection(): void {
    if (this.predictedCornerPiece) {
      restoreAnchor(this.world, this.predictedCornerPiece);
      this.predictedCornerPiece = null;
    }
    if (this.predictedEdgePiece) {
      restoreAnchor(this.world, this.predictedEdgePiece);
      this.predictedEdgePiece = null;
    }
    // 播放后覆层为位置绑定 (冻结态), 按索引清除
    if (this.predictedCornerIndex !== null) {
      restorePositionHighlight(this.world, this.predictedCornerIndex);
    }
    if (this.predictedEdgeIndex !== null) {
      restorePositionHighlight(this.world, this.predictedEdgeIndex);
    }
    this.predictedCornerIndex = null;
    this.predictedEdgeIndex = null;
    this.predictTarget = "corner";
  }

  // 标记目标 F2L 块 (颜色 A): 槽位对应的角块+棱块 (按还原位置识别),
  // 高亮它们在当前打乱状态中的实际位置, 覆层随块移动
  // 基准视角非标准时: 目标块为基准视角还原态下位于槽位的块 (槽位索引经姿态逆映射, 见 mappedCornerIndex)
  private markTargetSlot(): void {
    highlightPiece(this.world, this.mappedCornerIndex, HIGHLIGHT_COLORS.target);
    highlightPiece(this.world, this.mappedEdgeIndex, HIGHLIGHT_COLORS.target);
  }

  // 调用 Cross 求解器获取多个最优解法
  // 求解器为 "字符=面" 语义: 永远求「输入串中字符 D 的棱归 D 位」, 解法面名与输入串坐标一致。
  //   - 标准视角 (baseOps 为空): 打乱态直接求解, 解基准视角底面的十字
  //   - 非标准视角 (z2/y/y' 后): 姿态为 baseOps 复合 (z2 与 y 不对易, 共轭置换随序列变化)。
  //     求解前先按复合置换做字符映射 (mapBaseOpsFacelets), 映射后恰为标准中心串;
  //     求解器把「D 字符的棱」归到基准视角的物理底位。
  //     注意解法面名是姿态系 (当前观察者视角) 层名: 用户手动执行 (在当前视角下按解法列表转)
  //     直接正确; 而 play() 自动播放会先逆放 baseOps 回标准坐标系, 须先经
  //     convertBaseOpsFaceNames 改名再执行 (见 play)。
  //     (底面十字颜色跟随配色: D 材质在默认配色显黄、白底配色显白)
  private async solve(): Promise<void> {
    this.solving = true;
    try {
      let state = this.world.cube.serialize();
      if (this.baseOps.length > 0) {
        state = mapBaseOpsFacelets(state, this.baseOps);
      }
      const raw = await this.solver.solveCross(state, 5, 8);
      // WASM 返回 string[][] (每个解法为步骤数组), 内置求解器返回 string[], 统一归一化
      this.solutions = (raw || [])
        .map((s: any) => (Array.isArray(s) ? s.join(" ") : String(s)).trim())
        .filter((s: string) => s.length > 0 && !s.startsWith("error"));
      // 默认选中第 1 个解法
      this.selectedSolution = this.solutions.length > 0 ? 0 : -1;
      if (this.solutions.length === 0) {
        this.result = "十字已完成或求解失败, 请点击「重新打乱」";
      }
    } catch (e) {
      console.error("[CrossF2LTrainer] 求解失败", e);
      this.solutions = [];
      this.result = "求解失败, 请点击「重新打乱」";
    } finally {
      this.solving = false;
    }
  }

  // 选择解法 (点击行高亮)
  selectSolution(i: number): void {
    if (this.phase !== "idle") {
      return;
    }
    this.selectedSolution = i;
  }

  // 播放选中的 Cross 解法动画
  play(): void {
    if (!this.canPlay) {
      return;
    }
    // 若平滑还原动画仍在进行, 先立即完成; 同时排空 twister 队列确保所有层已解锁,
    // 否则下方的逆放 fast twist 可能被部分拒绝, 物理状态与 baseOps 失同步
    this.world.cube.twister.finish();
    this.restoreView(true);
    // 冻结预判覆层: 块锚定 → 位置绑定 (播放时青色框固定在预判位置, 不随层转动)
    if (this.predictedCornerPiece) {
      restoreAnchor(this.world, this.predictedCornerPiece);
      if (this.predictedCornerIndex !== null) {
        highlightPosition(this.world, this.predictedCornerIndex, HIGHLIGHT_COLORS.predict);
      }
      this.predictedCornerPiece = null;
    }
    if (this.predictedEdgePiece) {
      restoreAnchor(this.world, this.predictedEdgePiece);
      if (this.predictedEdgeIndex !== null) {
        highlightPosition(this.world, this.predictedEdgeIndex, HIGHLIGHT_COLORS.predict);
      }
      this.predictedEdgePiece = null;
    }
    this.result = "";
    // 层 group 按初始索引静态绑定 (GroupTable 构造时分配, 永不更新), 整体旋转后若直接执行
    // 解法, convert 按面名选到的是「初始层成员」而非当前视角下的对应层, 转动会破坏物理状态。
    // 因此先把基准旋转逆放 (瞬间), 在标准坐标系下执行解法; 必须在置 playing 之前逆放 ——
    // fast twist 的 drop 会同步触发 onAnimationEnd, 播放态下会被误当成播放结束提前判定。
    // 播放结束后由 handleAnimationEnd 重放 baseOps 恢复基准视角再判定 (判定索引均为基准
    // 视角坐标系, 与预判点击时一致)。
    if (this.baseOps.length > 0) {
      this.playingUndoBase = true;
      this.applyInverseBaseOps();
    }
    this.phase = "playing";
    // 解法面名是姿态系层名, 逆放后须按 baseOps 映射表的逆表改名 (共轭 C⁻¹∘τ_f∘C = τ_{C⁻¹(f)},
    // 即改名串世界 τ_f = 物理 τ_{C⁻¹(f)}) 再执行; 标准视角下 baseOps 为空, 直接原样执行
    const sol = this.solutions[this.selectedSolution];
    this.world.cube.twister.push(this.baseOps.length > 0 ? convertBaseOpsFaceNames(sol, this.baseOps) : sol);
  }

  // 用户在 3D 场景中点击选块 (预判: 点击某个位置, 表示预测目标块 Cross 后会到达这里)
  // 交互规则:
  //   - 若视角被整体转动过, 先自动还原到标准视角
  //   - 点击已选中的同一位置 → 取消该预判
  //   - 点击其他同类型位置 → 改选为新位置
  //   - 预判完成后仍可继续点击调整 (点角块改角块, 点棱块改棱块)
  private onTap(index: number): void {
    if (index < 0 || this.phase !== "idle" || this.solutions.length === 0) {
      return;
    }
    // 整体转动不改变块的类型 (角/棱/中心), 可先用点击时的索引判断类型
    const type = pieceTypeOf(index, this.world.cube.order);
    if (type === "center") {
      return;
    }
    const clicked = this.world.cube.cubelets[index];
    // 预判索引始终记录当前物理位置 (视角还原时自动映射回标准坐标, 见 followPrediction)
    const pos = clicked.index;
    // 1 秒后平滑回放还原视角; 期间再次点击会重新计时
    if (this.restoreTimer !== null) {
      clearTimeout(this.restoreTimer);
    }
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null;
      this.restoreView();
    }, 1000);
    // 首次预判点击时启动计时
    if (!this.running && this.timerStart <= 0) {
      this.timerStart = performance.now();
      this.timerStop = 0;
      this.running = true;
    }
    if (type === "corner") {
      if (this.predictedCornerIndex === pos) {
        // 再次点击同一位置 → 取消预判
        if (this.predictedCornerPiece) {
          restoreAnchor(this.world, this.predictedCornerPiece);
          this.predictedCornerPiece = null;
        }
        restorePositionHighlight(this.world, pos);
        this.predictedCornerIndex = null;
        this.predictTarget = "corner";
      } else {
        // 选定或改选新位置 (覆层锚定在块上, 平滑跟随所有转动)
        if (this.predictedCornerPiece) {
          restoreAnchor(this.world, this.predictedCornerPiece);
        }
        this.predictedCornerIndex = pos;
        this.predictedCornerPiece = highlightAnchor(this.world, pos, HIGHLIGHT_COLORS.predict);
        // 角块已定, 引导下一步选棱块 (若棱块也已选则保持完成态)
        this.predictTarget = this.predictedEdgeIndex !== null ? null : "edge";
      }
    } else {
      if (this.predictedEdgeIndex === pos) {
        // 再次点击同一位置 → 取消预判
        if (this.predictedEdgePiece) {
          restoreAnchor(this.world, this.predictedEdgePiece);
          this.predictedEdgePiece = null;
        }
        restorePositionHighlight(this.world, pos);
        this.predictedEdgeIndex = null;
        this.predictTarget = "edge";
      } else {
        // 选定或改选新位置 (覆层锚定在块上, 平滑跟随所有转动)
        if (this.predictedEdgePiece) {
          restoreAnchor(this.world, this.predictedEdgePiece);
        }
        this.predictedEdgeIndex = pos;
        this.predictedEdgePiece = highlightAnchor(this.world, pos, HIGHLIGHT_COLORS.predict);
        this.predictTarget = this.predictedCornerIndex !== null ? null : "corner";
      }
    }
  }

  // 动画回调: 每个转动完成后触发, 仅在最后一个动作完成时判定
  // 防重入锁: fast twist 的 drop 会同步触发本回调 (restoreView / applyBaseOrientation 等
  // 瞬间还原场景), 若不拦截, 递归回调会在恢复流程进行到一半 (姿态未就位) 时提前判定,
  // 且对外层循环中的层造成重复转动; 拦截后由最外层回调统一完成恢复与判定
  private inAnimationEnd = false;

  private onAnimationEnd(): void {
    if (this.inAnimationEnd) {
      return;
    }
    this.inAnimationEnd = true;
    try {
      this.handleAnimationEnd();
    } finally {
      this.inAnimationEnd = false;
    }
  }

  private handleAnimationEnd(): void {
    if (this.phase !== "playing") {
      // 非播放态的转动 (y/y' 切换视角 / 期间的拖拽还原) 结束: 按需重新求解
      this.checkPendingSolve();
      return;
    }
    // 队列未清空或仍有层在转动, 说明动画未结束
    if (this.world.cube.twister.length > 0) {
      return;
    }
    for (const lock of this.world.cube.locks.values()) {
      if (lock.size > 0) {
        return;
      }
    }
    // 播放中用户整体旋转过视角: 立即还原 (fast 同步完成, 递归回调已被防重入锁拦截),
    // 还原后继续执行下方流程而非直接判定
    if (this.pendingRestore.length > 0) {
      this.restoreView(true);
    }
    // 解法曾在标准坐标系执行 (播放前逆放了基准旋转): 重放 baseOps 恢复基准视角,
    // 保证判定时的物理位置索引与预判点击时处于同一坐标系
    if (this.playingUndoBase) {
      this.playingUndoBase = false;
      this.applyBaseOrientation();
    }
    this.judge();
  }

  // 自动判定: 用户预判的目标块位置 vs Cross 后目标块的实际位置
  private judge(): void {
    this.phase = "judged";
    this.stopTimer(false); // 动画播放完毕停表, 保留用时显示
    // 目标 F2L 块 (按还原位置识别): initials 中还原位为槽位索引的块
    // 白底方案: 使用复合映射后的槽位索引 (白底还原态下位于槽位的块, 见 mappedCornerIndex)
    const targetCorner = this.world.cube.initials[this.mappedCornerIndex];
    const targetEdge = this.world.cube.initials[this.mappedEdgeIndex];
    // cubelet.index 在转层后始终维护为当前位置索引 (group.ts 转层结束时回写)
    const actualCornerIndex = targetCorner.index;
    const actualEdgeIndex = targetEdge.index;
    const cornerOk = actualCornerIndex === this.predictedCornerIndex;
    const edgeOk = actualEdgeIndex === this.predictedEdgeIndex;
    if (cornerOk && edgeOk) {
      this.result = "✅ 预判正确!";
    } else {
      const cornerText = cornerOk ? "✓" : `实际位于 ${pieceName(actualCornerIndex)} 位置`;
      const edgeText = edgeOk ? "✓" : `实际位于 ${pieceName(actualEdgeIndex)} 位置`;
      this.result = `❌ 预判错误: 角块${this.targetCornerName} ${cornerText} , 棱块${this.targetEdgeName} ${edgeText} (紫色块当前位置)`;
    }
    // 播放已结束 (未播放态): 青色覆层从位置绑定转回块锚定,
    // 与紫色一致地跟随视角转动; 锚定在预判位置处的块上
    if (this.predictedCornerIndex !== null) {
      restorePositionHighlight(this.world, this.predictedCornerIndex);
      this.predictedCornerPiece = highlightAnchor(this.world, this.predictedCornerIndex, HIGHLIGHT_COLORS.predict);
    }
    if (this.predictedEdgeIndex !== null) {
      restorePositionHighlight(this.world, this.predictedEdgeIndex);
      this.predictedEdgePiece = highlightAnchor(this.world, this.predictedEdgeIndex, HIGHLIGHT_COLORS.predict);
    }
  }

  // 恢复视角 (平滑回放): 只抵消基准视角之后的临时拖拽, 回到 z2/y/y' 切换后的基准视角
  resetView(): void {
    tweener.finish();
    this.restoreView();
  }

  onResize() {
    this.resize();
  }

  resize(): void {
    this.width = document.documentElement.clientWidth;
    this.height = document.documentElement.clientHeight;
    this.size = Math.ceil(Math.min(this.width / 6, this.height / 12));
    // 全屏 viewport, 仅预留底部面板高度, 魔方居中偏上不遮挡
    this.viewport?.resize(this.width, this.height - this.size * 2.6);
  }

  loop(): void {
    requestAnimationFrame(this.loop.bind(this));
    tickHighlights();
    // 计时运行中每帧刷新显示
    if (this.running) {
      this.$forceUpdate();
    }
    this.viewport?.draw();
  }
}
