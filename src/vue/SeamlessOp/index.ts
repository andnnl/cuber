import { Component, Provide, Ref, Vue } from 'vue-property-decorator';
import Cube from '../../cuber/cube';
import World from '../../cuber/world';
import { PreferanceData, PaletteData } from '../../data';
import { generateOpCase, OpCase, OpCaseMode, OpItem } from '../../ble/op-case';
import { OpTraining, OpRecord } from '../../ble/op-training';
import { OpView, opWindow, OpWindow, recommendOpWindow, scoreOpWindow } from '../../ble/op-window';
import { traceOpStickers, OpTrace } from '../../ble/op-sticker-trace';
import { projectOpStickers, OpPoint } from './sticker-overlay';
import Viewport from '../Viewport';
import Setting from '../Setting';
import './index.css';

const groups: Array<{ name: string; items: OpItem[] }> = require('../Algs/algs.json');
const PLL = groups.find(group => group.name === 'PLL')!.items;
const OLL = groups.find(group => group.name === 'OLL')!.items;
const simulator = new Cube(3);
const simulate = (moves: string[]): string => {
  simulator.twister.setup(moves.join(' '));
  return simulator.serialize();
};
const SETTINGS = 'seamlessOpSettings';
type Settings = { mode: OpCaseMode; pllNames: string[]; ollNames: string[]; customOll: string; useCustom: boolean };
const defaults = (): Settings => ({ mode: 'pll', pllNames: [], ollNames: [], customOll: '', useCustom: false });

@Component({ template: require('./index.html'), components: { viewport: Viewport, setting: Setting } })
export default class SeamlessOp extends Vue {
  readonly PLL = PLL;
  readonly OLL = OLL;
  @Provide('world') world: World = new World();
  @Provide('preferance') preferance: PreferanceData = new PreferanceData(this.world);
  @Provide('palette') palette: PaletteData = new PaletteData(this.world);
  @Ref('viewport') viewport: Viewport;

  settings: Settings = defaults();
  training: OpTraining | null = null;
  feedback = '';
  view: OpView = 'FR';
  trace: OpTrace | null = null;
  windowData: OpWindow | null = null;
  recommendation = '';
  step = 0;
  playing = false;
  points: OpPoint[] = [];
  width = 0;
  height = 0;
  pickerOpen = false;
  ollPickerOpen = false;
  helpOpen = false;
  recordFilter = '';
  recordOllFilter = '';
  recordResultFilter = '';
  private active = true;
  private frame: number | null = null;
  private playTimer: number | null = null;
  private paint = false;
  private paintAdd = false;
  private touchTimer: number | null = null;
  private touchName = '';
  private visited = new Set<string>();

  get current(): OpCase | null { return this.training?.current || null; }
  get choices(): string[] { return [...PLL.map(item => item.name.slice(4)), '无 PLL']; }
  get revealed(): boolean { return !!this.training?.revealed; }
  get hintsVisible(): boolean { return !!this.training?.hintsVisible; }
  get records(): OpRecord[] { return this.training?.filteredRecords(this.recordFilter, this.recordOllFilter, this.recordResultFilter) || []; }
  get lines(): Array<{ key: number; source: OpPoint; x: number; y: number; color: string }> {
    if (!this.hintsVisible || !this.windowData || !this.trace) return [];
    const positions = this.trace.positions[this.step];
    const w = this.width, h = this.cubeHeight;
    return this.windowData.sources.map((id, i) => {
      const source = this.points[positions[id]];
      return { key: i, source, x: w * (i + 1) / 7, y: h - 28,
        color: this.current!.beforeFacelets[id] };
    }).filter(line => line.source?.visible);
  }
  get relatedPoints(): Array<{ id: number; point: OpPoint }> {
    if (!this.hintsVisible || !this.windowData || !this.trace) return [];
    const main = new Set(this.windowData.sources);
    return this.windowData.related.filter(id => !main.has(id)).map(id =>
      ({ id, point: this.points[this.trace!.positions[this.step][id]] })).filter(item => item.point?.visible);
  }
  get cubeHeight(): number { return Math.max(240, Math.floor(this.height * .52)); }

