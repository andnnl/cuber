import { Component, Provide, Ref, Vue } from 'vue-property-decorator';
import World from '../../cuber/world';
import Cube from '../../cuber/cube';
import { PaletteData, PreferanceData } from '../../data';
import { AdvancedF2LCase, AdvancedF2LSelection, advancedF2LCapturePlan, applyAdvancedF2LMask, selectAdvancedF2LCase } from '../../ble/adv-f2l';
import Capture from '../Algs/capture';
import Viewport from '../Viewport';
import Setting from '../Setting';
import './index.css';

const data: { cases: AdvancedF2LCase[] } = require('./data.json');
const GROUPS = [
  { key: 'Trapped Corner', label: '角块受困' },
  { key: 'Trapped Edge', label: '棱块受困' },
  { key: 'Both Pieces Trapped', label: '角棱均受困' },
];
const DIRECTIONS = ['前右', '前左', '后左', '后右'];

@Component({ template: require('./index.html'), components: { viewport: Viewport, setting: Setting } })
export default class AdvancedF2L extends Vue {
  @Provide('world') world = new World();
  @Provide('preferance') preferance = new PreferanceData(this.world);
  @Provide('palette') palette = new PaletteData(this.world);
  @Ref('viewport') viewport: Viewport;

  readonly cases = data.cases;
  readonly groups = GROUPS;
  readonly directions = DIRECTIONS;
  group = GROUPS[0].key;
  selected: AdvancedF2LCase = data.cases[0];
  direction = 0;
  variant = 0;
  selection: AdvancedF2LSelection | null = null;
  step = 0;
  playing = false;
  pauseRequested = false;
  error = '';
  z2On = window.localStorage.getItem('advF2LZ2') === '1';
  hideUnrelated = window.localStorage.getItem('advF2LHideUnrelated') === '1';
  previews: Record<string, string> = {};

  private generation = 0;
  private frame: number | null = null;
  private active = true;
  private resizeObserver: ResizeObserver | null = null;
  private capture: Capture | null = null;
  private previewFrame: number | null = null;
  private readonly previewCube = new Cube(3);
  private displayPlan: ReturnType<typeof advancedF2LCapturePlan> | null = null;

  get filteredCases(): AdvancedF2LCase[] { return this.cases.filter(item => item.subgroup === this.group); }
  get currentMoves(): string[] { return this.selection ? this.selection.moves : []; }

