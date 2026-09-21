import { Component, Provide, Ref, Vue } from "vue-property-decorator";
import World from "../../cuber/world";
import { TwistAction } from "../../cuber/twister";
import { COLORS, FACE } from "../../cuber/define";
import GIF from "../../common/gif";
import Util from "../../common/util";
import Cubelet from "../../cuber/cubelet";
import CubeGroup from "../../cuber/group";
import * as THREE from "three";
import Viewport from "../Viewport";
import Setting from "../Setting";
import { PreferanceData, PaletteData } from "../../data";
import { CubeLink, CubeLinkKind, CubeLinkStatus, webBluetoothAvailable, nativeBridgeAvailable, getNativeTransport } from "../../ble/cube-link";
import { LinkEvent } from "../../ble/types";
import { SOLVED_FACELETS, brandFaceletsToState, isCrossDone, f2lSlotsDone } from "../../ble/facelets";
import { applyFaceletMove, applyFormulaFrom, simplifyMoves, z2Move, toTrainFrame, rotateFaceletsByOps } from "../../ble/move-diff";
import { baseOpsFaceCharMap, BaseOp } from "../CrossF2LTrainer/pieces";
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
    .filter((m) => !/^[xyz][2']?0?$/.test(m))
    .join(" ");
}

// 训练帧槽位名 → 物理(显示)帧槽位名: 训练帧变换 T 为 z2 视角 (L↔R, F/B 不变),
// XCross 解法/完成槽位按训练帧判定 (如 FL), 展示换回物理帧名 (如 FR)
function slotToPhysical(slot: string): string {
  return slot.charAt(1) === "L" ? slot.charAt(0) + "R" : slot.charAt(0) + "L";
}

// 54 串位置 → (cubelet 初始索引, FACE) 写入映射。
// 遍历顺序与 Cube.serialize() 完全一致 (URFDLB 六组各 9 字符), 先 reset 再逐贴纸
// stick 即可把 3D 场景设置为任意 54 串状态 (蓝牙魔方接入时镜像用)。

/** 一轮训练记录: t=时间戳, mode=练习模式, ok=是否成功;
 * obs=观察用时秒 (手动模式, 蓝牙 null), solve=还原用时秒 (放弃=当时已用时, 无 null);
 * best=最优解步数 (-1 无), steps=用户实际步数 (HTM 口径) */
type TrainRecord = {
  t: number;
  mode: "cross" | "xcross";
  ok: boolean;
  obs: number | null;
  solve: number | null;
  best: number;
  steps: number;
};

type DisplayMoveRecord = {
  physical: string;
  display: string;
  viewSig: string;
};

type BackgroundPreset = {
  name: string;
  value: string;
};

const BLE_BACKGROUND_DEFAULT = "#FFFFFF";
const BLE_BACKGROUND_PRESETS: BackgroundPreset[] = [
  { name: "白色", value: "#FFFFFF" },
  { name: "浅灰", value: "#F3F4F6" },
  { name: "米白", value: "#FFF8E7" },
  { name: "淡黄", value: "#FFFDE7" },
  { name: "淡绿", value: "#E8F5E9" },
  { name: "淡青", value: "#E0F7FA" },
  { name: "淡蓝", value: "#EAF2FF" },
  { name: "淡紫", value: "#F3E8FF" },
  { name: "淡粉", value: "#FCE7F3" },
  { name: "暗黑", value: "#121212" },
];

function normalizeBackgroundColor(value: string | null): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : BLE_BACKGROUND_DEFAULT;
}

const RECORDS_KEY = "bleTrainRecords";
const RECORDS_MAX = 500; // 本地缓存上限, 防膨胀

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

// ---- 无关块可视化 (半透明/隐藏) 材质基础设施 ----
// serialize→getColor 按贴纸材质身份反查色字符: 换成未注册材质会得 "?" 破坏序列化
// (判定/求解/重绘全挂)。因此可视化一律「替换贴纸材质」: 半透明/更透明=同色低透明度
// 材质 (visible 恒 true, 反查表仍能读色); 所需块高亮=同色无光照纯亮材质 (Basic, 实心)。
// VIS_MAT_COLORS 注册 自定义材质→色字符, getColor 原型补丁优先查表保 serialize 恒真实
const VIS_MAT_COLORS = new Map<THREE.Material, string>();
const VIS_GHOST_MATS: { [color: string]: THREE.MeshLambertMaterial } = {};
const VIS_CENTER_MATS: { [color: string]: THREE.MeshLambertMaterial } = {};
const VIS_SOFT_MATS: { [color: string]: THREE.MeshLambertMaterial } = {};
const VIS_BRIGHT_MATS: { [color: string]: THREE.MeshBasicMaterial } = {};
const VIS_GHOST_OPACITY = 0.18;
const VIS_CENTER_OPACITY = 0.8;
// 「隐藏无关」档: 比半透明更透明, 隐约可见而非完全消失
const VIS_SOFT_OPACITY = 0.06;
// 塑料体 (frame) 处理: 半透明档直接 frame.visible=false (黑骨架完全隐去, 透过薄纱
// 贴纸直接见背后块色); 隐藏档骨架同 0.06 隐约 (CORE.clone)
const VIS_FRAME_SOFT = ((): THREE.MeshPhongMaterial => {
  const mat = Cubelet.CORE.clone() as THREE.MeshPhongMaterial;
  mat.transparent = true;
  mat.opacity = VIS_SOFT_OPACITY;
  mat.depthWrite = false;
  return mat;
})();

function visMaterialOf(color: string, mode: "ghost" | "center" | "soft" | "bright"): THREE.Material {
  if (mode === "bright") {
    // 所需块高亮: 无光照纯色 (Basic), 在半透明无关块后依然鲜亮醒目
    let mat = VIS_BRIGHT_MATS[color];
    if (!mat) {
      mat = new THREE.MeshBasicMaterial();
      VIS_BRIGHT_MATS[color] = mat;
      VIS_MAT_COLORS.set(mat, color);
    }
    const lamber = Cubelet.LAMBERS[color];
    if (lamber) {
      mat.color.copy(lamber.color);
    }
    return mat;
  }
  const table = mode === "ghost" ? VIS_GHOST_MATS : mode === "center" ? VIS_CENTER_MATS : VIS_SOFT_MATS;
  let mat = table[color];
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({
      transparent: true,
      opacity: mode === "ghost" ? VIS_GHOST_OPACITY : mode === "center" ? VIS_CENTER_OPACITY : VIS_SOFT_OPACITY,
      depthWrite: false,
    });
    table[color] = mat;
    VIS_MAT_COLORS.set(mat, color);
  }
  // 配色可随时在菜单修改 (直接改 LAMBERS 色值): 每次取用时同步, 避免半透明块颜色过期
  const lamber = Cubelet.LAMBERS[color];
  if (lamber) {
    mat.color.copy(lamber.color);
  }
  return mat;
}

