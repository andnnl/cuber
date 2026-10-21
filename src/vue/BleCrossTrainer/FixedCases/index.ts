import { Component, Prop, Provide, Ref, Vue, Watch } from 'vue-property-decorator';
import World from '../../../cuber/world';
import { TwistAction } from '../../../cuber/twister';
import Viewport from '../../Viewport';
import { PreferanceData } from '../../../data';
import { CrossAnalysisClient } from '../../../wasm/CrossAnalysisClient';
import { GripRoute, simpleGripInstruction } from '../../CrossF2LTrainer/recommendations';
import { FIXED_CASES, FixedCase, fixedMoveHint, invertFixedMoves } from '../fixed-cases';
import { paintCubeVisibility, pieceColorSignature } from '../visibility';

@Component({ template: require('./index.html'), components: { viewport: Viewport } })
export default class FixedCases extends Vue {
  @Prop({ default: false }) ghost: boolean;
  @Prop({ default: false }) hide: boolean;
  @Prop({ default: '#FFFFFF' }) background: string;
  @Prop({ default: 'global' }) backgroundMode: string;
  @Prop({ default: () => [] }) presets: { name: string; value: string }[];
  @Provide('world') world = new World();
  @Provide('preferance') preferance = new PreferanceData(this.world);
  @Ref('caseViewport') caseViewport: Viewport;
  cases = FIXED_CASES;
  group: FixedCase['group'] = '普通情况';
  selected: FixedCase = FIXED_CASES[0];
  step = 0;
  playing = false;
  scoring = false;
  gripVersion: 'simple' | 'full' = 'simple';
  route: GripRoute | null = null;
  routes: GripRoute[] = [];
  selectedRouteIndex = 0;
  error = '';
  z2On = window.localStorage.getItem('bleFixedCaseZ2') === '1';
  neededSignatures = new Set<string>();
  private client = new CrossAnalysisClient();
  private frame = 0;
  private generation = 0;
  private resizeObserver: ResizeObserver | null = null;

  get visibleCases(): FixedCase[] { return this.cases.filter(item => item.group === this.group); }
  get instructions(): string[] {
    return this.selected.moves.map((move, index) => this.route?.steps[index]
      ? (this.gripVersion === 'simple' ? simpleGripInstruction(this.route.steps[index]) :
        `${this.route.steps[index].movement}：${this.route.steps[index].instruction}`) : fixedMoveHint(move));
  }