  mounted(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS) || '{}');
      this.settings = { ...defaults(), ...saved,
        pllNames: Array.isArray(saved.pllNames) ? saved.pllNames.filter((name: string) => PLL.some(item => item.name === name)) : [],
        ollNames: Array.isArray(saved.ollNames) ? saved.ollNames.filter((name: string) => OLL.some(item => item.name === name)) : [] };
      if (['pll', 'none', 'mixed'].indexOf(this.settings.mode) < 0) this.settings.mode = 'pll';
    } catch { this.settings = defaults(); }
    try { this.training = new OpTraining(() => this.generate(), localStorage, Date.now); }
    catch (error) { this.feedback = (error as Error).message; }
    this.loadCase();
    this.$nextTick(() => { this.preferance.refresh(); this.palette.refresh(); this.resize(); this.loop(); });
  }
  beforeDestroy(): void { this.onAppDeactivate(); }
  onAppDeactivate(): void { this.pause(); this.active = false; if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; }
  onAppActivate(): void { this.active = true; this.resize(); this.loop(); }
  private loop(): void {
    if (!this.active) return;
    this.viewport?.draw();
    if (this.hintsVisible && this.points.length === 54) this.points = projectOpStickers(this.world, this.width, this.cubeHeight);
    this.frame = requestAnimationFrame(() => this.loop());
  }
  resize(): void {
    this.width = Math.max(300, document.documentElement.clientWidth);
    this.height = document.documentElement.clientHeight;
    this.viewport?.resize(this.width, this.cubeHeight);
    this.points = projectOpStickers(this.world, this.width, this.cubeHeight);
  }
  private generate(): OpCase {
    const plls = this.settings.pllNames.length ? PLL.filter(item => this.settings.pllNames.indexOf(item.name) >= 0) : PLL;
    const olls = this.settings.useCustom ? [{ name: '自定义 OLL', origin: this.settings.customOll }] :
      this.settings.ollNames.length ? OLL.filter(item => this.settings.ollNames.indexOf(item.name) >= 0) : OLL;
    return generateOpCase(plls, olls, Math.random, simulate, this.settings.mode);
  }
  private loadCase(autoView = true): void {
    if (!this.current) return;
    this.pause();
    this.step = 0;
    this.world.cube.twister.setup(this.current.scramble);
    this.trace = traceOpStickers(this.current.moves);
    const fr = opWindow(this.current.beforeFacelets, this.trace.positions, 'FR', this.trace.pieceIds);
    const lf = opWindow(this.current.beforeFacelets, this.trace.positions, 'LF', this.trace.pieceIds);
    const recommended = recommendOpWindow(scoreOpWindow(fr, 'FR'), scoreOpWindow(lf, 'LF'));
    this.recommendation = this.current.targetPll === '无 PLL' ? 'OLL 后应直接还原；可切换两窗口观察' : recommended.message;
    this.switchView(autoView ? recommended.view : this.view);
  }
  private updateWindow(): void {
    if (!this.current || !this.trace) return;
    this.windowData = opWindow(this.current.beforeFacelets, this.trace.positions, this.view, this.trace.pieceIds);
  }
  saveSettings(): void {
    try { localStorage.setItem(SETTINGS, JSON.stringify(this.settings)); } catch { /* Storage unavailable. */ }
  }
  nextCase(): void {
    if (!this.training) {
      try { this.training = new OpTraining(() => this.generate(), localStorage, Date.now); this.feedback = ''; this.loadCase(); }
      catch (error) { this.feedback = (error as Error).message; }
      return;
    }
    try { this.training.next(); this.feedback = ''; this.loadCase(); }
    catch (error) { this.feedback = (error as Error).message; }
  }
  retry(): void { this.training?.retry(); this.feedback = ''; this.loadCase(false); }
  resetVisualCube(): void { this.retry(); }
  switchView(view: OpView): void {
    this.view = view;
    this.training?.switchView(view);
    this.updateWindow();
    // Camera/scene only; no y rotation is added to the case or solution.
    this.world.scene.rotation.y = view === 'LF' ? Math.PI / 4 - Math.PI / 16 : -Math.PI / 4 + Math.PI / 16;
    this.world.scene.updateMatrix();
    this.world.dirty = true;
  }
  revealHints(): void { this.training?.showHints(); this.points = projectOpStickers(this.world, this.width, this.cubeHeight); }
  answer(name: string): void {
    if (!this.training || this.training.readOnly || this.training.revealed) return;
    const correct = this.training.answer(name);
    this.feedback = correct ? `正确：${name}。可以播放 OLL 核验。` : `${name} 不正确，请再观察。`;
  }
  replay(record: OpRecord): void {
    this.training?.replay(record);
    this.view = record.view;
    this.switchView(record.view);
    this.feedback = '正在复盘，只查看题面，不计成绩';
    this.loadCase(false);
  }
  setStep(target: number): void {
    if (!this.current || !this.trace) return;
    const next = Math.max(0, Math.min(this.current.moves.length, target));
    if (next === this.step) return;
    if (next === this.step + 1) this.world.cube.twister.push(this.current.moves[this.step]);
    else this.world.cube.twister.setup([this.current.scramble, ...this.current.moves.slice(0, next)].join(' '));
    this.step = next;
    this.world.dirty = true;
  }
  pause(): void {
    if (this.playTimer !== null) clearInterval(this.playTimer);
    this.playTimer = null;
    this.playing = false;
  }
  demonstrate(): void {
    if (this.playing) { this.pause(); return; }
    if (!this.current) return;
    if (this.step === this.current.moves.length) this.setStep(0);
    this.playing = true;
    this.setStep(this.step + 1);
    this.playTimer = window.setInterval(() => {
      if (this.step >= (this.current?.moves.length || 0)) { this.pause(); return; }
      this.setStep(this.step + 1);
    }, 950);
  }
  openPicker(oll = false): void { this.ollPickerOpen = oll; this.pickerOpen = true; }
  toggleChoice(name: string): void {
    const list = this.ollPickerOpen ? this.settings.ollNames : this.settings.pllNames;
    const index = list.indexOf(name);
    if (index < 0) list.push(name); else list.splice(index, 1);
    this.saveSettings();
  }
  startPaint(name: string, event: MouseEvent | TouchEvent): void {
    if ('button' in event && event.button !== 0) return;
    this.paint = true; this.touchName = name; this.visited.clear();
    const list = this.ollPickerOpen ? this.settings.ollNames : this.settings.pllNames;
    this.paintAdd = list.indexOf(name) < 0;
    this.paintChoice(name);
  }
  paintChoice(name: string): void {
    if (!this.paint || this.visited.has(name)) return;
    this.visited.add(name);
    const list = this.ollPickerOpen ? this.settings.ollNames : this.settings.pllNames;
    if ((list.indexOf(name) >= 0) !== this.paintAdd) this.toggleChoice(name);
  }
  onTouchStart(name: string, event: TouchEvent): void {
    this.touchName = name;
    this.touchTimer = window.setTimeout(() => this.startPaint(name, event), 380);
  }
  onTouchMove(event: TouchEvent): void {
    if (!this.paint) { if (this.touchTimer !== null) clearTimeout(this.touchTimer); return; }
    const touch = event.touches[0];
    const button = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-op-choice]');
    const name = button?.getAttribute('data-op-choice');
    if (name) { event.preventDefault(); this.paintChoice(name); }
  }
  stopPaint(): void {
    if (this.touchTimer !== null) clearTimeout(this.touchTimer);
    this.touchTimer = null; this.paint = false;
  }
}
