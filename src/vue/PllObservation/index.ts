import { Component, Inject, Provide, Ref, Vue } from 'vue-property-decorator';
import World from '../../cuber/world';
import { TwistNode } from '../../cuber/twister';
import { PreferanceData, PaletteData } from '../../data';
import { SessionSnapshot } from '../../ble/cube-session';
import { LinkEvent } from '../../ble/types';
import { PllTraining, PllResult } from '../../ble/pll-training';
import { matchPllSix, PllSixMatch, studyCellsForSix, studyRowDifferences } from '../../ble/pll-six-sticker';
import { buildPllVisualClues, PllVisualClue } from '../../ble/pll-six-visual';
import { projectPllSix, StickerPoint } from './visual-overlay';
import Viewport from '../Viewport';
import Setting from '../Setting';
import './index.css';

type StudyRow = { chapter: string; cells: string[] };
const rawAlgs: Array<{name: string; items: Array<{name: string; origin: string}>}> = require('../Algs/algs.json');
const pllItems = rawAlgs.find(group => group.name === 'PLL')!.items;
const guide: string = require('text-loader!../../../docs/pll-six-sticker-observation.md');
const minimalGuide: string = require('text-loader!../../../docs/pll6-minimal-observation-features.md');

function studyRows(markdown: string): StudyRow[] {
  let chapter = '';
  const rows: StudyRow[] = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## 第')) chapter = line.slice(3);
    if (!chapter || !line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim().replace(/\*\*/g, ''));
    if (cells.some(cell => /^(?:Aa|Ab|E|F|Ga|Gb|Gc|Gd|H|Ja|Jb|Na|Nb|Ra|Rb|T|Ua|Ub|V|Y|Z)(?:（.*）)?$/.test(cell))) {
      rows.push({ chapter, cells });
    }
  }
  return rows;
}
const STUDY_ROWS = studyRows(guide);

@Component({ template: require('./index.html'), components: { viewport: Viewport, setting: Setting } })
export default class PllObservation extends Vue {
  @Provide('world') world: World = new World();
  @Provide('preferance') preferance: PreferanceData = new PreferanceData(this.world);
  @Provide('palette') palette: PaletteData = new PaletteData(this.world);
  @Inject('openConnection') openConnection: () => void;
  @Ref('viewport') viewport: Viewport;

  training = new PllTraining(pllItems, Math.random, Date.now,
    (origin) => new TwistNode(origin).parse(true).map(move => move.value).join(' '));
  snapshot: SessionSnapshot | null = null;
  width = 0;
  height = 0;
  feedback = '';
  showStudy = false;
  showCurrentFeatures = false;
  useZ2 = false;
  actualFeature: PllSixMatch | null = null;
  stickerPoints: StickerPoint[] = [];
  readonly studySource = guide;
  showAnswer = false;
  records: PllResult[] = [];
  recordTypeFilter = 'all';
  recordPllFilter = 'all';
  replayRecord: PllResult | null = null;
  selectedNames: string[] = [];
  draftNames: string[] = [];
  pickerOpen = false;
  helpOpen = false;
  readonly termShapes = [
    { name: '团', pattern: 'AAA', description: '三格同色：1＝2＝3（右侧则是 4＝5＝6）。' },
    { name: '眼', pattern: 'ABA', description: '两端同色，中间不同：1＝3、2 不同色。' },
    { name: '棒左', pattern: 'AAB', description: '左两格同色，右一格不同：1＝2、3 不同色。' },
    { name: '棒右', pattern: 'ABB', description: '右两格同色，左一格不同：2＝3、1 不同色。' },
    { name: '灯', pattern: 'ABC', description: '三格两两不同色；对色或邻色还要继续观察。' }
  ];
  now = Date.now();
  private active = true;
  private frame: number | null = null;
  private clock: number | null = null;
  private nextFeaturePoll = 0;
  private touchStart: { x: number; y: number; name: string } | null = null;
  private touchTimer: number | null = null;
  private touchPainting = false;
  private touchPaintValue = false;
  private touchVisited = new Set<string>();
  private mouseStart: { x: number; y: number; name: string } | null = null;
  private mousePainting = false;
  private mousePaintValue = false;
  private mouseVisited = new Set<string>();
  private suppressMouseClick = false;
  private suppressPickerClickUntil = 0;