  mounted(): void {
    // 案例公式只由按钮控制，拖动魔方可调整视角但不误转小层。
    this.world.controller.lock = true;
    this.$nextTick(() => {
      // data.ts 的主题设置引用根 Vue 实例；首次挂载时需等实例构造完成。
      this.preferance.refresh();
      this.palette.refresh();
      this.renderPreviews();
      this.resize();
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.$refs.cubeArea as HTMLElement);
      } else window.addEventListener('resize', this.resize);
      this.selectCase(this.selected);
      this.draw();
    });
  }

  beforeDestroy(): void {
    this.onAppDeactivate();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);
    this.world.controller.stop();
    this.capture?.renderer.dispose();
  }

  onAppDeactivate(): void {
    this.active = false;
    this.pause();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.previewFrame !== null) cancelAnimationFrame(this.previewFrame);
    this.previewFrame = null;
  }

  onAppActivate(): void {
    if (this.active) return;
    this.active = true;
    this.resize();
    this.draw();
    this.renderPreviews();
  }

  previewKey(item: AdvancedF2LCase): string { return `${item.id}:${this.direction}:${Number(this.z2On)}`; }

  private renderPreviews(): void {
    if (this.previewFrame !== null) cancelAnimationFrame(this.previewFrame);
    this.previewFrame = null;
    const pending = this.filteredCases.filter(item => !this.previews[this.previewKey(item)]);
    if (!pending.length || !this.active) return;
    try { if (!this.capture) this.capture = new Capture(); }
    catch { this.error = '案例图标暂时无法渲染，请检查浏览器的 WebGL 支持。'; return; }
    const renderBatch = (): void => {
      this.previewFrame = null;
      for (let count = 0; count < 2 && pending.length; count++) {
        const item = pending.shift()!;
        const plan = advancedF2LCapturePlan(item, this.z2On, this.direction, this.previewCube);
        this.$set(this.previews, this.previewKey(item), this.capture!.snap(plan.strip, plan.exp, 3, plan.blackCubelets));
      }
      if (pending.length) this.previewFrame = requestAnimationFrame(renderBatch);
    };
    this.previewFrame = requestAnimationFrame(renderBatch);
  }

  resize(): void {
    const area = this.$refs.cubeArea as HTMLElement;
    if (area && this.viewport && area.clientWidth && area.clientHeight)
      this.viewport.resize(area.clientWidth, area.clientHeight);
  }

  private draw(): void {
    if (!this.active) return;
    this.viewport?.draw();
    this.frame = requestAnimationFrame(() => this.draw());
  }

  selectGroup(group: string): void {
    if (this.group === group) return;
    this.group = group;
    this.selectCase(this.filteredCases[0]);
  }

  selectCase(item: AdvancedF2LCase): void {
    this.selected = item;
    this.direction = 0;
    this.variant = 0;
    this.rebuild();
    this.renderPreviews();
  }

  selectDirection(index: number): void {
    if (index === this.direction) return;
    this.direction = index;
    this.variant = 0;
    this.rebuild();
    this.renderPreviews();
  }

  selectVariant(index: number): void {
    if (index === this.variant) return;
    this.variant = index;
    this.rebuild();
  }

  toggleZ2(): void {
    window.localStorage.setItem('advF2LZ2', this.z2On ? '1' : '0');
    this.rebuild();
    this.renderPreviews();
  }

  toggleHideUnrelated(): void {
    window.localStorage.setItem('advF2LHideUnrelated', this.hideUnrelated ? '1' : '0');
    applyAdvancedF2LMask(this.world.cube, this.hideUnrelated ? this.displayPlan : null);
  }

  private rebuild(): void {
    // 清掉排队的旧动作并结束在途转层，避免切公式后回调改写新题的步数。
    this.generation++;
    this.playing = false;
    this.pauseRequested = false;
    this.world.cube.twister.discardPending();
    this.step = 0;
    this.error = '';
    this.displayPlan = null;
    applyAdvancedF2LMask(this.world.cube, null);
    try {
      this.selection = selectAdvancedF2LCase(this.selected, this.direction, this.variant);
      this.displayPlan = advancedF2LCapturePlan(this.selected, this.z2On, this.direction, this.previewCube, this.variant);
      this.world.cube.twister.setup(this.displayPlan.exp);
      applyAdvancedF2LMask(this.world.cube, this.hideUnrelated ? this.displayPlan : null);
    } catch (error) {
      this.selection = null;
      this.world.cube.twister.setup(this.z2On ? 'z2' : '');
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  pause(): void {
    // 当前一步结束后才暂停，游标与 3D 状态保持一致。
    this.pauseRequested = true;
  }

  toStart(): void {
    this.rebuild();
  }

  private animateMove(move: string): Promise<void> {
    return new Promise(resolve => {
      const cube = this.world.cube;
      const done = () => {
        const index = cube.callbacks.indexOf(done);
        if (index >= 0) cube.callbacks.splice(index, 1);
        resolve();
      };
      cube.callbacks.push(done);
      cube.twister.push(move);
    });
  }

  async previous(): Promise<void> {
    if (this.playing || !this.selection || this.step === 0) return;
    this.playing = true;
    const serial = ++this.generation;
    const move = this.selection.inverse[this.selection.moves.length - this.step];
    try {
      await this.animateMove(move);
      if (serial === this.generation) this.step--;
    } finally { if (serial === this.generation) this.playing = false; }
  }

  async next(): Promise<void> {
    if (this.playing || !this.selection || this.step >= this.currentMoves.length) return;
    this.playing = true;
    const serial = ++this.generation;
    try {
      await this.animateMove(this.currentMoves[this.step]);
      if (serial === this.generation) this.step++;
    } finally { if (serial === this.generation) this.playing = false; }
  }

  async play(): Promise<void> {
    if (this.playing || !this.selection) return;
    this.playing = true;
    this.pauseRequested = false;
    const serial = ++this.generation;
    try {
      while (serial === this.generation && !this.pauseRequested && this.step < this.currentMoves.length) {
        const move = this.currentMoves[this.step];
        await this.animateMove(move);
        if (serial === this.generation) this.step++;
      }
    } finally { if (serial === this.generation) this.playing = false; }
  }
}
