import { Component, Inject, Provide, Ref, Vue } from 'vue-property-decorator';
import World from '../../cuber/world';
import { PreferanceData, PaletteData, PRESET_PALETTES } from '../../data';
import { parseOpFormula } from '../../ble/op-formula';
import { FormulaTimer, FormulaCase, FormulaCategory, FormulaRecord, recentMedian } from '../../ble/formula-timer';
import { FormulaTimerSettings, FormulaTimerStore } from '../../ble/formula-timer-store';
import { FormulaItem, makeFormulaCase } from '../../ble/formula-timer-formula';
import { CubeSession, SessionSnapshot } from '../../ble/cube-session';
import { LinkEvent } from '../../ble/types';
import { topNetCells, TopNetCell } from '../../ble/op-top-net';
import { algsPreviewExpression, cubeIconTiles, CubeIconTile, previewFormulaFacelets } from '../../ble/formula-timer-preview';
import Capture from '../Algs/capture';
import { AlgsData, AlgGroup } from '../Algs';
import Viewport from '../Viewport';
import Setting from '../Setting';
import { loadFormulaPool } from './formulas';
import './index.css';

@Component({ template: require('./index.html'), components: { viewport: Viewport, setting: Setting } })
export default class FormulaTimerView extends Vue {
  @Provide('world') world: World = new World();
  @Provide('preferance') preferance: PreferanceData = new PreferanceData(this.world);
  @Provide('palette') palette: PaletteData = new PaletteData(this.world);
  @Inject('cubeSession') session: CubeSession;
  @Ref('viewport') viewport: Viewport;

  settings: FormulaTimerSettings = { category: 'f2l', selectedIds: { f2l: [], oll: [], pll: [] },
    nextMode: 'random', beforeZ2: false, slowOnly: false, slowSeconds: 3 };
  records: FormulaRecord[] = [];
  items: FormulaItem[] = [];
  invalidItems: string[] = [];
  ollPreviews: { [id: string]: string } = {};
  f2lPreviews: { [id: string]: CubeIconTile[] } = {};
  f2lPictures: { [id: string]: string } = {};
  readonly previewColors = PRESET_PALETTES['默认'];
  readonly previewCells = topNetCells('after');
  current: FormulaCase | null = null;
  snapshot: SessionSnapshot | null = null;
  feedback = '';
  warning = '';
  now = Date.now();
  pickerOpen = false;
  pickerGroup: 'builtin' | 'custom' = 'builtin';
  recordResult = 'all';
  replayRecord: FormulaRecord | null = null;
  completedRecord: FormulaRecord | null = null;
  private store = new FormulaTimerStore(window.localStorage);
  private active = true;
  private frame: number | null = null;
  private clockTick: number | null = null;
  private nextJob: number | null = null;
  private paint = false;
  private paintAdd = false;
  private visited = new Set<string>();
  private touchTimer: number | null = null;
  private touchName = '';
  private iconFrame: number | null = null;
  private capture: Capture | null = null;
  private captureUnavailable = false;
  private readonly training = new FormulaTimer({
    now: () => Date.now(),
    schedule: (fn, ms) => window.setTimeout(fn, ms),
    cancel: id => window.clearTimeout(id),
    requestFacelets: () => this.session.requestFacelets(),
    onResult: record => this.finishRecord(record),
  });

