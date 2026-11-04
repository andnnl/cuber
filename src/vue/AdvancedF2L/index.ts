import { Component, Provide, Ref, Vue } from 'vue-property-decorator';
import World from '../../cuber/world';
import Cube from '../../cuber/cube';
import { PaletteData, PreferanceData, PRESET_PALETTES } from '../../data';
import { AdvancedF2LCase, AdvancedF2LSelection, selectAdvancedF2LCase } from '../../ble/adv-f2l';
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
  previews: Record<number, string[][]> = {};

  private generation = 0;
  private frame: number | null = null;
  private active = true;
  private resizeObserver: ResizeObserver | null = null;

  get filteredCases(): AdvancedF2LCase[] { return this.cases.filter(item => item.subgroup === this.group); }
  get currentMoves(): string[] { return this.selection ? this.selection.moves : []; }

  mounted(): void {
    // 案例公式只由按钮控制，拖动魔方可调整视角但不误转小层。
    this.world.controller.lock = true;
    const previewCube = new Cube(3);
    const previews: Record<number, string[][]> = {};
    for (const item of this.cases) {
      previewCube.twister.setup(item.setup.replace(/([URFDLBMESxyzurfdlb])2'/g, '$12'));
      const facelets = previewCube.serialize();
      previews[item.id] = [0, 18, 9].map(start => facelets.slice(start, start + 9)
        .split('').map(face => PRESET_PALETTES['默认'][face] || '#888888'));
    }
    this.previews = previews;
    this.$nextTick(() => {
      // data.ts 的主题设置引用根 Vue 实例；首次挂载时需等实例构造完成。
      this.preferance.refresh();
      this.palette.refresh();
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
  }

  onAppDeactivate(): void {
    this.active = false;
    this.pause();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  onAppActivate(): void {
    if (this.active) return;
    this.active = true;
    this.resize();
    this.draw();
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
  }

  selectDirection(index: number): void {
    if (index === this.direction) return;
    this.direction = index;
    this.variant = 0;
    this.rebuild();
  }

  selectVariant(index: number): void {
    if (index === this.variant) return;
    this.variant = index;
    this.rebuild();
  }

  private rebuild(): void {
    // 清掉排队的旧动作并结束在途转层，避免切公式后回调改写新题的步数。
    this.generation++;
    this.playing = false;
    this.pauseRequested = false;
    this.world.cube.twister.discardPending();
    this.step = 0;
    this.error = '';
    try {
      this.selection = selectAdvancedF2LCase(this.selected, this.direction, this.variant);
      this.world.cube.twister.setup(this.selection.inverse.join(' '));
    } catch (error) {
      this.selection = null;
      this.world.cube.twister.setup('');
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