// getColor 原型补丁 (模块加载时一次性): 自定义可视化材质反查色字符, 其余走原实现
const _visOrigGetColor = Cubelet.prototype.getColor;
if (!(Cubelet.prototype as { __visPatched?: boolean }).__visPatched) {
  (Cubelet.prototype as { __visPatched?: boolean }).__visPatched = true;
  Cubelet.prototype.getColor = function (this: Cubelet, face: FACE): string {
    const sticker = this.stickers[this.getFace(face)];
    if (sticker) {
      const mapped = VIS_MAT_COLORS.get(sticker.material as THREE.Material);
      if (mapped) {
        return mapped;
      }
    }
    return _visOrigGetColor.call(this, face);
  };
}

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
  /** 蓝牙步骤的事件时屏幕记号；视角切换后历史不得重解释。 */
  private userDisplayMoves: DisplayMoveRecord[] = [];
  userSolution = "";
  // WASM 对打乱态求出的十字最优解 (startSolving 时异步预求解)
  bestSolution = "";
  // 最优解求解是否已结束 (空串解法 = 十字已复原 0 步, 需与「求解中」区分)
  bestReady = false;
  // XCross 模式: 4 个槽位各自的最优解 (startSolving 时并行预求解)
  bestX: { slot: string; formula: string; steps: number }[] = [];
  bestXReady = false;
  // 当前最优解结果绑定的视图链快照。异步求解期间视角可能继续变化，公式与槽位必须
  // 使用请求发起时的同一快照，不能分别读取实时 effectiveViewOps 造成混帧。
  private bestViewOps: BaseOp[] = [];
  // 当前最优解结果绑定的核心状态快照；必须与 bestViewOps 来自同一次异步请求。
  // 公式预览只使用这两个字段重建起点，不能读取随后变化的实时 3D/实体状态。
  private bestBaseState = "";
  // 本轮完成时已还原的 F2L 槽位 (xcross 模式结果高亮用)
  completedSlots: string[] = [];
  // 本轮最优解的求解基准态 (打乱目标态; skipScramble 时为当时状态), 模式切换重求用
  private solveBaseState = "";
  // 基准态是否为屏幕帧 (含 z2 翻转 + 基准持握姿态): 手动 newScramble 置 true,
  // 其余 startSolving 调用点 (蓝牙路径) 为物理帧 false —— resetRound 重绘时区分
  private solveBaseScreenFrame = false;
  // 起始态十字已完成时置位 (自动下轮直接开始/完成态跳过): 须先观察到十字被拆散,
  // 成功判定才生效, 防止尚未打乱就再次误判成功
  private needBreak = false;
  // 跳过打乱后置位: 首次物理转动时 3D 从打乱预览态切换到实物镜像轨道 (先对齐再叠加)
  private previewPending = false;
  // 打乱公式路径态 (scrambling 期判定用): [0]=基准态, [i]=基准态+前 i 步公式。
  // 用户按公式拧时 predicted 逐态命中路径 (idx 快进容忍丢事件); 未命中任何路径态 =
  // 已偏离公式 (随手转动) 置 scrambleDiverged —— 十字完成逃生门仅对已偏离者生效,
  // 防公式前缀恰为保十字步 (U/D 对目标底十字, 约 1/3 概率) 时把正常按公式打乱的
  // 用户误劫持成「跳过打乱直接开始」(真机表现=新打乱后拧一下直接显示还原态)
  private scramblePath: string[] = [];
  private scrambleProgress = 0;
  private scrambleDiverged = false;
  // 成功/失败计数: 完成 +1, solving 中点「新打乱」放弃本轮算失败 +1
  successCount = 0;
  failCount = 0;
  // ---- 训练记录: 每轮一条 (观察/还原用时、最优/实际步数、成败), localStorage 持久化 ----
  records: TrainRecord[] = [];
  recDialog = false;
  recLimit = 20; // 统计/表格取最近 N 条 (10/20/50/100)
  // 正确后自动进入下一打乱 (localStorage 持久化, 值 "1"/"0")
  autoNext = true;
  // 是否显示推荐的最优解 (localStorage 持久化, 值 "1"/"0"): 关闭时不求解也不展示, 避免剧透
  showBest = true;
  // ---- 无关块可视化: 色块半透明 / 隐藏无关 (独立开关, 都开时无关块取更透明档) ----
  // 半透明模式: 无关块淡化、中心块 80% 不透明，透视背后块色，
  // 转动落定后按当前姿态重算 (localStorage "bleVisGhost")
  visGhost = false;
  // 隐藏模式: 本轮不需要的块变得更透明 (隐约可见非消失; 中心块不淡化) (localStorage "bleVisHide")
  visHide = false;
  // 仅 BLE Cross 3D 视口使用的背景色，不影响全局 Vuetify 暗黑主题
  backgroundColor = BLE_BACKGROUND_DEFAULT;
  readonly backgroundPresets = BLE_BACKGROUND_PRESETS;
  // xcross 模式下保留显示的 F2L 槽位 (棱块+角块), 与屏幕四下槽位同帧 (localStorage "bleVisSlot")
  visSlot = "FL";
  statusText = "未连接魔方: 点「新打乱」免蓝牙直接练习";

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
  // 手动→蓝牙接管标记: 手动练习中连接成功后, 首个权威状态以魔方当前状态直接开轮
  // (不强制打乱匹配), 消费后复位
  private takeoverPending = false;

  // ---- z2 姿态 (同 CrossF2L 默认 3D): 默认 (false) 3D 按物理原样显示 (白顶绿前);
  // z2 按钮按下 (true) 后 3D 魔方整体 z2 翻转动画成 黄顶绿前, 转动/公式/解法展示
  // 同步做 z2 共轭换名 (U↔D, R↔L)。内部状态 (predicted/打乱/判定) 恒为物理帧,
  // 切换视角不改写任何状态数据 ----
  z2On = false;

  // ---- Mock 演示 ----
  private solver: Solver = new Solver();
  isMock = false;
  mockInput = "";

  // ---- 最优解播放预览 (▶/步进按钮): 3D 上动画演示解法, 播完停留在预览态不自动复原 ----
  // 纯视觉预览: 经 group.twist 直接驱动 (不入 history / 不更新 predicted / 不触发判定),
  // 手动练习轮数据与蓝牙镜像数据均不受影响; 需还原时用户手动点「重置」;
  // 打乱/重置/权威重绘 (syncScene) 会打断预览; 游标随 requestBest 清残留一并清零
  playingBest = false;
  private bestPlayQueue: string[] = [];
  private bestPlayFormula = ""; // 正在预览推进的解法原串 (预览游标键)
  private bestPlayDelta = 1; // 预览推进方向 (+1 前进 / -1 退步)
  private bestPlayTimer: number | null = null;
  // 预览游标 (按解法原串索引): 该解法已在 3D 上可视化推进的记号数, ▶/退一步/下一步共享
  bestStepPos: { [formula: string]: number } = {};

  // ---- 手动练习 (无蓝牙): 鼠标拧 3D 魔方, 打乱直接作用于 3D 场景
  isManual = false;
  // 重置重基准重放中: setup 快转的 drop 回调会带旧 phase 活体判定 (中间态可能
  // 十字已完成 → 误判成功/误切阶段), 置位期间 onManualTwist 直接忽略
  private rebasing = false;
  // 观察/还原期间的整体转序列 (y/y'/x/z, 按时间序, history 已合并同向):
  // 整体转保留在物理状态中 (魔方停在用户当前持握姿态), 判定/求解前按此序列
  // 把状态串换算回核心帧 (中心恢复标准 URFDLB), 任意多次组合均成立
  private observedOps: BaseOp[] = [];

  // z2 视角翻转在视图链时间线中的插入位置 (observedOps 下标): z2 翻转不入 history
  // (applyZ2Flip 直驱 group.twist), 但参与核心帧换算 —— 整体转发生在翻转之后时残留
  // 被共轭 (如 y·z2·y' = 绕倾斜轴 180°, 额外交换 F↔B), 不能再按「纯 z2 奇偶」假设剥离。
  // effectiveViewOps() 把 {z,2} 按标记位置插回时间线 (越界截到链尾, 保翻转奇偶);
  // 轮次重建 (startManual/newScramble/resetRound/fallbackToTouch) 重置为 z2On ? [0] : [],
  // toggleZ2 追加 observedOps.length。不变量: marks 数 ≡ z2On (翻转奇偶与目标底色同步)
  private z2Marks: number[] = [];

  // 轮次基准持握 (CrossF2L baseOps 同语义): 打乱/重置回正后重放恢复的 y/y' 整体转,
  // 跨轮保留 —— 用户切换的持握方向不因打乱/重置丢失 (z2 由 z2On 机制承担, 不入此列)。
  // 判定映射 observedOps = baseOps ⊕ 本轮 history 整体转 (时间序, 见 syncObservedOps)
  private baseOps: BaseOp[] = [];

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
    this.visGhost = window.localStorage.getItem("bleVisGhost") === "1";
    this.visHide = window.localStorage.getItem("bleVisHide") === "1";
    this.backgroundColor = normalizeBackgroundColor(window.localStorage.getItem("bleBackgroundColor"));
    // 统一修正旧值大小写，并把非法值持久化回默认值，刷新后的状态保持稳定
    window.localStorage.setItem("bleBackgroundColor", this.backgroundColor);
    this.loadRecords(); // 训练记录 (localStorage)
    const savedRecLimit = parseInt(window.localStorage.getItem("bleRecLimit") || "", 10);
    if (savedRecLimit === 10 || savedRecLimit === 20 || savedRecLimit === 50 || savedRecLimit === 100) {
      this.recLimit = savedRecLimit;
    }
    const savedVisSlot = window.localStorage.getItem("bleVisSlot");
    if (savedVisSlot === "FL" || savedVisSlot === "FR" || savedVisSlot === "BL" || savedVisSlot === "BR") {
      this.visSlot = savedVisSlot;
    }
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
    // 无关块可视化: 每次转层落定 (所有模式: 手动拧动/蓝牙镜像/setup 快转/z2 翻转/预览播放)
    // 后按当前状态重算所需块并重刷贴纸材质
    this.world.callbacks.push(() => this.applyVisibility());
    this.applyVisibility(); // 初始求解态也按存档偏好刷一次
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

  /** 连接入口: APK 内走原生扫描弹窗, 浏览器走 Web Bluetooth 系统弹窗。
   * 三模式统一: 手动练习中也可直接点连接 (连上后蓝牙接管, 以魔方当前状态继续练习) */
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
      // 重连期间用户已进入手动练习 (enterManual 断开了在飞连接): 不覆盖练习会话提示
      if (this.isManual) {
        return;
      }
      this.statusText = "自动重连失败 (魔方未开机?): 点「连接魔方」重试, 或点「新打乱」免蓝牙直接练习";
    }
  }

  /** 免蓝牙直接练习入口 (未连接/连接中点「新打乱」):
   * 连接中 (如自动重连挂起) 先断开在飞连接, 再进入手动练习模式 */
  enterManual(): void {
    if (this.status === "connecting") {
      this.link.disconnect().catch(() => undefined);
    }
    this.startManual();
  }

  /** 手动练习入口 (无蓝牙): 用鼠标拧 3D 魔方完成训练流程 */
  startManual(): void {
    if (this.status === "connected") {
      return;
    }
    this.isManual = true;
    this.baseOps = []; // 手动会话从标准白顶姿态开始 (z2On 同款复位)
    this.z2Marks = []; // 视图链清空 (z2On 复位为 false, 见下; 新打乱时按 z2On 重建)
    const wasZ2 = this.z2On;
    this.z2On = false; // 手动模式从白顶物理视角开始 (z2 按钮可随时切), 复位避免遗留翻转影响公式展示
    if (wasZ2) {
      this.applyZ2Flip(true); // 3D 翻转姿态同步切回白顶
    }
    this.deviceName = "手动模式 (鼠标拧动)";
    this.statusText = "手动练习: 点击「新打乱」开始";
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
    console.info("[BLECross] link status →", s, "| phase:", this.phase, "| isManual:", this.isManual);
    this.status = s;
    if (s === "connected") {
      // 三模式统一 (蓝牙/mock/手动同一套界面与流程): 手动练习中连接成功 = 蓝牙接管
      // (输入源 touch→ble, 会话不丢, 首包到达后以魔方当前状态直接开轮);
      // 常规连接 = 等待首包后自动生成首轮打乱
      const takeover = this.isManual;
      this.isManual = false;
      this.baseOps = []; // 蓝牙接管: 轮次基准由硬件状态定义, 手动持握基准失效
      this.takeoverPending = takeover;
      this.phase = "ready";
      this.statusText = takeover ? "已连接魔方, 读取当前状态..." : "已连接, 等待魔方状态...";
      // connect 流程内的首个 facelets 可能在本回调前派发 (竞态, 首包被丢):
      // 主动再请求一次全量, 确保 connected 之后必有事件到达以触发开轮
      this.link.requestFacelets().catch(() => undefined);
      // 连接后超时未收到 facelets: 手动 MAC 填错时加密失效收不到有效帧, 提示检查
      this.armStateWatchdog();
    } else if (s === "connecting") {
      this.phase = "disconnected";
    } else {
      this.calibStep = -1; // 断开时若在校准则终止
      if (this.isManual) {
        return; // 本就手动 (enterManual 断开在飞连接等): 不动练习会话
      }
      // 蓝牙断开/失联: 练习会话不丢 —— 有进行中轮次自动转手动继续 (3D 回本轮起点,
      // 鼠标接着还原), 空闲态则转手动待机; 重新连接后蓝牙可再次接管
      if (
        this.phase === "scrambling" ||
        this.phase === "observing" ||
        this.phase === "solving" ||
        this.phase === "success"
      ) {
        this.fallbackToTouch();
      } else {
        this.startManual();
      }
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

  /** 核心帧单步记号 → 指定屏幕视角记号。所有单步/公式显示统一经此函数换名。 */
  private displayMoveWithOps(move: string, ops: BaseOp[]): string {
    const map = baseOpsFaceCharMap(ops);
    return (map[move.charAt(0)] || move.charAt(0)) + move.slice(1);
  }

  /** 展示层转动换名: 核心帧记号 → 当前屏幕面。 */
  private displayMove(move: string): string {
    return this.displayMoveWithOps(move, this.effectiveViewOps());
  }

  /** 展示层公式换名 (打乱/最优解/蓝牙用户解法): 核心帧记号逐个换名到当前屏幕面 */
  private displayFormula(formula: string): string {
    return this.displayFormulaWithOps(formula, this.effectiveViewOps());
  }

  private displayFormulaWithOps(formula: string, ops: BaseOp[]): string {
    return formula
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((move) => this.displayMoveWithOps(move, ops))
      .join(" ");
  }

  /** 展示层槽位换名: 核心帧槽位 (FL/FR/BL/BR, 求解器/判定同帧) → 当前屏幕帧槽位名。
   * 与 displayFormula 同一视图链字符映射 (核心 f 侧当前显示在屏幕 C[f] 面): 槽位标签
   * 必须随视角同步换名 —— 否则下拉框标签指核心槽位而公式已换屏幕记号, 3D 上对不上号
   * (如 y' 持握下核心 FR 槽显示在屏幕 BR 位置, 标签仍写 FR 即「公式不对应当前槽位」)。
   * 字母按 F/B 在前 L/R 在后规范排序 (与 FL/FR/BL/BR 命名同序); 视图链含 x/z 整体转时
   * 映射可出 U/D (如 "UR"), 仍按屏幕真实位置如实展示 */
  private slotDisplayName(slot: string): string {
    return this.slotDisplayNameWithOps(slot, this.effectiveViewOps());
  }

  private slotDisplayNameWithOps(slot: string, ops: BaseOp[]): string {
    const map = baseOpsFaceCharMap(ops);
    const a = map[slot.charAt(0)] || slot.charAt(0);
    const b = map[slot.charAt(1)] || slot.charAt(1);
    const rank: { [c: string]: number } = { F: 0, B: 0, U: 1, D: 1, L: 2, R: 2 };
    return rank[a] <= rank[b] ? a + b : b + a;
  }

  /** 视图链单步记号 (BaseOp → 转动记号): 追加在打乱公式尾部, 重置按此完整重放 */
  private opToken(op: BaseOp): string {
    const n = ((op.times % 4) + 4) % 4;
    if (n === 0) {
      return "";
    }
    return op.axis + (n === 2 ? "2" : n === 3 ? "'" : "");
  }

  /** 打乱公式展示 (稳定): 打乱记号恒为生成时原串, 不随 z2/y/y' 换名改写;
   * 视角操作按 effectiveViewOps 真实时序以记号追加在尾部 (z2/y/y'/鼠标整体转),
   * 与「重置」重放串完全一致 —— 用这条完整公式打乱一次即可复现当前画面 (贴纸+持握) */
  get scrambleText(): string {
    if (!this.scramble) {
      return "";
    }
    const grip = this.effectiveViewOps()
      .map((op) => this.opToken(op))
      .filter(Boolean)
      .join(" ");
    return grip ? this.scramble + " " + grip : this.scramble;
  }

  /** Cross 最优解展示: 按当前屏幕视角换名 (displayFormula), 与预览播放记号同帧 ——
   * 用户读记号以 3D 画面为准 (z2/y 翻转后按屏幕面拧), 文本与播放 (bestMovesOf 同款
   * 换名) 一致; 空视图链时映射恒等 (与求解器核心帧记号相同) */
  get bestSolutionText(): string {
    return this.displayFormulaWithOps(this.bestSolution, this.bestViewOps);
  }

  /** 基准态十字已完成且尚未拆散 (自动下轮直入观察态): 最优解暂无意义, 展示占位提示。
   * needBreak 语义即「本轮基准态十字已完成且尚未观察到拆散」(startSolving/resetRound/
   * skipScramble/fallbackToTouch 按基准态核心帧统一设定, 观察到拆散后复位) */
  get bestWaitingScramble(): boolean {
    return this.needBreak;
  }

  /** XCross 四槽位最优解展示 */
  get bestXDisplay(): { slot: string; formula: string; steps: number; raw: string }[] {
    // slot=屏幕帧槽位名 (slotDisplayName, 与 3D 画面/visSlot 下拉同帧, 完成高亮对比同帧);
    // formula=屏幕帧 (同 bestSolutionText, 文本与播放一致); raw=求解器原串,
    // 预览按钮/游标 (bestStepPos) 的 key 与播放输入恒用 raw
    return this.bestX.map((b) => ({
      slot: this.slotDisplayNameWithOps(b.slot, this.bestViewOps),
      steps: b.steps,
      formula: this.displayFormulaWithOps(b.formula, this.bestViewOps),
      raw: b.formula,
    }));
  }

  /** 蓝牙显示步骤按连续同视角片段分别化简，跨 z2/y/y' 边界不合并。 */
  private fixedUserDisplayFormula(): string {
    const result: string[] = [];
    let segment: string[] = [];
    let viewSig = "";
    const flush = () => {
      if (segment.length > 0) {
        result.push(...simplifyMoves(segment));
        segment = [];
      }
    };
    for (const record of this.userDisplayMoves) {
      if (segment.length > 0 && record.viewSig !== viewSig) {
        flush();
      }
      viewSig = record.viewSig;
      segment.push(record.display);
    }
    flush();
    return result.join(" ");
  }

  /** 用户解法展示: 手动沿用 history；蓝牙使用每步事件发生时固定的屏幕记号。 */
  get userSolutionText(): string {
    return this.isManual ? this.userSolution : this.fixedUserDisplayFormula();
  }

  /** 还原过程中的实时步骤序列 (solving 期间随转动即时更新):
   * 手动 = userSolution (onManualTwist 每步从 history 化简重建, 屏幕记号);
   * 蓝牙 = MOVE 事件到达时固定的屏幕记号，后续视角切换不重写历史 */
  get liveStepsText(): string {
    if (this.isManual) {
      return this.userSolution;
    }
    return this.fixedUserDisplayFormula();
  }

  /** 预览按钮 (退一步/下一步/▶) 统一紧凑样式: 固定小高度, 不随 size 放大
   * (原 size*0.4 在 xcross 四行区明显过高) */
  get previewBtnStyle(): { [k: string]: string } {
    return { height: "20px", minHeight: "20px", minWidth: "24px", padding: "0 4px", flex: "none" };
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
    if (this.playingBest) {
      this.finishBestPlay(); // 打断预览: 落定当前已播画面再翻转 (不再自动复原)
    }
    // 排空在飞/排队中的镜像动画, 从静止姿态出发翻转 (同 CrossF2L rotateBase 前置 finish)
    this.world.cube.twister.finish();
    CubeGroup.durationScale = 1; // 非镜像动画恒常速 (清掉镜像提速残留)
    this.syncObservedOps(); // 刷新整体转链 (finish 提交的 drop 回调可能未及触发)
    // 翻转动画启动前先取当前核心帧输入 (group.twist 动画 drop 时才提交，翻转后
    // serialize 才变)。手动和蓝牙都以当前 3D 状态重算，不再使用冻结的轮次基准态。
    const physical = this.mapStateForJudge(this.world.cube.serialize());
    this.z2On = !this.z2On;
    // 翻转记入视图链时间线 (当前链末尾): 此后的整体转/核心帧换算/展示换名
    // 均按含此翻转的完整链精确处理 (共轭场景不再依赖纯 z2 剥离假设)
    this.z2Marks.push(this.observedOps.length);
    // z2 翻转不入 history, 而 history.record 会合并相邻同面 —— 翻转前后的同向整体转
    // (y·z2·y / y·z2·y') 会被错并成净链 (y2·z2) 或错误抵消, 共轭信息丢失 →
    // 判定/展示/重放失真。插入 times=0 的 z 哨兵隔断合并: syncObservedOps 过滤之,
    // moves/层转判定不受影响; exp 同步记 " z0" 保 record 合并分支的尾串裁剪对位
    const hist = this.world.cube.history;
    if (hist.list.length > 0) {
      hist.list.push(new TwistAction("z", false, 0));
      hist.exp += " z0";
    }
    this.applyZ2Flip(false); // 平滑动画
    // 目标十字随视角底色变化 (黄底⇄白底): 刷新提示语; 按新底色目标重求最优解
    // (判定只认当前底色, 见 isTargetCrossDone; 打乱等待期按打乱目标态重求)
    if (this.phase === "observing" || this.phase === "solving") {
      this.statusText =
        this.trainMode === "xcross"
          ? "XCross 进行中: 还原" + this.crossTargetText() + "并顺带完成任一组 F2L"
          : "十字进行中: 还原" + this.crossTargetText();
    }
    if (physical && this.currentBestBase()) {
      this.requestBest(physical, this.effectiveViewOps());
    }
  }

  /** y/y' 按钮: 整体旋转 (同鼠标拖拽整体转)。物理转动并入 history → observedOps,
   * 判定/最优解/步数自动按新持握方向换算 (观察期不结束观察/不计步)。
   * 蓝牙模式同样可用: 纯屏幕视角切换 (3D 独立转动, 实体不动), 见方法内分支注释。
   * 方向按屏幕语义: z2 翻转把 y 轴也倒了 (z2·y·z2 = y'), z2On 时物理转反向,
   * 保证黄顶视角下按 y 仍是「右面转向前」的观感 (与标准姿态一致) */
  rotateWholeY(times: number): void {
    CubeGroup.durationScale = 1; // 非镜像动画恒常速 (清掉镜像提速残留)
    // 方向按屏幕语义: z2 翻转把 y 轴也倒了 (z2·y·z2 = y'), z2On 时物理转反向,
    // 保证黄顶视角下按 y 仍是「右面转向前」的观感 (与标准姿态一致)
    const physicalTimes = this.z2On ? -times : times;
    if (this.isManual) {
      // 手动: 物理转动并入 history → drop 回调 onManualTwist 刷新 observedOps/判定/最优解
      this.world.cube.twister.push(physicalTimes > 0 ? "y" : "y'");
      return;
    }
    // 蓝牙: 纯屏幕视角切换 (同 z2 机制) —— 3D 独立整体转, 不动实体。observedOps 记录
    // 视图链 (净化由 effectiveViewOps 输出时做), 判定吃物理帧不受视角影响; 展示/解法
    // 记号换名 (displayMove/displayFormula) 经 effectiveViewOps 自动适配新视角, 最优解
    // 为物理帧记号无需重算。开新轮/重置/断开回落时 syncScene 回物理姿态, 链随之重建
    this.observedOps.push({ axis: "y", times: physicalTimes });
    this.world.cube.twister.push(physicalTimes > 0 ? "y" : "y'");
  }

  /** 播放按钮: 在 3D 上动画预览该最优解 (展示帧记号), 每次从求解快照第 1 步播放。
   * 播完不自动复原 —— 画面停留在预览态, 需还原时手动点「重置」。
   * 纯视觉预览: 不入 history/不更新 predicted/不触发判定 (rebasing 屏蔽手动回调) */
  playBest(formula: string): void {
    if (this.playingBest || !formula || !formula.trim()) {
      return;
    }
    const moves = this.bestMovesOf(formula);
    if (moves.length === 0 || !this.resetBestPreview(formula, true)) {
      return;
    }
    this.startBestPreview(formula, moves, 1);
  }

  /** 步进按钮: dir=+1 下一步 (应用下一条记号), dir=-1 退一步 (回退上一条记号)。
   * 首个 ⏭ 先恢复求解快照；其余步进沿用当前画面，⏮ 保持逐步回退。 */
  stepBest(formula: string, dir: number): void {
    if (this.playingBest || !formula || !formula.trim()) {
      return;
    }
    const moves = this.bestMovesOf(formula);
    const pos = this.bestStepPos[formula] || 0;
    if (dir > 0 && pos === 0 && !this.resetBestPreview(formula, false)) {
      return;
    }
    let token = "";
    if (dir > 0) {
      if (pos >= moves.length) {
        return;
      }
      token = moves[pos];
    } else {
      if (pos <= 0) {
        return;
      }
      token = this.inverseToken(moves[pos - 1]);
    }
    this.startBestPreview(formula, [token], dir);
  }

  /** 恢复当前最优解绑定的 3D 起点，不改变训练阶段、计时、步数或蓝牙权威状态。 */
  private resetBestPreview(formula: string, clearAll: boolean): boolean {
    if (!formula || !formula.trim() || !/^[URFDLB]{54}$/.test(this.bestBaseState)) {
      return false;
    }
    this.rebasing = true;
    try {
      this.syncScene(this.bestBaseState);
      for (const op of this.bestViewOps) {
        for (const group of this.world.cube.table.groups[op.axis]) {
          group.twist(op.times * (Math.PI / 2), true);
        }
      }
      this.bestStepPos = clearAll ? {} : { ...this.bestStepPos, [formula]: 0 };
      return true;
    } finally {
      this.rebasing = false;
    }
  }

  /** 启动一次预览推进 (▶ 完整播放或单步): 共用播放队列机制, 游标按落定记号数推进 */
  private startBestPreview(formula: string, tokens: string[], dir: number): void {
    if (tokens.length === 0) {
      return;
    }
    const cube = this.world.cube;
    cube.twister.finish(); // 排空在飞动画, 从静止画面出发
    CubeGroup.durationScale = 1; // 非镜像动画恒常速 (清掉镜像提速残留)
    this.bestPlayFormula = formula;
    this.bestPlayDelta = dir;
    this.playingBest = true;
    this.rebasing = true; // 手动: 屏蔽播放动画 drop 回调的活体判定/计步
    this.bestPlayQueue = tokens;
    this.playNextBestMove();
  }

  /** 解法展示记号序列 (物理帧→当前屏幕面换名, 与展示文本同一记号) */
  private bestMovesOf(formula: string): string[] {
    return this.displayFormulaWithOps(formula, this.bestViewOps)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  /** 预览游标 (模板绑定): 该解法已可视化推进的记号数 */
  bestStepAt(formula: string): number {
    return this.bestStepPos[formula] || 0;
  }

  /** 预览总步数 (模板绑定禁用态用) */
  bestStepCount(formula: string): number {
    return formula ? this.bestMovesOf(formula).length : 0;
  }

  /** 转动记号取反 (R↔R', R2 自逆) */
  private inverseToken(token: string): string {
    if (/2$/.test(token)) {
      return token;
    }
    return token.indexOf("'") >= 0 ? token.replace("'", "") : token + "'";
  }

  /** 预览游标推进 (▶ 中断时游标=实际已播步数); 整对象替换保 Vue2 响应 */
  private bumpStepPos(): void {
    const formula = this.bestPlayFormula;
    if (!formula) {
      return;
    }
    const len = this.bestMovesOf(formula).length;
    const pos = Math.max(0, Math.min(len, (this.bestStepPos[formula] || 0) + this.bestPlayDelta));
    this.bestStepPos = { ...this.bestStepPos, [formula]: pos };
  }

  private playNextBestMove(): void {
    const token = this.bestPlayQueue.shift();
    if (token === undefined) {
      this.finishBestPlay();
      return;
    }
    const action = new TwistAction(token);
    const rotates = this.world.cube.table.convert(action);
    let ok = true;
    for (const rotate of rotates) {
      ok = rotate.group.twist((Math.PI / 2) * rotate.twist, false) && ok;
    }
    if (!ok) { // 组被锁 (动画未完/用户拖拽): 稍后重试
      this.bestPlayQueue.unshift(token);
      this.bestPlayTimer = window.setTimeout(() => this.playNextBestMove(), 60);
      return;
    }
    this.bumpStepPos();
    // 每步约 0.5s 动画 (frames=30), 完成后再起下一步; 超时由重试路径兜底
    this.bestPlayTimer = window.setTimeout(() => this.playNextBestMove(), 620);
  }

  /** 预览结束/打断: 落定在飞尾帧, 画面停留在已播预览态 (不再自动复原, 重置按钮还原) */
  private finishBestPlay(): void {
    if (this.bestPlayTimer !== null) {
      window.clearTimeout(this.bestPlayTimer);
      this.bestPlayTimer = null;
    }
    this.world.cube.twister.finish(); // 提交在飞尾帧
    this.cancelBestPlay();
  }

  private cancelBestPlay(): void {
    if (this.bestPlayTimer !== null) {
      window.clearTimeout(this.bestPlayTimer);
      this.bestPlayTimer = null;
    }
    this.bestPlayQueue = [];
    this.playingBest = false;
    this.rebasing = false;
    this.bestPlayFormula = "";
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
    this.mirrorPush(move); // 原样镜像, 便于肉眼对比 3D 与实体
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
    // 一致时不重绘 (保留进行中的镜像动画流畅性)。predicted 恒跟踪实体态 (镜像原则,
    // 无任何「虚构基准态」模式): 权威帧既是丢事件自愈, 也是 3D 与实体一致的最终保证
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
      if (this.takeoverPending) {
        // 手动→蓝牙接管: 以魔方当前状态直接进入观察态 (首次转动开始计时), 不强制打乱匹配;
        // 想要打乱轮随时点「新打乱」
        this.takeoverPending = false;
        this.nextRoundDirect();
        this.statusText = "已连接魔方: 以魔方当前状态直接还原 (首次转动开始计时), 点「新打乱」生成打乱轮";
      } else {
        this.newScramble();
      }
      return;
    }
    this.judge(raw);
  }

  /** 上次镜像转动事件时刻 (自适应提速用) */
  private lastMirrorAt = 0;

  /** 转动镜像推送 (蓝牙事件/校准): 按物理转动节奏自适应提速。
   * 常速单步动画 30 帧 ≈500ms; 快拧时下一步事件会提前到达, 引擎对同组在途动画
   * 走 CubeGroup.cancel 掐断-瞬移-重启 (twist 的 holding 分支), 表现为大幅跳变
   * 「3D 跟不上」。按事件间隔等比缩短时长 (间隔 250ms → 动画 250ms), 让每步
   * 播完再接下一步, cancel 不再发生, 任意转速下平滑跟随; 慢拧 (>500ms/步) 恒常速。
   * 辅助因子: 跨轴连发需等锁会排队 (同轴不同层可并行), 按积压深度再加速 */
  private mirrorPush(move: string): void {
    const now = Date.now();
    const interval = this.lastMirrorAt ? now - this.lastMirrorAt : 500;
    this.lastMirrorAt = now;
    const byRate = Math.min(1, interval / 500);
    const backlog = this.world.cube.twister.length;
    const byBacklog = backlog > 0 ? Math.pow(0.55, backlog) : 1;
    CubeGroup.durationScale = Math.max(0.067, Math.min(byRate, byBacklog));
    this.world.cube.twister.push(move);
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
    const viewOps = this.effectiveViewOps().map((op) => ({ ...op }));
    const displayMove = this.displayMoveWithOps(move, viewOps);
    const viewSig = JSON.stringify(viewOps);
    if (this.phase === "observing" && !this.isManual) {
      // 自动下轮直接开始: 首次物理转动即开始还原计时 (该步计入还原)
      this.phase = "solving";
      this.solveStart = Date.now();
      this.timerStart = this.solveStart;
      // 守卫按此刻起始态重算 (predicted 尚未应用本步 = 实物拧动前态): 重置/skipScramble
      // 时算过一次, 若 predicted 其间被权威帧校正会过期 —— 实物十字已完成须先拆散才判成功
      this.needBreak = this.isTargetCrossDone(this.predicted || SOLVED_FACELETS);
      this.statusText =
        this.trainMode === "xcross"
          ? "XCross 进行中: 还原" + this.crossTargetText() + "并顺带完成任一组 F2L"
          : "十字进行中: 还原" + this.crossTargetText();
    }
    if (this.predicted) {
      const prev = this.predicted;
      const next = applyFaceletMove(prev, move);
      if (!next) {
        console.warn("[BLECross] move 无法应用到推演态, 已忽略:", move, "| phase:", this.phase);
        return;
      }
      this.predicted = next;
      if (this.phase === "solving") {
        this.userMoves.push(move); // 物理帧记号 (与判定/求解同帧)
        this.userDisplayMoves.push({ physical: move, display: displayMove, viewSig });
        // 步数按 HTM 口径实时化简 (魔方对 180° 转发 2 个 1/4 转事件, D2 应计 1 步)
        this.moveCount = simplifyMoves(this.userMoves).length;
      }
      // 实时镜像 (含打乱匹配阶段: 用户按公式拧动时 3D 跟随, 拧到位即打乱目标态;
      // 首次转动经 previewPending 从预览态/起点态对齐到实物镜像轨道, 避免错位叠加)
      if (this.previewPending) {
        this.previewPending = false;
        // 先对齐本步转动前的实物状态, 再叠加本步动画
        this.syncScene(prev);
        if (this.z2On) {
          this.applyZ2Flip(true);
        }
      }
      this.mirrorPush(displayMove);
      this.judge(next);
    } else {
      // 尚未收到权威状态, 仅镜像动画
      this.mirrorPush(displayMove);
    }
  }

  // ================= 训练判定 =================

  /** 状态提示里的十字目标描述 (按当前持握视角的底面中心色; 判定只认该底色, 见 isTargetCrossDone) */
  private crossTargetText(): string {
    return this.z2On ? "白色十字 (4 条白棱围住白色中心)" : "黄色十字 (4 条黄棱围住黄色中心)";
  }

  /** 当前目标十字 (z2On 选黄/白底) 是否达成。输入 state: 核心帧 (物理帧, 白中心恒在
   * 核心 U 轴): 黄底 (z2On=false) 直接判定核心 D 面黄十字; 白底 (z2On=true) 经
   * toTrainFrame (自逆帧变换 ρ∘r) 把白色十字 (核心 U 面) 转到 D 面判定。
   * 判定只认当前底色对应的十字 —— 不做黄/白「任一完成即算」的双色判定,
   * 否则按黄底练习时白十字恰好完成会误判成功 (忽略当前是什么底)。
   * xcross = 十字 + 围绕同一中心的任一 F2L 槽位 (角+棱), 槽位与十字同帧判定 */
  private isTrainDone(state: string): boolean {
    const sel = this.z2On ? toTrainFrame(state) : state;
    if (this.trainMode === "xcross") {
      return isCrossDone(sel) && f2lSlotsDone(sel).length > 0;
    }
    return isCrossDone(sel);
  }

  /** 整体转序列 = 轮次基准持握 (baseOps) ⊕ 本轮 history 整体转 (时间序, 已合并同向)。
   * 打乱/重置只清 history (setup/syncScene), 基准持握经 baseOps 保留并继续参与映射 */
  private syncObservedOps(): void {
    const fromHistory = this.world.cube.history.list
      // times%4==0 的 z 哨兵 (toggleZ2 隔断跨翻转同面合并用) 不进视图链
      .filter((a) => /^[xyz]$/.test(a.sign) && a.times % 4 !== 0)
      .map((a) => ({ axis: a.sign as BaseOp["axis"], times: a.reverse ? -a.times : a.times }));
    this.observedOps = [...this.baseOps, ...fromHistory];
  }

  /** 完整视图链 = observedOps ⊕ z2 翻转 (z2Marks 标记其在时间线中的插入位置, 越界截到
   * 链尾保翻转奇偶): 整体转与 z2 翻转按真实时序复合, 供核心帧换算 (mapStateForJudge)
   * 与展示换名 (displayFormula/displayMove) —— 对任意混合链数学精确成立。
   * 输出经相邻同轴合并净化 (y·y→y2 / y·y'→消 / z2·z2→消): 旋转恒等变换,
   * 避免 z2 往返/整体转往复后展示记号无限累积 (底色切回后公式仍挂翻转记号) */
  private effectiveViewOps(): BaseOp[] {
    const len = this.observedOps.length;
    const raw: BaseOp[] = [];
    let m = 0;
    for (let i = 0; i <= len; i++) {
      while (m < this.z2Marks.length && Math.min(this.z2Marks[m], len) === i) {
        raw.push({ axis: "z", times: 2 });
        m++;
      }
      if (i < len) {
        raw.push(this.observedOps[i]);
      }
    }
    // 净化: 相邻同轴合并 (同轴相邻可交换, 合并恒等), times%4==0 消除
    const ops: BaseOp[] = [];
    for (const op of raw) {
      const last = ops[ops.length - 1];
      if (last && last.axis === op.axis) {
        const times = (((last.times + op.times) % 4) + 4) % 4;
        if (times === 0) {
          ops.pop();
        } else {
          ops[ops.length - 1] = { axis: op.axis, times };
        }
        continue;
      }
      ops.push({ axis: op.axis, times: op.times });
    }
    return ops;
  }

  /** 重放基准持握 (打乱 setup / 重置回正后恢复 y/y' 基准视角):
   * 瞬间完成, 不入 history —— 姿态映射已由 observedOps = baseOps ⊕ history 表达 */
  private applyBaseOrientation(): void {
    for (const op of this.baseOps) {
      for (const group of this.world.cube.table.groups[op.axis]) {
        group.twist(op.times * (Math.PI / 2), true);
      }
    }
    this.world.dirty = true;
  }

  /** 手动练习屏幕帧状态串 → 真物理核心帧 (位置置换, 中心恢复标准 URFDLB)。
   * 沿完整视图链 (effectiveViewOps, 含 z2Marks 处的 z2 翻转) 做贴纸位置置换:
   * S_core[i] = S_screen[R(i)], R 为姿态位置映射 (ops 按序取 -times 复合)。
   * 对任意 z2/整体转混合链 (z2 先于/后于 y·x·z, 含 newScramble 重放的 z2→baseOps
   * 顺序与共轭残留) 数学精确成立 —— 废除旧「z2 残留恒为纯 z2、按 z2On 奇偶
   * z2Facelets 剥离」假设 (共轭会改变残留贴纸位移, 剥离错位表现为十字误判/
   * F·R·L·B 面侧贴与中心不匹配) */
  mapStateForJudge(state: string): string {
    return rotateFaceletsByOps(state, this.effectiveViewOps());
  }

  /** 当前目标十字 (按视角底色 z2On 选黄/白) 是否完成。输入 state: 核心帧 (物理帧,
   * 中心恒 URFDLB, 与持握/翻转视角无关) —— 蓝牙=predicted/基准态裸串, 手动=
   * mapStateForJudge 沿完整视图链换算串。白底 (z2On) 经 toTrainFrame 转训练帧判定 */
  private isTargetCrossDone(state: string): boolean {
    return isCrossDone(this.z2On ? toTrainFrame(state) : state);
  }

  /** 手动练习: 每次转层动画结束 (鼠标拧动/回弹) 后刷新步数并判定 */
  private onManualTwist(): void {
    if (this.rebasing) {
      return;
    }
    const cube = this.world.cube;
    // 所有输入模式都在整体转落定后同步视图链并重算；层转不会改变签名，因而不会
    // 触发持续重算。蓝牙 y/y' 过去只改显示字母不重求，是公式跨帧的来源之一。
    this.syncObservedOps();
    const sig = JSON.stringify(this.observedOps);
    if (sig !== this.bestRotationSig && this.currentBestBase()) {
      this.recomputeBestFromCurrent();
    }
    if (!this.isManual) {
      return;
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
    // 沿完整视图链位置置换换算成核心帧 (物理帧) 后判定 (中心恢复标准 URFDLB)
    const state = this.mapStateForJudge(cube.serialize());
    if (this.needBreak) {
      // 同 judge: 起始态十字已完成时, 须先拆散才允许判定成功
      if (this.isTargetCrossDone(state)) {
        return;
      }
      this.needBreak = false;
      this.rebaseBestIfDoneBase(state);
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
        return;
      }
      // 公式路径跟踪: state 命中路径任一态 = 仍在按公式打乱 (idx 快进容忍丢事件,
      // 回到路径视为重新按公式对待); 未命中任何路径态 = 已偏离公式 (随手转动)
      if (this.scramblePath.length > 0) {
        const idx = this.scramblePath.indexOf(state);
        if (idx >= 0) {
          if (idx > this.scrambleProgress) {
            this.scrambleProgress = idx;
          }
          this.scrambleDiverged = false;
        } else {
          this.scrambleDiverged = true;
        }
      }
      // 实体十字已完成且已偏离公式路径 (随手转动, 上轮完成态遗留——按公式打乱的
      // 前缀态不触发, 见 scramblePath): 仅提示, 不自动跳过。真机反馈: 自动跳过 +
      // syncScene 显示实体态 = 观感「随手一拨就自动还原」。用户可照公式打乱 (匹配
      // 后自动开轮), 或点「重置」跳过匹配以打乱目标态开轮 (判定以实物为准)
      if (this.scrambleDiverged && this.isTargetCrossDone(state)) {
        this.statusText = "实体十字已完成: 请照公式打乱, 或点「重置」跳过匹配开轮";
      }
      return;
    }
    if (this.phase === "solving") {
      if (this.needBreak) {
        // 起始态十字已完成: 须先观察到十字被拆散才允许判定成功
        if (this.isTargetCrossDone(state)) {
          return;
        }
        this.needBreak = false;
        this.rebaseBestIfDoneBase(state);
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

  /** 基准态十字已完成 (自动下轮直入观察态等) 且观察到十字被拆散:
   * 求解基准切换为拆散后的实际状态并重求最优解 —— 原基准 (完成态) 的解恒为空串,
   * 不切换则整轮显示「十字已复原」误导; 切换后最优解仍相对新基准固定 (不随后续转动重算)。
   * 调用方仅在 needBreak 分支调用 (基准态十字已完成时才可能进入)。
   * 手动: solveBaseState 刷新为当前屏幕帧快照 (syncScene/resetRound 复原用,
   * solveBaseScreenFrame 同步置 true); 蓝牙: solveBaseState=物理帧。
   * requestBest 入参统一核心帧 (与 onManualTwist 的 mapStateForJudge 输出同帧) */
  private rebaseBestIfDoneBase(coreState: string): void {
    if (this.isManual) {
      this.solveBaseState = this.world.cube.serialize();
      this.solveBaseScreenFrame = true;
    } else {
      this.solveBaseState = coreState;
    }
    this.bestSolution = "";
    this.bestReady = false;
    this.bestX = [];
    this.bestXReady = false;
    this.requestBest(coreState);
  }

  private startSolving(baseState?: string, screenFrame = false): void {
    this.phase = "solving";
    this.scramblePath = [];
    this.scrambleProgress = 0;
    this.scrambleDiverged = false;
    this.moveCount = 0;
    this.userMoves = [];
    this.userDisplayMoves = [];
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
    // 记录求解基准态 (打乱目标态; skipScramble/手动模式为当时状态), 模式切换时据此重求。
    // screenFrame: 基准态是否为屏幕帧 (手动 newScramble 在 z2 翻转+基准持握重放后捕获,
    // 已含两者姿态) —— resetRound 重绘时据此决定是否重放 z2 翻转 (屏幕帧已含, 重放会双重翻转)
    this.solveBaseState = baseState || this.scrambleTarget || this.predicted || "";
    this.solveBaseScreenFrame = screenFrame;
    // 判定/求解统一在核心帧 (物理帧, 中心恒 URFDLB): 手动基准态为屏幕帧 (含 z2 翻转
    // +baseOps 姿态), 沿完整视图链 (z2Marks ⊕ observedOps) 位置置换换算; 蓝牙基准态
    // 本就是物理帧恒等。核心帧对任意 z2/整体转混合链精确成立 (废除纯 z2 剥离假设)
    const coreBase = this.solveBaseScreenFrame
      ? this.mapStateForJudge(this.solveBaseState)
      : this.solveBaseState;
    // 起始态十字若已完成 (自动下轮直接开始等): 须先拆散十字, 成功判定才生效
    this.needBreak = this.isTargetCrossDone(coreBase);
    // 记录请求最优解时的整体转签名: 手动练习后续整体转会改变当前视角坐标系, 需据此重求
    this.bestRotationSig = JSON.stringify(this.observedOps);
    // 对打乱态预求最优解 (异步, 完成前结果区显示「求解中…」)。整体转后的重求在 onManualTwist
    if (coreBase) {
      this.requestBest(coreBase);
    }
  }

  /** 当前阶段对应的求解基准态: 打乱等待期用打乱目标态 (提前可见解法),
   * 其余阶段用本轮基准态; 尚无基准 (未打乱) 返回空串 */
  private currentBestBase(): string {
    if (this.phase === "scrambling") {
      return this.scrambleTarget;
    }
    return this.solveBaseState;
  }

  /** 以当前已经落定的 3D 画面重算。调用方若可能仍有在飞动画，应先 finish；
   * world callback 内禁止再次 finish，避免 tweener 完成回调重入。 */
  private recomputeBestFromCurrent(): void {
    if (
      this.phase !== "scrambling" &&
      this.phase !== "observing" &&
      this.phase !== "solving" &&
      this.phase !== "success"
    ) {
      return;
    }
    this.syncObservedOps();
    const viewOps = this.effectiveViewOps();
    const core = this.mapStateForJudge(this.world.cube.serialize());
    if (!core) {
      return;
    }
    this.bestRotationSig = JSON.stringify(this.observedOps);
    this.requestBest(core, viewOps);
  }

  /** 按当前模式求解最优解 (cross 单组 / xcross 4 组槽位并行); 关闭「显示最优解」时不求。
   * 重算时机仅三处: 新打乱/跳过/自动下轮 (startSolving), 按 z2 (toggleZ2), 整体转 y/y'
   * (onManualTwist 视角签名变化) —— 其余转动不重算, 最优解相对本轮打乱态固定 */
  private requestBest(state: string, viewOps: BaseOp[] = this.effectiveViewOps()): void {
    const requestViewOps = viewOps.map((op) => ({ ...op }));
    // 新请求周期先清残留: 避免异步求解期间短暂显示上一轮旧解; 关闭勾选时同样清,
    // 保证之后重新勾选 (saveShowBest) 能凭 bestReady=false 触发补求
    this.bestReqId++; // 作废在飞的慢速求解结果 (新基准下旧解无效)
    this.bestSolution = "";
    this.bestReady = false;
    this.bestX = [];
    this.bestXReady = false;
    this.bestViewOps = [];
    this.bestBaseState = "";
    this.bestStepPos = {}; // 预览游标清零 (新基准/新视角下旧预览步进状态无效)
    if (!this.showBest) {
      return;
    }
    // 病态串防护: 非法状态串 (帧换算 bug 残留) 送入求解器会触发超长搜索阻塞主线程
    // (表现为页面卡死) —— 求解前校验 54 长度/URFDLB 字符/六中心互异, 不合法即放弃
    if (
      !/^[URFDLB]{54}$/.test(state) ||
      new Set([4, 13, 22, 31, 40, 49].map((i) => state.charAt(i))).size !== 6
    ) {
      console.error("[BleCrossTrainer] 非法状态串, 跳过求解:", state);
      this.bestReady = true;
      this.bestXReady = true;
      return;
    }
    if (this.trainMode === "xcross") {
      this.requestBestXCross(state, requestViewOps);
    } else {
      this.requestBestSolution(state, requestViewOps);
    }
  }

  /** 对指定状态求十字最优解 (失败/出错时留空, 展示层显示占位) */
  private bestReqId = 0;
  /** 上次请求最优解时的整体转签名 (observedOps 序列化): 变化则需按新视角重求 */
  private bestRotationSig = "[]";
  private async requestBestSolution(state: string, viewOps: BaseOp[]): Promise<void> {
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
        this.bestBaseState = state;
        this.bestViewOps = viewOps.map((op) => ({ ...op }));
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
  private async requestBestXCross(state: string, viewOps: BaseOp[]): Promise<void> {
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
      this.bestBaseState = state;
      this.bestViewOps = viewOps.map((op) => ({ ...op }));
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
    // 已还原的 F2L 槽位跟随完成的十字: 白十字经训练帧判定后换回物理帧名 (FL↔FR, BL↔BR),
    // 黄十字直接用核心帧槽位名; 再经 slotDisplayName 换到屏幕帧 (与 bestXDisplay 标签
    // 同帧, 完成高亮 indexOf 对比才对得上, 状态栏 "(FL/BR)" 也按屏幕所见)
    if (this.trainMode === "xcross") {
      const train = toTrainFrame(state);
      this.completedSlots = (
        isCrossDone(train) ? f2lSlotsDone(train).map(slotToPhysical) : f2lSlotsDone(state)
      ).map((slot) => this.slotDisplayName(slot));
    } else {
      this.completedSlots = [];
    }
    this.successCount++;
    this.recordTrain(true); // 训练记录: 本轮成功 (观察/还原用时, 最优/实际步数)
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
      console.info("[BLECross] success: 安排自动下轮 (2.5s)");
      this.resultTimer = window.setTimeout(() => {
        this.resultTimer = null;
        try {
          this.nextRoundDirect();
        } catch (e) {
          // 定时器回调异常会静默死亡 (界面停在成功态且不再自动下轮): 显示错误而非吞掉
          console.error("[BLECross] 自动下轮执行异常", e);
          this.statusText = "自动下轮执行异常: " + (e instanceof Error ? e.message : String(e)) + " (可点「新打乱」继续)";
        }
      }, 2500);
    }
  }

  // ================= 打乱 =================

  /** 新一轮: 蓝牙模式以魔方当前物理状态为基准等待拧到目标态; 手动模式直接打乱 3D。
   * 未连接蓝牙时点「新打乱」: 自动进入手动练习模式 (无蓝牙也能完整练习打乱/还原/重置) */
  newScramble(): void {
    if (!this.isManual && this.status !== "connected") {
      this.enterManual(); // 未连接/连接中 (自动重连挂起): 断开在飞连接, 免蓝牙直接练习
    }
    if (this.status !== "connected" && !this.isManual) {
      return;
    }
    // solving 中主动放弃本轮: 计一次失败
    if (this.phase === "solving") {
      this.failCount++;
      this.recordTrain(false); // 训练记录: 本轮放弃 (失败, 还原用时=当时已用时)
      this.running = false;
    }
    if (this.resultTimer !== null) {
      window.clearTimeout(this.resultTimer);
      this.resultTimer = null;
    }
    if (this.isManual) {
      // 手动模式: 3D 魔方直接打乱 (setup 瞬时完成, history 清空后记号从拧动开始累计),
      // 打乱后先进入观察阶段: 可 y/z/x 整体转动观察, 首次转动才开始还原计时。
      // 上一轮遗留持握 (observedOps = 旧 baseOps ⊕ history 整体转) 全量固化为新轮基准,
      // setup 回正后重放: 与 CrossF2L 一致, y/y' 设定的持握方向跨打乱保留
      // (z2 由 z2On 重放, 见下; 只取 history 会丢掉旧 baseOps 贡献)
      const cube = this.world.cube;
      const formula = cube.twister.scrambler();
      this.scramble = formula;
      this.scrambleTarget = "";
      this.predicted = null;
      this.elapsedText = "";
      this.observeText = "";
      cube.twister.finish(); // 排空在飞整体转动画 (drop 未触发则 history 缺记录, 固化会漏)
      this.syncObservedOps(); // 刷新 observedOps (防最后一次转动回调未触发)
      this.baseOps = this.observedOps.slice();
      // 重放链时序: z2 翻转 (若开) 先于 y/y' 基准持握重放 —— z2Marks 记录该时序,
      // 后续核心帧换算按 [z2, ...baseOps, ...history] 复合 (共轭精确, 见 effectiveViewOps)
      this.z2Marks = this.z2On ? [0] : [];
      this.running = false;
      // 贴纸复位: cube.reset 只归位 index 不清贴纸, 而本组件 syncScene 用 stick 改写过
      // 贴纸 (上轮基准态) —— 不复位的话 setup 作用于残留布局, 姿态链路全错。
      // CrossF2L 无此问题 (从不用 stick, 贴纸恒为出厂标准色)。复位后 setup 即作用于
      // 标准初态, 与 CrossF2L startRound 的 setup(exp) 语义完全一致
      this.rebasing = true; // 屏蔽 finish/setup 快转 drop 回调的活体判定: 放弃已计失败, 防中间态再误判成功 (resetRound 同款)
      this.syncScene(SOLVED_FACELETS);
      cube.twister.setup(formula);
      if (this.z2On) {
        this.applyZ2Flip(true); // 先恢复 z2 翻转 (上一轮 z2On 时刻先于 y/y' 持握, 时序一致)
      }
      this.applyBaseOrientation(); // 再重放 y/y' 基准持握
      this.syncObservedOps(); // observedOps = baseOps (供 startSolving 记录整体转签名)
      this.startSolving(cube.serialize(), true); // 基准态=屏幕帧 (已含 z2+baseOps 重放)
      this.rebasing = false; // 重放完毕, 恢复活体判定 (此后 phase 已切 observing)
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
    // 预计算公式路径态 (判定区分「按公式打乱」与「随手转动」, 见 judge scrambling 分支)
    this.scramblePath = [base];
    this.scrambleProgress = 0;
    this.scrambleDiverged = false;
    let pathCur = base;
    for (const token of formula.split(/\s+/)) {
      if (!token) {
        continue;
      }
      const nxt = applyFaceletMove(pathCur, token);
      if (nxt === null) {
        break;
      }
      pathCur = nxt;
      this.scramblePath.push(pathCur);
    }
    this.phase = "scrambling";
    this.requestBest(this.scrambleTarget); // 勾选最优解时打乱等待期即预求解 (相对本轮打乱态固定)
    this.moveCount = 0;
    this.running = false;
    this.elapsedText = "";
    // 点击即直接显示打乱最终态 (瞬时, 不逐步播放动画); 实物照公式拧,
    // 拧到一致自动开始计时。打乱期间 3D 实时跟随转动 (previewPending 首转
    // 从预览态切换到实物镜像轨道), 拧到位时镜像恰好为打乱目标态
    this.syncScene(this.scrambleTarget);
    if (this.z2On) {
      this.applyZ2Flip(true);
    }
    this.previewPending = true;
    this.statusText = "已显示打乱态: 照公式拧实物, 拧到一致后自动开始计时";
  }

  /** 重置本轮 (三模式统一): 计时/步数清零重新观察, 3D 回本轮基准态 (solveBaseState,
   * 与最优解基准一致, 重置不重算最优解)。手动=打乱重放态; 蓝牙=基准态原样显示,
   * 与实体当前态的差异由 previewPending 首转对齐消化, 判定守卫 needBreak 按实体计算;
   * 打乱匹配中重置 = 跳过匹配直接开始 (skipScramble) */
  resetRound(): void {
    if (this.phase === "scrambling") {
      this.skipScramble();
      return;
    }
    if (this.phase !== "observing" && this.phase !== "solving" && this.phase !== "success") {
      return; // ready: 尚无本轮
    }
    if (this.resultTimer !== null) {
      window.clearTimeout(this.resultTimer); // success 展示窗内重置: 取消自动下轮
      this.resultTimer = null;
    }
    this.bestStepPos = {}; // 预览游标清零 (重置后旧预览进度一律无效; 不重算最优解, 旧解仍可用)
    if (this.isManual && this.solveBaseState && this.solveBaseScreenFrame) {
      // 完整公式 = 打乱记号 + 视图链记号 (z2/y/y' 按 effectiveViewOps 真实时序, 同 scrambleText):
      // 复位贴纸后整体重放一次即精确复现当前画面 (贴纸+持握)。共轭场景 (如 y·z2·y') 亦精确 ——
      // 旧「吸收整体转→z2 重放→baseOps 重放」会把轮内 z2 的共轭位置坍缩到链首
      this.world.cube.twister.finish(); // 排空在飞整体转动画 (history 缺记录会漏链)
      this.syncObservedOps();
      const chain = this.effectiveViewOps();
      const tokens = chain
        .map((op) => this.opToken(op))
        .filter(Boolean);
      const complete = tokens.length > 0 ? this.scramble + " " + tokens.join(" ") : this.scramble;
      this.rebasing = true; // 屏蔽 setup 快转 drop 回调的活体判定 (防中间态误判成功)
      this.syncScene(SOLVED_FACELETS); // 复位贴纸 (cube.reset 不清贴纸坑, newScramble 同款)
      this.world.cube.twister.setup(complete); // 完整公式一次打乱 (z2/y/y' 记号 setup 原生支持)
      // 链字段按重放时序重建: z2 翻转保留链中相对位置 (mark = 前方非翻转记号数,
      // 与 effectiveViewOps 互逆)。仅 times%4==2 的 z 项视为 z2 翻转 (姿态等价);
      // 其余 z 轴项 (真实整体转 z/z', 含净化合并产物) 留在 nonZ 原样重放, 丢进
      // marks 会错标为固定 z2 (z'≠z2, 姿态错)
      const nonZ: BaseOp[] = [];
      const marks: number[] = [];
      for (const op of chain) {
        if (op.axis === "z" && ((op.times % 4) + 4) % 4 === 2) {
          marks.push(nonZ.length);
        } else {
          nonZ.push(op);
        }
      }
      this.baseOps = nonZ;
      this.z2Marks = marks;
      this.rebasing = false;
      this.solveBaseState = this.world.cube.serialize();
    }
    // 蓝牙: 3D 回基准态 (solveBaseState, 与最优解基准一致, 重置不重算) —— 用户要求
    // 重置=回本轮起点。基准态与实体当前态的差异由 previewPending 首转对齐消化
    // (首次拧动 syncScene 对齐实物镜像轨道); 权威帧仅在 raw≠predicted 时重绘,
    // predicted 恒跟踪实体故静止时 3D 稳定显示基准态, 不被回拉。
    // 手动: 上方重放后基准=当前屏幕帧, base 即本轮起点
    const base = this.solveBaseState;
    this.moveCount = 0;
    this.userMoves = [];
    this.userDisplayMoves = [];
    this.userSolution = "";
    this.completedSlots = [];
    this.elapsedText = "";
    this.observeText = "";
    if (base) {
      // 3D 回本轮起点 (打乱目标态/跳过态/手动打乱态); syncScene 内清空 history, 手动计数干净。
      // 手动基准态为屏幕帧 (newScramble 已含 z2 翻转+基准持握, stick 绝对重现, 勿再重放 z2,
      // 否则双重翻转回标准姿态); 蓝牙路径基准态为物理帧, 需重放 z2 翻转显示
      this.syncScene(base);
      if (this.z2On && !this.solveBaseScreenFrame) {
        this.applyZ2Flip(true);
      }
    }
    this.running = true;
    if (this.isManual) {
      // 手动/touch 回落轮: 回起点重新观察, 首次转动开始还原计时。
      // 原生轮: 上方姿态链重建后 solveBaseState=屏幕帧, observedOps=baseOps;
      // 蓝牙回落轮: solveBaseState=物理帧, syncScene 后已重放 z2 翻转 → 视图链=[z2?@0]。
      // 两种路径下实时 serialize 与视图链均配套: 核心帧换算/最优解按当前 3D 姿态刷新
      // (无整体转时幂等, 有整体转时与重置前 requote 一致, 兜底保证 best 与基准配套)
      this.syncObservedOps();
      if (!this.solveBaseScreenFrame) {
        this.z2Marks = this.z2On ? [0] : []; // 蓝牙回落轮链重建; 原生轮已在上方按重放时序精确重建
      }
      this.bestRotationSig = JSON.stringify(this.observedOps);
      const coreLive = this.mapStateForJudge(this.world.cube.serialize());
      if (coreLive) {
        this.requestBest(coreLive);
      }
      this.needBreak = this.isTargetCrossDone(coreLive || SOLVED_FACELETS);
      this.phase = "observing";
      this.observeStart = Date.now();
      this.solveStart = 0;
      this.statusText = "已重置回打乱态: 可整体转动观察, 首次转动开始还原计时";
      return;
    }
    // 观察态重开 (蓝牙重置统一): 首次转动才开始还原计时, 与轮首约定一致
    this.observeStart = Date.now();
    this.solveStart = 0;
    this.phase = "observing";
    // 蓝牙路径 (手动分支已在上方 syncObservedOps 重建链): 3D 已由 syncScene 回基准态
    // 姿态 (整体 y 视角不跨重置保留), 视图链同步重建防 displayMove 换名错位
    this.observedOps = [];
    this.z2Marks = this.z2On ? [0] : [];
    // 首次拧动从实物拧动前态对齐镜像轨道 (3D 显示的基准态与实体可能不同步)
    this.previewPending = true;
    // 成功判定守卫按实体当前态 (predicted) 重设, 非显示的基准态: 实体停在十字完成态
    // (如 success 窗内重置) 须先拆散才判成功; 首转时 onMoveEvent 再按起始态重算一次,
    // 防 predicted 在重置与首转之间被权威帧校正后过期
    this.needBreak = this.isTargetCrossDone(this.predicted || SOLVED_FACELETS);
    this.statusText =
      "已重置回本轮基准态: 3D 显示打乱态, 转动即时从实物姿态继续镜像 (首次转动开始计时)";
    // 不主动 requestFacelets: predicted 恒跟踪实体 (转动事件推演 + 周期权威帧校正自愈),
    // 主动请求的迟到快照会与在飞转动事件竞争 (重置→立即转动→旧快照回拉 3D 的时序 bug)
  }

  /** 蓝牙断开自动回落手动 (三模式统一: 会话不丢): 3D 回本轮起点态, 计时/步数清零,
   * 鼠标继续还原; 重新连接后蓝牙再次接管 (以魔方当前状态直接开始) */
  private fallbackToTouch(): void {
    // success 展示窗内断开: 不取消 resultTimer —— 「自动下轮」意图跨断连保留,
    // 2.5s 后 nextRoundDirect 的手动兜底 (isManual → newScramble) 自动开手动打乱轮,
    // 练习节奏不断 (旧实现取消定时器导致用户勾选的自动下轮静默失效)
    console.warn("[BLECross] 蓝牙断开回落手动: phase =", this.phase, "| resultTimer =", this.resultTimer !== null ? "在飞(保留)" : "无");
    this.isManual = true;
    this.baseOps = []; // 蓝牙轮次无手动基准持握, 回落后以标准视角继续
    this.deviceName = "手动模式 (蓝牙已断开)";
    // 打乱匹配中断开时基准是打乱目标态 (startSolving 未执行), 其余阶段用本轮基准态
    const base =
      (this.phase === "scrambling" ? this.scrambleTarget : this.solveBaseState) ||
      this.predicted ||
      SOLVED_FACELETS;
    this.scramble = "";
    this.moveCount = 0;
    this.userMoves = [];
    this.userDisplayMoves = [];
    this.userSolution = "";
    this.completedSlots = [];
    this.elapsedText = "";
    this.observeText = "";
    this.observedOps = [];
    this.syncScene(base);
    if (this.z2On) {
      this.applyZ2Flip(true);
    }
    this.z2Marks = this.z2On ? [0] : []; // 视图链重建: [z2?(当前奇偶)@0], 与重放翻转一致
    this.phase = "observing";
    this.observeStart = Date.now();
    this.solveStart = 0;
    this.running = true; // 驱动观察计时显示
    this.bestRotationSig = "[]";
    // base 为蓝牙轮物理帧: isTargetCrossDone 现已模式无关 (统一核心帧语义, 白底经训练帧)
    this.needBreak = this.isTargetCrossDone(base);
    if (base !== this.solveBaseState) {
      // 基准变化 (打乱匹配中断开/无基准): 最优解按新基准重求 (requestBest 内清残留)
      this.solveBaseState = base;
      this.requestBest(base); // observedOps 已清空, 映射为恒等
    }
    this.statusText = "蓝牙已断开: 已转手动模式, 3D 回本轮起点, 鼠标继续还原 (连接魔方可随时接管)";
  }

  /** 「自动下轮」勾选变更: 持久化偏好; success 展示窗内变更勾选时补齐/撤销
   * 自动下轮安排 (finishSuccess 只在判定成功瞬间读 autoNext, 之后才勾选则永远不触发) */
  saveAutoNext(): void {
    window.localStorage.setItem("bleAutoNext", this.autoNext ? "1" : "0");
    if (this.phase !== "success") {
      return;
    }
    if (this.autoNext && this.resultTimer === null) {
      this.resultTimer = window.setTimeout(() => {
        this.resultTimer = null;
        try {
          this.nextRoundDirect();
        } catch (e) {
          console.error("[BLECross] 自动下轮执行异常", e);
          this.statusText = "自动下轮执行异常: " + (e instanceof Error ? e.message : String(e)) + " (可点「新打乱」继续)";
        }
      }, 2500);
    } else if (!this.autoNext && this.resultTimer !== null) {
      window.clearTimeout(this.resultTimer);
      this.resultTimer = null;
    }
  }

  /** 「显示最优解」勾选变更: 持久化; 中途开启时补求本轮最优解 (打乱等待/观察/还原/完成阶段都补) */
  saveShowBest(): void {
    window.localStorage.setItem("bleShowBest", this.showBest ? "1" : "0");
    const phase = this.phase;
    const base = this.currentBestBase();
    if (
      this.showBest &&
      base &&
      (phase === "scrambling" || phase === "observing" || phase === "solving" || phase === "success") &&
      !this.bestReady &&
      !this.bestXReady
    ) {
      // 手动: 基准串不可直接映射 (屏幕帧快照冻结于轮始), 按当前 3D 姿态实时取核心帧重求
      // (沿完整视图链位置置换); 蓝牙: 基准态即物理帧
      if (this.isManual) {
        const live = this.mapStateForJudge(this.world.cube.serialize());
        if (live) {
          this.requestBest(live);
        }
      } else {
        this.requestBest(base);
      }
    }
  }

  /** 「色块半透明」勾选变更: 独立开关 (淡化朝向 F/R/U 的块; 与「隐藏无关」可同开, 无关块取更透明档), 持久化并立即重刷 */
  saveVisGhost(): void {
    window.localStorage.setItem("bleVisGhost", this.visGhost ? "1" : "0");
    this.applyVisibility();
  }

  /** 「隐藏无关」勾选变更: 独立开关 (无关块更透明, 隐约可见; 与「色块半透明」可同开), 持久化并立即重刷 */
  saveVisHide(): void {
    window.localStorage.setItem("bleVisHide", this.visHide ? "1" : "0");
    this.applyVisibility();
  }

  /** 设置 BLE Cross 专用 3D 背景色；严格限制为 6 位 RGB，非法值回退白色。 */
  setBackgroundColor(value: string): void {
    this.backgroundColor = normalizeBackgroundColor(value);
    window.localStorage.setItem("bleBackgroundColor", this.backgroundColor);
    this.world.dirty = true;
  }

  /** XCross 槽位选择变更: 持久化并重刷 (所需棱块+角块随槽位变化) */
  saveVisSlot(): void {
    window.localStorage.setItem("bleVisSlot", this.visSlot);
    this.applyVisibility();
  }

  /** 块可视化 (两个独立开关, 目标: 不转动魔方也能透视看到十字相关块与目标槽位):
   * 「半透明」= 无关块半透明 (opacity 0.18)，6 个中心块 opacity 0.80;
   * 「隐藏无关」= 无关块更透明 (opacity 0.06, 隐约可见), 中心块不淡化;
   * 开启任一开关时: 十字所需块 (4 棱 / xcross 另加槽位棱角) 贴纸换无光照纯亮材质。
   * 核心约束: serialize→getColor 按材质身份反查色字符, 换未注册材质会得 "?" 破坏序列化
   * —— 故一律用「注册材质 + visible 恒 true」, getColor 补丁查表保 serialize 恒真实。
   * 挂载点: 每次 drop 回调 (所有模式的转层落定) + syncScene (重绘后) + 开关/槽位变更。 */
  private applyVisibility(): void {
    const ghost = this.visGhost;
    const hide = this.visHide;
    const active = ghost || hide;
    const cube = this.world.cube;
    const s = cube.serialize();
    // 状态串 → 位置×世界面 色表 (FACELET_TARGETS 与 serialize 同序分解, 任意姿态成立)
    const posColors: string[][] = [];
    for (let p = 0; p < 27; p++) {
      posColors.push(["", "", "", "", "", ""]);
    }
    for (let i = 0; i < 54; i++) {
      const target = FACELET_TARGETS[i];
      posColors[target[0]][target[1]] = s[i];
    }
    // 训练底色 (与判定 isTrainDone / 求解 toTrainFrame 同帧语义): 黄底训练 = 核心 D 中心;
    // 白底 (z2On) 训练 = 核心 U 中心 —— 白中心恒在核心 U 轴, z2 切白底后高亮 4 条白棱。
    // 不能用世界帧 s[31]: 持握 (z2/y) 会改世界帧中心分布, 与训练目标底色无关
    const core = this.mapStateForJudge(s);
    const bottom = this.z2On ? core[4] : core[31];
    // 所需块位置集: 十字 = 含底色的 4 条棱; xcross 另加所选槽位 (屏幕帧:
    // 前s[22]/右s[13]/后s[49]/左s[40] 中心色) 的棱+角
    const needed = new Set<number>();
    if (active) {
      const bySig = new Map<string, number>();
      for (let p = 0; p < 27; p++) {
        const colors = posColors[p].filter(Boolean);
        if (colors.length >= 2) {
          bySig.set(colors.slice().sort().join(""), p);
        }
      }
      const find = (...colors: string[]): number => {
        const p = bySig.get(colors.slice().sort().join(""));
        return p === undefined ? -1 : p;
      };
      for (const side of [s[13], s[22], s[40], s[49]]) {
        const p = find(bottom, side);
        if (p >= 0) {
          needed.add(p);
        }
      }
      if (this.trainMode === "xcross") {
        const front = s[22];
        const pairs: { [slot: string]: string[] } = {
          FL: [front, s[40]],
          FR: [front, s[13]],
          BL: [s[49], s[40]],
          BR: [s[49], s[13]],
        };
        const pair = pairs[this.visSlot] || pairs.FL;
        const edge = find(pair[0], pair[1]);
        if (edge >= 0) {
          needed.add(edge);
        }
        const corner = find(bottom, pair[0], pair[1]);
        if (corner >= 0) {
          needed.add(corner);
        }
      }
    }
    // 逐块刷材质。等级: 无关块→淡化 (hide 开取更透明档, 涵盖半透明); 所需块→高亮;
    // 半透明模式中心块→80%; 未开启→标准色。getFace(世界面)→局部面: 块姿态任意时也能定位到正确贴纸
    for (let p = 0; p < 27; p++) {
      const piece = cube.cubelets[p];
      if (!piece || !piece.exist) {
        continue;
      }
      const colors = posColors[p].filter(Boolean);
      const irrelevant = active && colors.length > 1 && !needed.has(p);
      const isNeeded = active && colors.length > 1 && needed.has(p);
      const isCenter = colors.length === 1;
      const mode: "normal" | "ghost" | "center" | "soft" | "bright" = irrelevant
        ? hide
          ? "soft"
          : "ghost"
        : isNeeded
        ? "bright"
        : ghost && isCenter
        ? "center"
        : "normal";
      // 塑料体 (frame): 半透明模式下所有块 (含高亮块) 的骨架一律完全隐去, 场景只剩贴纸层
      // —— 用户明确要求零可见骨架 (灰板/黑板都不要); 隐藏档 (半透明关) 无关块骨架同 0.06
      // 隐约, 其余实心; 关闭时按 hollow 偏好恢复
      const frame = piece.frame;
      if (ghost) {
        frame.visible = false;
      } else if (active) {
        frame.visible = true;
        frame.material = mode === "soft" ? VIS_FRAME_SOFT : this.preferance.hollow ? Cubelet.TRANS : Cubelet.CORE;
      } else {
        frame.visible = true;
        frame.material = this.preferance.hollow ? Cubelet.TRANS : Cubelet.CORE;
      }
      for (let w = 0; w < 6; w++) {
        const color = posColors[p][w];
        if (!color) {
          continue;
        }
        const sticker = piece.stickers[piece.getFace(w as FACE)];
        if (!sticker) {
          continue;
        }
        sticker.visible = true;
        sticker.material = mode === "normal" ? Cubelet.LAMBERS[color] : visMaterialOf(color, mode);
      }
    }
    this.world.dirty = true;
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

  /** 练习模式切换: 持久化 + 重置最优解展示; 本轮进行中则重求 —— 最优解随模式变化
   * (cross 单组 / xcross 4 槽位并行), 打乱等待期已按旧模式预求解 (newScramble),
   * 故打乱等待/观察/还原/完成阶段切换都须按当前基准重算一次 */
  saveTrainMode(): void {
    window.localStorage.setItem("bleTrainMode", this.trainMode);
    this.world.cube.twister.finish(); // 模式切换可发生在动画中，先落定再读取当前 3D 状态
    this.recomputeBestFromCurrent();
    this.applyVisibility(); // cross↔xcross 所需块集不同 (xcross 另加槽位棱+角), 重刷可视化
  }

  /** 跳过打乱匹配, 直接开始十字 (不想拧打乱公式 / 持握方向不一致匹配不上时的兜底):
   * 3D 保持显示打乱目标态 (本轮基准/最优解基准不变, 无需重算), 判定恒以实物
   * (predicted) 为准; 实物十字已完成 (如上轮遗留) 时须先拆散才可判定成功 */
  skipScramble(): void {
    if (this.phase !== "scrambling") {
      return;
    }
    const physical = this.predicted || SOLVED_FACELETS;
    this.elapsedText = "";
    this.startSolving(this.scrambleTarget || physical); // 基准=打乱目标态 (最优解不变)
    // 守卫按实物当前态设定 (显示的基准态与实体可能不同, 判定只认实物): 实物十字
    // 已完成则先拆散才判成功
    this.needBreak = this.isTargetCrossDone(physical);
    // 3D 保持打乱目标态不重绘; 首次拧动经 previewPending 从实物拧动前态对齐镜像轨道
    this.previewPending = true;
    this.statusText = "已按打乱态开始: 把实物拧到 3D 显示的状态 (或直接还原十字), 判定以实物为准";
  }

  /** 自动下轮: 生成新打乱公式开新一轮 (等同自动点「新打乱」)——3D 显示打乱目标态,
   * 用户按公式拧实物, 逐层匹配合对后自动预求解最优解; 手动模式/断连兜底同款入口 */
  private nextRoundDirect(): void {
    console.info("[BLECross] nextRoundDirect | isManual:", this.isManual, "| status:", this.status, "| phase:", this.phase);
    this.newScramble();
  }

  // ================= 3D 场景同步 =================

  /** 把 3D 场景直接设置为指定 54 串状态 (物理帧; reset 后按 serialize 同序逐贴纸上色)。
   * z2On 的翻转姿态由调用方随后 applyZ2Flip 恢复 */
  private syncScene(facelets: string): void {
    const cube = this.world.cube;
    if (this.playingBest) {
      this.cancelBestPlay(); // 打断预览: 新打乱/重置/权威重绘即将整体重建画面
    }
    try {
      cube.twister.finish(); // 排空在飞动画 (重入链异常已被 tweener/group 兜底, 此处再隔离防阻断重绘)
    } catch (e) {
      console.error("[BLECross] twister.finish 排空异常, 跳过继续重绘", e);
    }
    cube.reset();
    cube.history.clear(); // 手动模式按 history 计步/展示解法: 重绘即重置 (蓝牙模式不读 history)
    for (let i = 0; i < 54; i++) {
      const target = FACELET_TARGETS[i];
      cube.stick(target[0], target[1], facelets[i]);
    }
    cube.dirty = true;
    this.applyVisibility(); // stick 已把全部贴纸复位为标准材质: 按当前偏好重刷可视化
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
    if (this.gifRecording) {
      // 按 GIF 帧延迟采样 (80ms/帧 ≈ 12.5fps, 与播放速率一致; 逐 rAF 录帧文件会过大)
      const now = performance.now();
      if (now - this.gifLast >= BleCrossTrainer.GIF_DELAY * 10) {
        this.gifLast = now;
        this.recordGif();
      }
      // 一键演示: 自动播放结束后停留 ~0.5s 尾帧, 再自动打包下载
      if (this.gifAuto && this.gifPlayStarted && !this.playingBest) {
        if (this.gifPlayEndAt === 0) {
          this.gifPlayEndAt = now;
        } else if (now - this.gifPlayEndAt > 500) {
          this.finishGif();
        }
      }
    }
  }

  // ================= 训练记录 =================

  loadRecords(): void {
    try {
      const raw = window.localStorage.getItem(RECORDS_KEY);
      this.records = raw ? (JSON.parse(raw) as TrainRecord[]) : [];
    } catch {
      this.records = [];
    }
  }

  private saveRecords(): void {
    try {
      window.localStorage.setItem(RECORDS_KEY, JSON.stringify(this.records.slice(0, RECORDS_MAX)));
    } catch {
      // 存储满/被禁用等异常静默, 不影响训练
    }
  }

  /** 结算一轮: 判定成功或 solving 放弃时记录 (最新在前, 上限截断)。
   * obs=观察用时 (手动模式, 蓝牙无观察计时记 null); solve=还原用时 (放弃=当时已用时);
   * best=最优解步数 (未就绪 -1); steps=用户实际步数 (HTM 化简口径) */
  private recordTrain(ok: boolean): void {
    const rec: TrainRecord = {
      t: Date.now(),
      mode: this.trainMode,
      ok,
      obs: this.isManual && this.observeStart && this.solveStart ? (this.solveStart - this.observeStart) / 1000 : null,
      solve: this.solveStart ? (Date.now() - this.solveStart) / 1000 : null,
      best: this.bestReady && this.bestSolution ? this.bestMovesOf(this.bestSolution).length : -1,
      steps: this.moveCount,
    };
    this.records.unshift(rec);
    if (this.records.length > RECORDS_MAX) {
      this.records.length = RECORDS_MAX;
    }
    this.saveRecords();
  }

  /** 表格数据: 最近 N 条 (最新在上) */
  get recordsView(): TrainRecord[] {
    return this.records.slice(0, this.recLimit);
  }

  /** 最近 N 条统计: 成功率 + 平均观察/还原用时 + 平均最优/实际步数 */
  get recStats(): { n: number; okRate: string; avgObs: string; avgSolve: string; avgBest: string; avgSteps: string } {
    const rs = this.records.slice(0, this.recLimit);
    const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "-");
    const obs = rs.map((r) => r.obs).filter((x): x is number => x !== null);
    const solve = rs.map((r) => r.solve).filter((x): x is number => x !== null);
    const best = rs.map((r) => r.best).filter((x) => x >= 0);
    return {
      n: rs.length,
      okRate: rs.length ? Math.round((rs.filter((r) => r.ok).length / rs.length) * 100) + "%" : "-",
      avgObs: avg(obs) + "s",
      avgSolve: avg(solve) + "s",
      avgBest: best.length ? (best.reduce((a, b) => a + b, 0) / best.length).toFixed(1) : "-",
      avgSteps: avg(rs.map((r) => r.steps)),
    };
  }

  fmtRecTime(t: number): string {
    const d = new Date(t);
    const pad = (x: number) => (x < 10 ? "0" + x : "" + x);
    return d.getMonth() + 1 + "-" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  fmtRecSec(v: number | null): string {
    return v === null ? "-" : v.toFixed(1) + "s";
  }

  clearRecords(): void {
    if (window.confirm("确定清空全部训练记录?")) {
      this.records = [];
      this.saveRecords();
    }
  }

  saveRecLimit(): void {
    try {
      window.localStorage.setItem("bleRecLimit", String(this.recLimit));
    } catch {
      // 忽略
    }
  }

  // ================= GIF 录制 (参考 Director: 独立 filmer 离屏渲染逐帧采样) =================

  /** GIF 录制中 (按钮切停止态); 采样与落盘见 toggleGif/finishGif */
  gifRecording = false;
  gifFrames = 0;
  /** 一键演示: 重置→自动播放最优解→播完自动下载 (播放为纯视觉预览, 不触发判定) */
  private gifAuto = false;
  private gifPlayStarted = false;
  private gifPlayEndAt = 0;
  private static GIF_PIXEL = 384;
  private static GIF_DELAY = 8; // 每帧显示时长, 单位 1/100 秒 (8 = 80ms ≈ 12.5fps)
  private filmer: THREE.WebGLRenderer | null = null;
  private gif: GIF | null = null;
  private gifPixels: Uint8Array | null = null;
  private gifLast = 0;

  /** 开始/停止 GIF 录制: 手动模式且有最优解时一键演示 (重置→自动播放→自动下载),
   * 否则纯手动录制 (再点一次停止并下载) */
  toggleGif(): void {
    if (this.gifRecording) {
      this.finishGif(); // 录制中再点 = 提前停止并下载
      return;
    }
    const formula = this.isManual ? this.gifPlayTarget() : "";
    if (formula) {
      this.resetRound(); // 重置: 回打乱态 + 观察阶段, 预览游标/进度清零
      this.startGif();
      this.gifAuto = true; // startGif 复位演示标志, 须在其后置位 (loop 据此自动收尾)
      window.setTimeout(() => {
        if (!this.gifRecording) {
          return;
        }
        this.gifPlayStarted = true;
        this.playBest(formula);
      }, 700); // 先录 ~8 帧打乱态静止, 再开始播放
    } else {
      this.startGif();
    }
  }

  /** 一键演示的播放目标: Cross 用最优解; XCross 取第一个有解槽位 (原始记号, playBest 内部换名) */
  private gifPlayTarget(): string {
    if (this.trainMode === "xcross") {
      const hit = this.bestX.find((b) => b.steps > 0 && b.formula);
      return hit ? hit.formula : "";
    }
    return this.bestReady && this.bestSolution ? this.bestSolution : "";
  }

  private startGif(): void {
    const pixel = BleCrossTrainer.GIF_PIXEL;
    if (!this.filmer) {
      this.filmer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
      this.filmer.setPixelRatio(1);
    }
    this.filmer.setSize(pixel, pixel, true);
    this.filmer.setClearColor(this.gifBackColor(), 1); // 背景色随页面实际底色 (录进 GIF)
    this.gif = new GIF(COLORS);
    this.gif.start(pixel, pixel, BleCrossTrainer.GIF_DELAY);
    this.gifPixels = new Uint8Array(pixel * pixel * 4);
    this.gifFrames = 0;
    this.gifLast = 0;
    this.gifAuto = false;
    this.gifPlayStarted = false;
    this.gifPlayEndAt = 0;
    this.gifRecording = true;
    this.recordGif(); // 首帧立即录制
  }

  /** 3D 区域实际底色: 沿 viewport 元素向上找第一个非透明背景, GIF 录同色背景 */
  private gifBackColor(): number {
    let node = (this.$refs.viewport as Vue)?.$el as HTMLElement | null;
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        const m = bg.match(/(\d+),\s*(\d+),\s*(\d+)/);
        if (m) {
          return (parseInt(m[1], 10) << 16) | (parseInt(m[2], 10) << 8) | parseInt(m[3], 10);
        }
      }
      node = node.parentElement;
    }
    return 0xffffff;
  }

  /** 录一帧: 临时把世界切到离屏尺寸渲染读像素, 完成即恢复 (照 Director.record) */
  private recordGif(): void {
    if (!this.filmer || !this.gif || !this.gifPixels) {
      return;
    }
    const pixel = BleCrossTrainer.GIF_PIXEL;
    const width = this.world.width;
    const height = this.world.height;
    this.world.width = pixel;
    this.world.height = pixel;
    this.world.resize();
    this.filmer.clear();
    this.filmer.render(this.world.scene, this.world.camera);
    const content = this.filmer.getContext();
    content.readPixels(0, 0, pixel, pixel, content.RGBA, content.UNSIGNED_BYTE, this.gifPixels);
    this.gif.add(this.gifPixels);
    this.gifFrames++;
    this.world.width = width;
    this.world.height = height;
    this.world.resize();
  }

  private finishGif(): void {
    this.gifRecording = false;
    this.gifAuto = false;
    this.gifPlayStarted = false;
    this.gifPlayEndAt = 0;
    if (!this.gif || this.gifFrames === 0) {
      this.gif = null;
      return;
    }
    this.gif.finish();
    const blob = new Blob([this.gif.out.getData()], { type: "image/gif" });
    const url = URL.createObjectURL(blob);
    Util.DOWNLOAD("blecross", "gif", url);
    this.gif = null;
  }

  // ================= 帮助 =================

  helpDialog = false;
}
