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
import { pieceName, pieceTypeOf, rotatePositionIndex, mapZ2Facelets } from "./pieces";
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
  private pendingRestore: { axis: string; times: number }[] = [];

  // 配色方案: 打乱公式固定按 "默认" 方案 (黄底绿前) 坐标系执行。
  // "白底" 方案不是换色, 而是打乱后通过整体旋转 z2 (绕 z 轴 180°: U↔D, L↔R, F/B 不变)
  // 把魔方转成白底绿前姿态 ("默认" 预设染色下: 打乱后底面中心显黄=黄底, z2 后 U 材质中心
  // 转到底部显白=白底); 求解时需把序列化状态做 z2 字符映射 (U↔D, L↔R) 交给求解器,
  // 得到的解法按物理面名直接执行即可完成白十字
  private whiteBase = false;

  // 白底还原态下位于槽位处的块 (默认方案即槽位块本身; 白底为槽位索引 z2 映射后的块)
  private get mappedCornerIndex(): number {
    return this.whiteBase ? rotatePositionIndex(this.selectedSlot.cornerIndex, "z", 2) : this.selectedSlot.cornerIndex;
  }

  private get mappedEdgeIndex(): number {
    return this.whiteBase ? rotatePositionIndex(this.selectedSlot.edgeIndex, "z", 2) : this.selectedSlot.edgeIndex;
  }

  // 应用基准姿态: 白底方案下将打乱后的魔方整体旋转 z2 (瞬间完成, 不计入视角还原记录)
  private applyOrientation(): void {
    if (!this.whiteBase) {
      return;
    }
    for (const group of this.world.cube.table.groups["z"]) {
      group.twist(Math.PI, true);
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

  // 还原视角: 逆序抵消所有整体转动, 魔方状态与位置命名回到打乱时的标准坐标系
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
    tweener.finish();
    this.restoreView(true);
    this.clearSelection();
    this.result = "";
    this.solutions = [];
    this.selectedSolution = -1;
    this.phase = "idle";
    this.stopTimer(true);
    clearAllHighlights(this.world);
    // 读取配色方案: "白底" 通过打乱后整体旋转 z2 实现 (非换色)
    this.whiteBase = this.palette.preset === "白底";
    this.scramble = this.world.cube.twister.scrambler();
    this.world.cube.twister.setup(this.scramble);
    this.applyOrientation();
    this.markTargetSlot();
    await this.solve();
  }

  // 切换槽位: 清除旧高亮与预判, 更新为新槽位的目标块高亮
  @Watch("slot")
  onSlotChange(): void {
    if (this.phase === "playing") {
      return;
    }
    this.reset();
  }

  // 重置: 保留打乱状态, 清除解法选择/预判/判定
  reset(): void {
    tweener.finish();
    this.restoreView(true);
    this.clearSelection();
    this.result = "";
    this.selectedSolution = -1;
    this.phase = "idle";
    this.stopTimer(true);
    clearAllHighlights(this.world);
    this.world.cube.twister.setup(this.scramble);
    // 白底方案: 重置回打乱态后同样应用基准姿态旋转
    this.applyOrientation();
    this.markTargetSlot();
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
  // 白底方案: 目标块为白底还原态下位于槽位的块 (槽位索引 z2 映射)
  private markTargetSlot(): void {
    highlightPiece(this.world, this.mappedCornerIndex, HIGHLIGHT_COLORS.target);
    highlightPiece(this.world, this.mappedEdgeIndex, HIGHLIGHT_COLORS.target);
  }

  // 调用 Cross 求解器获取多个最优解法
  // 求解器为 "字符=面" 语义: 永远求「输入串中字符 D 的棱归 D 位」, 解法面名与输入串坐标一致。
  //   - 默认方案: 打乱态 (黄底绿前), 底面中心为 D 材质 (显黄) → 直接求解即黄十字
  //   - 白底方案: 打乱后整体 z2, 底面中心为 U 材质 (显白)。求解前先把序列化状态做
  //     z2 字符映射 (U↔D, L↔R), 映射后恰为标准中心串; 求解器把「U 材质棱」归到物理 D 位,
  //     解法按物理面名直接执行即得白十字 (白棱贴白中心)
  private async solve(): Promise<void> {
    this.solving = true;
    try {
      let state = this.world.cube.serialize();
      if (this.whiteBase) {
        state = mapZ2Facelets(state);
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
    // 若平滑还原动画仍在进行, 先立即完成, 保证解法步骤在标准坐标系下执行
    tweener.finish();
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
    this.phase = "playing";
    this.world.cube.twister.push(this.solutions[this.selectedSolution]);
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
  private onAnimationEnd(): void {
    if (this.phase !== "playing") {
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
    // 播放中若用户整体旋转过视角, 先立即还原到标准坐标系再判定
    // (restoreView 的快速转动会再次触发本回调, 届时 pending 已空, 正常判定)
    if (this.pendingRestore.length > 0) {
      this.restoreView(true);
      return;
    }
    this.judge();
  }

  // 自动判定: 用户预判的目标块位置 vs Cross 后目标块的实际位置
  private judge(): void {
    this.phase = "judged";
    this.stopTimer(false); // 动画播放完毕停表, 保留用时显示
    // 目标 F2L 块 (按还原位置识别): initials 中还原位为槽位索引的块
    // 白底方案: 使用 z2 映射后的槽位索引 (白底还原态下位于槽位的块)
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

  // 恢复默认视角 (平滑回放, 逆序抵消所有整体转动, 不影响魔方打乱状态)
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