  get categoryItems(): FormulaItem[] { return this.items.filter(item => item.category === this.settings.category); }
  get pickerItems(): FormulaItem[] {
    return this.categoryItems.filter(item => this.settings.category !== 'oll' ||
      (this.pickerGroup === 'custom') === item.id.startsWith('oll:custom-'));
  }
  get selectedIds(): string[] { return this.settings.selectedIds[this.settings.category]; }
  get filteredRecords(): FormulaRecord[] {
    return this.records.filter(record => (this.recordResult === 'all' || record.result === this.recordResult) &&
      record.category === this.settings.category);
  }
  get elapsed(): string {
    if (this.replayRecord || this.completedRecord) return (((this.replayRecord || this.completedRecord)!.durationMs) / 1000).toFixed(2);
    if (this.training.startedAt === null) return '0.00';
    return ((this.now - this.training.startedAt) / 1000).toFixed(2);
  }
  get reactionElapsed(): string {
    if (this.replayRecord || this.completedRecord) return this.formatReaction((this.replayRecord || this.completedRecord)!);
    if (this.training.reactionMs !== null) return (this.training.reactionMs / 1000).toFixed(2);
    if (this.training.presentedAt === null) return '—';
    return (Math.max(0, this.now - this.training.presentedAt) / 1000).toFixed(2);
  }
  formatReaction(record: FormulaRecord): string {
    return record.reactionMs === undefined ? '—' : (record.reactionMs / 1000).toFixed(2);
  }
  get statusLabel(): string {
    if (this.replayRecord) return '复盘题面 · 计时暂停';
    if (this.snapshot?.status !== 'connected') return '连接蓝牙魔方后开始训练';
    return this.training.startedAt === null ? '等待首次实体转动' : '计时中 · 停转 1 秒将结束本轮';
  }
  get slowCount(): number {
    return this.categoryItems.filter(item => this.isSlow(item)).length;
  }