  get caseName(): string { return this.training.current.name.slice(4); }
  get displayCaseName(): string { return (this.replayRecord?.name || this.training.current.name).slice(4); }
  get displayOrigin(): string {
    return this.replayRecord ? pllItems.find(item => item.name === this.replayRecord!.name)?.origin || '' : this.training.current.origin;
  }
  get displayScramble(): string { return this.replayRecord?.scramble || this.scramble; }
  get choices(): Array<{ name: string; origin: string }> { return pllItems; }
  get pickerLabel(): string { return `选择公式 · ${this.selectedNames.length ? `${this.selectedNames.length} 条` : '全部'}`; }
  get pickerCountLabel(): string { return this.draftNames.length ? `已选 ${this.draftNames.length} 条` : '未选任何项 · 全部随机'; }
  get scramble(): string {
    return this.training.current.scramble;
  }
  get elapsed(): string {
    const started = this.training.startedAt;
    return started === null ? '等待实体魔方转动' : `${((this.now - started) / 1000).toFixed(2)} 秒`;
  }
  get caseStudyRows(): StudyRow[] {
    const name = this.displayCaseName;
    return STUDY_ROWS.filter(row => row.cells.some(cell => cell === name || cell.startsWith(`${name}（`)));
  }
  get actualStudyRows(): StudyRow[] {
    if (!this.actualFeature) return [];
    const { chapter, name, colorCount } = this.actualFeature;
    return STUDY_ROWS.filter(row => row.chapter.startsWith(`第 ${chapter} 章：`) &&
      row.cells.some(cell => cell === name || cell.startsWith(`${name}（`)) &&
      (name !== 'Z' || row.cells[row.cells.length - 1] === String(colorCount)));
  }
  get visualClues(): PllVisualClue[] {
    return this.showCurrentFeatures && this.actualFeature && this.actualStudyRows.length === 1
      ? buildPllVisualClues(this.actualFeature, minimalGuide, this.actualStudyRows[0].cells) : [];
  }
  get shapeEdges(): Array<{ a: StickerPoint; b: StickerPoint; key: string; bridge: boolean }> {
    if (!this.actualFeature || !this.visualClues.length) return [];
    const pairs = [[1, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 6]];
    return pairs.filter(([a, b]) => this.actualFeature!.relations[a - 1][b - 1] === '同' &&
      (b - a !== 2 || this.actualFeature!.relations[a - 1][a] !== '同'))
      .map(([a, b]) => ({ a: this.stickerPoints[a - 1], b: this.stickerPoints[b - 1], key: `${a}-${b}`, bridge: b - a > 1 }))
      .filter(edge => edge.a?.visible && edge.b?.visible);
  }
  get visualEdges(): Array<{ key: string; clue: PllVisualClue; relation: string; label: string; a: StickerPoint; b: StickerPoint }> {
    const points = this.stickerPoints;
    const edges: Array<{ key: string; clue: PllVisualClue; relation: string; label: string; a: StickerPoint; b: StickerPoint }> = [];
    const seen = new Set<string>();
    for (const clue of this.visualClues) for (const segment of clue.segments) {
      if (segment.relation === '同' && (segment.a <= 3) === (segment.b <= 3)) continue;
      const pair = `${Math.min(segment.a, segment.b)}-${Math.max(segment.a, segment.b)}:${segment.relation}`;
      if (seen.has(pair)) continue;
      const a = points[segment.a - 1], b = points[segment.b - 1];
      if (a?.visible && b?.visible) {
        seen.add(pair);
        edges.push({ key: pair, clue, relation: segment.relation, label: segment.label || `${segment.relation}色`, a, b });
      }
    }
    return edges;
  }
  get visualCounts(): Array<{ key: number; clue: PllVisualClue; x: number; y: number }> {
    return this.visualClues.filter(clue => clue.kind === 'count').map(clue => {
      const points = clue.stickers.map(n => this.stickerPoints[n - 1]).filter(point => point?.visible);
      if (points.length !== clue.stickers.length) return null;
      return { key: clue.order, clue,
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: Math.min(...points.map(point => point.y)) - 58 };
    }).filter((value): value is { key: number; clue: PllVisualClue; x: number; y: number } => value !== null);
  }
  edgePoint(a: StickerPoint, b: StickerPoint, start: boolean): { x: number; y: number } {
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1;
    const inset = Math.min(4, distance / 3);
    return start ? { x: a.x + dx * inset / distance, y: a.y + dy * inset / distance }
      : { x: b.x - dx * inset / distance, y: b.y - dy * inset / distance };
  }
  edgeArc(a: StickerPoint, b: StickerPoint): { path: string; x: number; y: number } {
    const start = this.edgePoint(a, b, true), end = this.edgePoint(a, b, false);
    const height = Math.min(50, Math.max(18, Math.hypot(end.x - start.x, end.y - start.y) * 0.24));
    const cx = (start.x + end.x) / 2, cy = Math.min(start.y, end.y) - height;
    return { path: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`,
      x: cx, y: (start.y + end.y + 2 * cy) / 4 - 7 };
  }
  get actualStudyCells(): string[] {
    return this.actualFeature && this.actualStudyRows.length === 1
      ? studyCellsForSix(this.actualStudyRows[0].cells, this.actualFeature) : [];
  }
  get originalFeatureCells(): string[] {
    const name = this.actualFeature?.name;
    return this.actualStudyRows.length === 1
      ? this.actualStudyRows[0].cells.filter(cell => cell !== name && !cell.startsWith(`${name}（`)) : [];
  }
  get actualStudyDifferences(): string[] {
    return this.actualFeature && this.actualStudyRows.length === 1
      ? studyRowDifferences(this.actualFeature, this.actualStudyRows[0].cells) : [];
  }
  get filteredRecords(): PllResult[] {
    return this.records.filter(record => {
      if (this.recordPllFilter !== 'all' && record.name !== this.recordPllFilter) return false;
      if (this.recordTypeFilter === 'all') return true;
      if (this.recordTypeFilter === 'bluetooth') return record.kind === 'bluetooth';
      return record.kind === 'observation' && (this.recordTypeFilter === 'incorrect' ? record.ok === false : record.ok !== false);
    });
  }
  recordLabel(record: PllResult): string {
    if (record.kind === 'bluetooth') return '蓝牙还原';
    return record.ok === false ? '判断错误' : '判断正确';
  }
  timeLabel(record: PllResult): string { return record.kind === 'bluetooth' ? '公式拧动速度' : '判断时间'; }
  get chapters(): string[] { return [...new Set(STUDY_ROWS.map(row => row.chapter))]; }
  rowsForChapter(chapter: string): StudyRow[] { return STUDY_ROWS.filter(row => row.chapter === chapter); }
  formatTime(record: PllResult): string { return record.durationMs === null ? '未计时' : `${(record.durationMs / 1000).toFixed(2)} 秒`; }
  formatDate(record: PllResult): string { return new Date(record.at).toLocaleString(); }

  mounted(): void {
    try { this.showCurrentFeatures = localStorage.getItem('pll6ShowCurrentFeatures') === '1'; } catch { /* 忽略存储限制 */ }
    try { this.useZ2 = localStorage.getItem('pll6UseZ2') === '1'; } catch { /* 忽略存储限制 */ }
    this.training.setZ2(this.useZ2);
    try {
      const saved = JSON.parse(localStorage.getItem('pll6AllowedNames') || '[]');
      if (Array.isArray(saved)) this.selectedNames = [...new Set(saved.filter((name: unknown): name is string =>
        typeof name === 'string' && pllItems.some(item => item.name === name)))];
    } catch { this.selectedNames = []; }
    this.training.setAllowedNames(this.selectedNames);
    if (this.selectedNames.length && this.selectedNames.indexOf(this.training.current.name) < 0) this.training.next();
    try {
      const saved = JSON.parse(localStorage.getItem('pll6Records') || '[]');
      if (Array.isArray(saved)) this.records = saved.filter((item: any) => item && typeof item.name === 'string' &&
        (item.kind === 'observation' || item.kind === 'bluetooth')).slice(0, 200);
    } catch { this.records = []; }
    this.loadCase();
    this.$nextTick(() => { this.preferance.refresh(); this.palette.refresh(); this.resize(); this.loop(); });
    window.addEventListener('keydown', this.onKeydown);
    window.addEventListener('mousemove', this.onPickerMouseMove);
    window.addEventListener('mouseup', this.onPickerMouseUp);
    this.clock = window.setInterval(() => {
      this.now = Date.now();
      if (this.showCurrentFeatures && this.now >= this.nextFeaturePoll) {
        this.nextFeaturePoll = this.now + 200;
        this.refreshActualFeature();
      }
    }, 50);
  }
  beforeDestroy(): void {
    this.onAppDeactivate();
    this.clearPickerTouch();
    this.clearPickerMouse();
    window.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('mousemove', this.onPickerMouseMove);
    window.removeEventListener('mouseup', this.onPickerMouseUp);
    if (this.clock !== null) clearInterval(this.clock);
  }
  onAppDeactivate(): void { this.active = false; if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; this.stickerPoints = []; this.training.retry(); this.cancelPicker(); }
  onAppActivate(): void { this.active = true; this.training.retry(); this.resize(); this.loop(); }
  private loop(): void {
    if (!this.active) return;
    const drew = this.viewport?.draw();
    if (drew && this.showCurrentFeatures && this.actualFeature) this.updateVisualOverlay();
    this.frame = requestAnimationFrame(() => this.loop());
  }
  resize(): void {
    this.width = document.documentElement.clientWidth;
    this.height = document.documentElement.clientHeight;
    this.viewport?.resize(this.width, Math.max(200, Math.floor(this.height * 0.53)));
    this.updateVisualOverlay();
  }
  private updateVisualOverlay(): void {
    if (!this.active || !this.showCurrentFeatures || !this.actualFeature || this.actualStudyRows.length !== 1 ||
      [...this.world.cube.locks.values()].some(lock => lock.size > 0)) {
      if (this.stickerPoints.length) this.stickerPoints = [];
      return;
    }
    const box = (this.$refs.cubeArea as HTMLElement | undefined)?.getBoundingClientRect();
    if (box?.width && box.height) this.stickerPoints = projectPllSix(this.world, box.width, box.height);
  }
  private loadCase(): void {
    this.showAnswer = false;
    this.feedback = '';
    this.world.cube.twister.setup(this.scramble);
    this.refreshActualFeature();
  }
  private refreshActualFeature(): void {
    const feature = matchPllSix(this.world.cube.serialize());
    if (this.actualFeature?.signature !== feature?.signature || this.actualFeature?.six !== feature?.six) this.actualFeature = feature;
    this.updateVisualOverlay();
  }
  saveFeaturePreference(): void {
    try { localStorage.setItem('pll6ShowCurrentFeatures', this.showCurrentFeatures ? '1' : '0'); } catch { /* 本次状态仍可用 */ }
    if (this.showCurrentFeatures) this.refreshActualFeature(); else this.stickerPoints = [];
  }
  saveZ2Preference(): void {
    this.training.setZ2(this.useZ2);
    try { localStorage.setItem('pll6UseZ2', this.useZ2 ? '1' : '0'); } catch { /* 本次状态仍可用 */ }
    if (!this.replayRecord) { this.training.retry(); this.loadCase(); }
  }
  nextCase(): void { if (this.replayRecord) return; this.training.next(); this.loadCase(); }
  retry(): void { if (this.replayRecord) return; this.training.retry(); this.loadCase(); this.feedback = '已清除本次计时，继续尝试'; }
  resetVisualCube(): void { if (this.replayRecord) this.exitReplay(); else this.retry(); }
  replay(record: PllResult): void {
    if (!record.scramble) return;
    this.training.retry();
    this.replayRecord = record;
    this.showAnswer = false;
    this.feedback = '';
    this.world.cube.twister.setup(record.scramble);
    this.refreshActualFeature();
  }
  exitReplay(): void {
    if (!this.replayRecord) return;
    this.replayRecord = null;
    this.training.restartCaseClock(Date.now());
    this.loadCase();
  }
  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.active) {
      event.preventDefault();
      if (this.helpOpen) this.closeHelp();
      else if (this.pickerOpen) this.cancelPicker();
      else if (this.replayRecord) this.exitReplay(); else this.retry();
    }
  }
  openHelp(): void {
    this.helpOpen = true;
    this.$nextTick(() => (this.$refs.helpClose as HTMLButtonElement | undefined)?.focus());
  }
  closeHelp(): void {
    if (!this.helpOpen) return;
    this.helpOpen = false;
    this.$nextTick(() => (this.$refs.helpTrigger as HTMLButtonElement | undefined)?.focus());
  }
  openPicker(): void {
    this.draftNames = [...this.selectedNames];
    this.pickerOpen = true;
    this.$nextTick(() => (this.$refs.pickerClose as HTMLButtonElement | undefined)?.focus());
  }
  cancelPicker(): void {
    if (!this.pickerOpen) return;
    this.clearPickerTouch();
    this.clearPickerMouse();
    this.pickerOpen = false;
    this.draftNames = [];
    this.$nextTick(() => (this.$refs.pickerTrigger as HTMLButtonElement | undefined)?.focus());
  }
  savePicker(): void {
    this.selectedNames = pllItems.filter(item => this.draftNames.indexOf(item.name) >= 0).map(item => item.name);
    this.training.setAllowedNames(this.selectedNames);
    try { localStorage.setItem('pll6AllowedNames', JSON.stringify(this.selectedNames)); } catch { /* 无存储权限也可本次使用 */ }
    this.cancelPicker();
  }
  setPickerAll(): void { this.draftNames = pllItems.map(item => item.name); }
  clearPicker(): void { this.draftNames = []; }
  togglePickerName(name: string): void { this.setPickerName(name, this.draftNames.indexOf(name) < 0); }
  private setPickerName(name: string, enabled: boolean): void {
    if (!pllItems.some(item => item.name === name)) return;
    this.draftNames = enabled ? [...new Set([...this.draftNames, name])] : this.draftNames.filter(item => item !== name);
  }
  onPickerChoiceClick(event: MouseEvent, name: string): void {
    if (this.suppressMouseClick || Date.now() < this.suppressPickerClickUntil) { event.preventDefault(); return; }
    this.togglePickerName(name);
  }
  private clearPickerMouse(): void {
    this.mouseStart = null;
    this.mousePainting = false;
    this.mouseVisited.clear();
  }
  onPickerMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pll-name]') : null;
    if (!target) return;
    this.clearPickerMouse();
    this.mouseStart = { x: event.clientX, y: event.clientY, name: target.dataset.pllName! };
  }
  onPickerMouseMove(event: MouseEvent): void {
    if (!this.mouseStart || !this.pickerOpen) return;
    if (!(event.buttons & 1)) { this.clearPickerMouse(); return; }
    if (!this.mousePainting) {
      if (Math.hypot(event.clientX - this.mouseStart.x, event.clientY - this.mouseStart.y) <= 8) return;
      const name = this.mouseStart.name;
      this.mousePaintValue = this.draftNames.indexOf(name) < 0;
      this.mousePainting = true;
      this.mouseVisited.add(name);
      this.setPickerName(name, this.mousePaintValue);
    }
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-pll-name]');
    const list = this.$refs.pickerList as HTMLElement | undefined;
    if (!target || !list?.contains(target)) return;
    const name = target.dataset.pllName!;
    if (this.mouseVisited.has(name)) return;
    this.mouseVisited.add(name);
    this.setPickerName(name, this.mousePaintValue);
  }
  onPickerMouseUp(): void {
    if (this.mousePainting) {
      this.suppressMouseClick = true;
      window.setTimeout(() => { this.suppressMouseClick = false; }, 0);
    }
    this.clearPickerMouse();
  }
  private clearPickerTouch(): void {
    if (this.touchTimer !== null) clearTimeout(this.touchTimer);
    this.touchTimer = null;
    this.touchStart = null;
    this.touchPainting = false;
    this.touchVisited.clear();
  }
  onPickerTouchStart(event: TouchEvent): void {
    this.clearPickerTouch();
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pll-name]') : null;
    const touch = event.changedTouches[0];
    if (!target || !touch) return;
    const name = target.dataset.pllName!;
    this.touchStart = { x: touch.clientX, y: touch.clientY, name };
    this.touchTimer = window.setTimeout(() => {
      this.touchTimer = null;
      if (!this.touchStart || !this.pickerOpen) return;
      this.touchPaintValue = this.draftNames.indexOf(name) < 0;
      this.touchPainting = true;
      this.touchVisited.add(name);
      this.setPickerName(name, this.touchPaintValue);
    }, 350);
  }
  onPickerTouchMove(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    if (!this.touchStart || !touch) return;
    if (!this.touchPainting) {
      if (Math.hypot(touch.clientX - this.touchStart.x, touch.clientY - this.touchStart.y) > 8) this.clearPickerTouch();
      return;
    }
    event.preventDefault();
    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest<HTMLElement>('[data-pll-name]');
    if (!target || !(event.currentTarget as Element).contains(target)) return;
    const name = target.dataset.pllName!;
    if (this.touchVisited.has(name)) return;
    this.touchVisited.add(name);
    this.setPickerName(name, this.touchPaintValue);
  }
  onPickerTouchEnd(): void {
    if (this.touchPainting) this.suppressPickerClickUntil = Date.now() + 180;
    this.clearPickerTouch();
  }
  answer(name: string): void {
    if (this.replayRecord) return;
    if (this.training.answer(`PLL-${name}`, Date.now())) {
      this.saveResult();
      this.loadCase();
      this.feedback = `${name} 正确 · ${this.formatTime(this.training.lastResult!)}，已切换下一题`;
    } else {
      this.saveResult();
      this.feedback = `${name} 不正确，请继续选择`;
    }
  }
  onSessionSnapshot(snapshot: SessionSnapshot): void { this.snapshot = snapshot; }
  handlePhysicalEvent(event: LinkEvent): void {
    if (!this.active || this.replayRecord || this.snapshot?.status !== 'connected') return;
    if (event.type === 'move') this.training.move(Date.now(), event.serial, event.recovered);
    if (event.type === 'facelets' && this.training.facelets(event.facelets, Date.now(), event.serial)) {
      const result = this.training.lastResult!;
      this.saveResult();
      this.loadCase();
      this.feedback = `${result.name.slice(4)} 六面还原 · ${this.formatTime(result)}，已切换下一题`;
    }
  }
  private saveResult(): void {
    this.records = [this.training.lastResult!, ...this.records].slice(0, 200);
    try { localStorage.setItem('pll6Records', JSON.stringify(this.records)); } catch { /* 无存储权限也可训练 */ }
  }
}