  mounted(): void {
    this.preferance.refresh();
    // 3D 拖动只允许整体换视角；手指误触某层不改案例公式。
    this.world.controller.lock = true;
    this.world.controller.wholeTurnCallbacks.push(this.onWholeTurn);
    this.world.callbacks.push(this.applyVisibility);
    this.$nextTick(() => {
      this.resize();
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.$refs.caseCanvas as HTMLElement);
      } else window.addEventListener('resize', this.resize);
      this.draw();
      this.select(this.selected);
    });
  }

  beforeDestroy(): void {
    this.generation++;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);
    this.client.dispose();
    const wholeTurn = this.world.controller.wholeTurnCallbacks.indexOf(this.onWholeTurn);
    if (wholeTurn >= 0) this.world.controller.wholeTurnCallbacks.splice(wholeTurn, 1);
    const callback = this.world.callbacks.indexOf(this.applyVisibility);
    if (callback >= 0) this.world.callbacks.splice(callback, 1);
    this.world.controller.stop();
  }

  resize(): void {
    const element = this.$refs.caseCanvas as HTMLElement;
    if (element && this.caseViewport && element.clientWidth && element.clientHeight) {
      this.caseViewport.resize(element.clientWidth, element.clientHeight);
    }
  }

  draw(): void {
    this.caseViewport?.draw();
    this.frame = requestAnimationFrame(() => this.draw());
  }

  changeGroup(group: FixedCase['group']): void {
    if (this.playing) return;
    this.group = group;
    this.select(this.visibleCases[0]);
  }

  @Watch('ghost')
  @Watch('hide')
  onVisibilityOption(): void { this.applyVisibility(); }

  private applyVisibility(): void {
    paintCubeVisibility(this.world, this.neededSignatures, this.ghost, this.hide, this.preferance.hollow);
  }

  private onWholeTurn(axis: string, times: number): void {
    if (times % 4 === 0) return;
    this.applied.push(new TwistAction(axis[0], times < 0, Math.abs(times)).value);
    // 只追踪动作以便下次重建，不重选十字目标颜色签名。
  }

  toggleZ2(): void {
    if (this.playing) return;
    this.z2On = !this.z2On;
    window.localStorage.setItem('bleFixedCaseZ2', this.z2On ? '1' : '0');
    this.select(this.selected);
  }

  setBackground(value: string): void {
    if (/^#[0-9a-f]{6}$/i.test(value)) this.$emit('set-background', value.toUpperCase());
  }

  selectRoute(index: number): void {
    if (index < 0 || index >= this.routes.length) return;
    this.selectedRouteIndex = index;
    this.route = this.routes[index];
  }

  // 用独立场景从还原态执行逆公式；不读写 BLECross 的 world、计时器或训练记录。
  select(item: FixedCase): void {
    this.generation++;
    this.client.cancel();
    this.playing = false;
    this.selected = item;
    this.step = 0;
    this.route = null;
    this.routes = [];
    this.selectedRouteIndex = 0;
    this.error = '';
    // 在自己的魔方中逆向撤销已走的前缀，免去 Cube.reset() 对全局动画队列的影响。
    this.rewind();
    const serial = this.generation;
    if (item.scoreable) {
      this.scoring = true;
      this.client.request<GripRoute[]>('scoreFixedCase', { moves: item.moves, limit: 4 }).then(routes => {
        if (serial === this.generation) {
          this.routes = routes;
          this.selectRoute(0);
        }
      }).catch(err => {
        if (serial === this.generation) this.error = `指法评分不可用：${err.message}`;
      }).then(() => { if (serial === this.generation) this.scoring = false; });
    } else this.scoring = false;
  }

  private applied: string[] = [];
  private rewind(): void {
    const cube = this.world.cube;
    // 拖动刚放手时，只结束本案例仍在飞行的转层；不触碰全局 tweener 或主训练动画。
    for (const axis of ['x', 'y', 'z']) {
      for (const group of cube.table.groups[axis]) group.finish();
    }
    // 第一次场景为空；之后先撤销上次构造/播放的动作，然后重建新的案例。
    for (const move of invertFixedMoves(this.applied)) {
      cube.twister.twist(new TwistAction(move), true, true);
    }
    this.applied = [];
    // 默认黄底(D 身份)；z2 后白底(U 身份)，公式以翻转后的当前朝向执行。
    if (this.z2On) {
      cube.twister.twist(new TwistAction('z2'), true, true);
      this.applied.push('z2');
    }
    const bottom = this.z2On ? 'U' : 'D';
    this.neededSignatures = new Set(['R', 'F', 'L', 'B'].map(side => pieceColorSignature([bottom, side])));
    for (const move of invertFixedMoves(this.selected.moves)) {
      cube.twister.twist(new TwistAction(move), true, true);
      this.applied.push(move);
    }
    cube.dirty = true;
    this.applyVisibility();
  }

  private instantTo(index: number): void {
    const cube = this.world.cube;
    while (this.step > index) {
      const move = invertFixedMoves([this.selected.moves[this.step - 1]])[0];
      cube.twister.twist(new TwistAction(move), true, true);
      this.applied.push(move);
      this.step--;
    }
    while (this.step < index) {
      const move = this.selected.moves[this.step];
      cube.twister.twist(new TwistAction(move), true, true);
      this.applied.push(move);
      this.step++;
    }
    cube.dirty = true;
    this.applyVisibility();
  }

  toStart(): void { if (!this.playing) this.instantTo(0); }
  async previous(): Promise<void> {
    if (this.playing || this.step === 0) return;
    this.playing = true;
    const serial = ++this.generation;
    try {
      const move = invertFixedMoves([this.selected.moves[this.step - 1]])[0];
      await this.animateMove(move);
      if (serial === this.generation) {
        this.applied.push(move);
        this.step--;
      }
    } finally { if (serial === this.generation) this.playing = false; }
  }

  async next(): Promise<void> {
    if (this.playing || this.step >= this.selected.moves.length) return;
    this.playing = true;
    const serial = ++this.generation;
    try {
      const move = this.selected.moves[this.step];
      await this.animateMove(move);
      if (serial === this.generation) {
        this.applied.push(move);
        this.step++;
      }
    } finally { if (serial === this.generation) this.playing = false; }
  }

  private animateMove(move: string): Promise<void> {
    return new Promise<void>(resolve => {
      const cube = this.world.cube;
      const done = () => {
        const at = cube.callbacks.indexOf(done);
        if (at >= 0) cube.callbacks.splice(at, 1);
        resolve();
      };
      cube.callbacks.push(done);
      cube.twister.push(move);
    });
  }

  async play(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    const serial = ++this.generation;
    try {
      while (this.step < this.selected.moves.length && serial === this.generation) {
        const move = this.selected.moves[this.step];
        // 只在独立魔方上播放；每一步等本次动画结束再推进。
        await this.animateMove(move);
        if (serial !== this.generation) break;
        this.applied.push(move);
        this.step++;
      }
    } finally { if (serial === this.generation) this.playing = false; }
  }
}