  mounted(): void {
    const data = this.store.load();
    this.settings = data.settings;
    this.records = data.records;
    this.warning = data.warning;
    try { this.items = loadFormulaPool(window.localStorage); }
    catch (error) { this.warning = `公式库读取失败：${(error as Error).message}`; }
    this.nextCase();
    this.$nextTick(() => { this.preferance.refresh(); this.palette.refresh(); this.resize(); this.loop(); });
    this.clockTick = window.setInterval(() => { this.now = Date.now(); }, 30);
    window.addEventListener('mouseup', this.stopPaint);
  }
  beforeDestroy(): void {
    this.onAppDeactivate();
    if (this.capture) { this.capture.renderer.dispose(); this.capture.renderer.forceContextLoss(); this.capture = null; }
    if (this.clockTick !== null) window.clearInterval(this.clockTick);
    window.removeEventListener('mouseup', this.stopPaint);
  }
  onAppDeactivate(): void {
    this.active = false;
    this.stopIconRendering();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.training.cancel();
    this.clearNextJob();
    this.stopPaint();
  }
  onAppActivate(): void { this.active = true; this.resetCase(); this.resize(); this.loop(); }
  onSessionSnapshot(snapshot: SessionSnapshot): void {
    if (this.snapshot?.status === 'connected' && snapshot.status === 'disconnected') {
      this.training.interrupt(Date.now());
      this.feedback = '蓝牙连接中断，请重连后重试';
    }
    if (this.snapshot?.status !== 'connected' && snapshot.status === 'connected' &&
        this.current && !this.training.current && !this.replayRecord) this.resetCase();
    this.snapshot = snapshot;
  }
  handlePhysicalEvent(event: LinkEvent, live: boolean): void {
    if (!this.active || this.replayRecord) return;
    if (event.type === 'move' && !event.recovered) {
      if (this.training.move(Date.now(), event.serial)) {
        this.now = Date.now();
        if (live) this.world.cube.twister.push(event.move);
      }
    } else if (event.type === 'facelets') this.training.facelets(event.facelets, Date.now(), event.serial);
  }
  private loop(): void {
    if (!this.active) return;
    this.viewport?.draw();
    this.frame = requestAnimationFrame(() => this.loop());
  }
  resize(): void {
    const box = this.$refs.cubeArea as HTMLElement | undefined;
    if (box) this.viewport?.resize(box.clientWidth, box.clientHeight);
  }
  private save(): void { const error = this.store.save(this.settings, this.records); this.warning = error || ''; }
  private clearNextJob(): void {
    if (this.nextJob !== null) window.clearTimeout(this.nextJob);
    this.nextJob = null;
  }
  private finishRecord(record: FormulaRecord): void {
    this.completedRecord = record;
    this.records.unshift(record);
    const times = `反应 ${this.formatReaction(record)} 秒 · 拧公式 ${(record.durationMs / 1000).toFixed(2)} 秒`;
    this.feedback = record.result === 'success' ? `成功 · ${times}` :
      record.result === 'idle-failure' ? `停转 1 秒 · 本轮失败 · ${times}` : `状态不可验证或连接中断 · ${times}`;
    this.save();
    this.clearNextJob();
    if (record.result !== 'interrupted') this.nextJob = window.setTimeout(() => {
      this.nextJob = null;
      if (this.settings.nextMode === 'repeat') this.resetCase(); else this.nextCase();
    }, 700);
  }
  private validPool(): FormulaCase[] {
    this.invalidItems = [];
    const plls = this.items.filter(item => item.category === 'pll');
    const selected = this.selectedIds;
    const pool = this.categoryItems.filter(item => !selected.length ? !item.id.startsWith('oll:custom-') : selected.indexOf(item.id) >= 0);
    const cases: FormulaCase[] = [];
    for (const item of pool) {
      if (this.settings.slowOnly && !this.isSlow(item)) continue;
      try { cases.push(makeFormulaCase(item, plls, Math.random, this.settings.beforeZ2)); }
      catch (error) { this.invalidItems.push(`${item.name}：${(error as Error).message}`); }
    }
    return cases;
  }
  private showCase(item: FormulaCase): void {
    this.completedRecord = null;
    this.current = item;
    this.replayRecord = null;
    this.world.cube.twister.finish();
    this.world.cube.twister.setup(item.scramble || parseOpFormula(item.formula).inverse.join(' '));
    this.resize();
    this.now = Date.now();
    this.training.beginCase(item, this.now);
  }
  nextCase(): void {
    this.clearNextJob();
    this.training.cancel();
    this.completedRecord = null;
    this.current = null;
    const pool = this.validPool();
    if (!pool.length) {
      this.feedback = this.settings.slowOnly ? '当前筛选范围没有慢公式，请调整阈值或选择' :
        this.invalidItems.length ? `无有效题面：${this.invalidItems[0]}` : '当前公式池为空';
      return;
    }
    this.feedback = '';
    this.showCase(pool[Math.floor(Math.random() * pool.length)]);
  }
  resetCase(): void {
    this.clearNextJob();
    if (!this.current) { this.nextCase(); return; }
    this.showCase(this.current);
    this.feedback = '';
  }
  resetVisualCube(): void { this.resetCase(); }
  changeCategory(category: FormulaCategory): void { this.settings.category = category; this.save(); this.nextCase(); }
  toggleBeforeZ2(): void { this.settings.beforeZ2 = !this.settings.beforeZ2; this.save(); this.nextCase(); }
  changeSettings(): void {
    this.settings.slowSeconds = Math.max(0.1, Number(this.settings.slowSeconds) || 3);
    this.save(); this.nextCase();
  }
  isSlow(item: FormulaItem): boolean {
    const value = recentMedian(this.records, item.category, item.id);
    return value !== null && value > this.settings.slowSeconds * 1000;
  }
  medianLabel(item: FormulaItem): string {
    const value = recentMedian(this.records, item.category, item.id);
    const samples = this.records.filter(r => r.category === item.category && r.id === item.id && r.result === 'success').length;
    return value === null ? '暂无速度数据' : `近 ${Math.min(samples, 5)} 次中位数 ${(value / 1000).toFixed(2)} 秒`;
  }
  replay(record: FormulaRecord): void { this.clearNextJob(); this.training.cancel(); this.replayRecord = record; this.showCase(record); this.replayRecord = record; }
  leaveReplay(): void { this.replayRecord = null; this.resetCase(); }
  openPicker(): void {
    this.pickerGroup = 'builtin';
    for (const item of this.categoryItems) {
      if (this.ollPreviews[item.id] || this.f2lPreviews[item.id]) continue;
      try {
        const moves = parseOpFormula(item.formula).inverse.join(' ');
        const facelets = previewFormulaFacelets(item.category === 'f2l' ? moves : `z2 ${moves}`);
        if (item.category !== 'f2l') this.$set(this.ollPreviews, item.id, facelets);
        else this.$set(this.f2lPreviews, item.id, cubeIconTiles(facelets));
      } catch {
        if (item.category !== 'f2l') this.$set(this.ollPreviews, item.id, '');
        else this.$set(this.f2lPreviews, item.id, []);
      }
    }
    this.pickerOpen = true;
    if (this.settings.category === 'f2l') this.startIconRendering();
  }
  private startIconRendering(): void {
    if (this.iconFrame !== null || this.captureUnavailable) return;
    const group: AlgGroup = new AlgsData().algs[0];
    const pending = group.items.filter(item => this.categoryItems.some(choice => choice.name === item.name) &&
      !Object.prototype.hasOwnProperty.call(this.f2lPictures, `f2l:${item.name}`));
    if (!pending.length) return;
    try { if (!this.capture) this.capture = new Capture(); }
    catch { this.captureUnavailable = true; return; }
    const renderBatch = (): void => {
      this.iconFrame = null;
      if (!this.pickerOpen || this.settings.category !== 'f2l') return;
      for (let n = 0; n < 2 && pending.length; n++) {
        const alg = pending.shift()!;
        const id = `f2l:${alg.name}`;
        try {
          this.$set(this.f2lPictures, id, this.capture!.snap(group.strip, algsPreviewExpression(alg), alg.order || 3));
        } catch { this.$set(this.f2lPictures, id, ''); }
      }
      if (pending.length) this.iconFrame = requestAnimationFrame(renderBatch);
    };
    this.iconFrame = requestAnimationFrame(renderBatch);
  }
  private stopIconRendering(): void {
    if (this.iconFrame !== null) cancelAnimationFrame(this.iconFrame);
    this.iconFrame = null;
  }
  iconColor(color: string): string { return this.previewColors[color] || '#999'; }
  previewStyle(cell: TopNetCell, item: FormulaItem): object {
    const facelets = this.ollPreviews[item.id] || '';
    return { gridRow: cell.row + 1, gridColumn: cell.col + 1,
      backgroundColor: this.iconColor(facelets[cell.index]) };
  }
  closePicker(): void { this.stopPaint(); this.stopIconRendering(); this.pickerOpen = false; this.save(); this.nextCase(); }
  toggleChoice(id: string): void {
    const index = this.selectedIds.indexOf(id);
    if (index < 0) this.selectedIds.push(id); else this.selectedIds.splice(index, 1);
    this.save();
  }
  selectAll(): void {
    this.settings.selectedIds[this.settings.category] = Array.from(new Set(this.selectedIds.concat(this.pickerItems.map(item => item.id))));
    this.save();
  }
  clearSelection(): void {
    const ids = new Set(this.pickerItems.map(item => item.id));
    this.settings.selectedIds[this.settings.category] = this.selectedIds.filter(id => !ids.has(id));
    this.save();
  }
  startPaint(id: string, event: MouseEvent | TouchEvent): void {
    if ('button' in event && event.button !== 0) return;
    this.paint = true; this.visited.clear(); this.paintAdd = this.selectedIds.indexOf(id) < 0;
    this.paintChoice(id);
  }
  paintChoice(id: string): void {
    if (!this.paint || this.visited.has(id)) return;
    this.visited.add(id);
    if ((this.selectedIds.indexOf(id) >= 0) !== this.paintAdd) this.toggleChoice(id);
  }
  onTouchStart(id: string, event: TouchEvent): void {
    this.touchName = id;
    this.touchTimer = window.setTimeout(() => this.startPaint(id, event), 380);
  }
  onTouchMove(event: TouchEvent): void {
    if (!this.paint) { if (this.touchTimer !== null) clearTimeout(this.touchTimer); this.touchTimer = null; this.touchName = ''; return; }
    const touch = event.touches[0];
    const id = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-formula-choice]')?.getAttribute('data-formula-choice');
    if (id) { event.preventDefault(); this.paintChoice(id); }
  }
  onTouchEnd(): void {
    if (!this.paint && this.touchName) this.toggleChoice(this.touchName);
    this.stopPaint();
  }
  stopPaint(): void {
    if (this.touchTimer !== null) clearTimeout(this.touchTimer);
    this.touchTimer = null; this.paint = false; this.touchName = '';
  }
}
