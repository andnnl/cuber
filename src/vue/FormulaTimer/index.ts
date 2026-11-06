import { Component, Inject, Provide, Ref, Vue } from 'vue-property-decorator';
import World from '../../cuber/world';
import Cube from '../../cuber/cube';
import CubeGroup from '../../cuber/group';
import { TwistAction } from '../../cuber/twister';
import { PreferanceData, PaletteData, PRESET_PALETTES } from '../../data';
import { parseOpFormula } from '../../ble/op-formula';
import { FormulaTimer, FormulaCase, FormulaCategory, FormulaRecord, isFormulaGoal, recentMedian } from '../../ble/formula-timer';
import { FormulaTimerSettings, FormulaTimerStore } from '../../ble/formula-timer-store';
import { FormulaSummary, StatsPoint, StatsResult, recordTps, summarizeFormulaRecords } from '../../ble/formula-timer-stats';
import { FormulaStatsPreferencesStore } from '../../ble/formula-timer-stats-preferences';
import { chooseFormulaItems } from '../../ble/formula-timer-focus';
import { FormulaItem, makeFormulaCase } from '../../ble/formula-timer-formula';
import { CubeSession, SessionSnapshot } from '../../ble/cube-session';
import { LinkEvent } from '../../ble/types';
import { advanceDisplayedCube } from '../../ble/formula-timer-follow';
import { FormulaMoveRecovery, RecoveredMove } from '../../ble/formula-timer-recovery';
import { topNetCells, TopNetCell } from '../../ble/op-top-net';
import { algsPreviewExpression, cubeIconTiles, CubeIconTile, previewFormulaFacelets, formulaTimerMaskPlan, unmaskedFormulaFacelets } from '../../ble/formula-timer-preview';
import { advancedF2LCapturePlan, applyAdvancedF2LMask } from '../../ble/adv-f2l';
import Capture from '../Algs/capture';
import { AlgsData, AlgGroup } from '../Algs';
import Viewport from '../Viewport';
import Setting from '../Setting';
import NextCube from './NextCube';
import MirrorCube from './MirrorCube';
import { advanced, loadFormulaPool } from './formulas';
import './index.css';

@Component({ template: require('./index.html'), components: { viewport: Viewport, setting: Setting, nextCube: NextCube, mirrorCube: MirrorCube } })
export default class FormulaTimerView extends Vue {
  @Provide('world') world: World = new World();
  @Provide('preferance') preferance: PreferanceData = new PreferanceData(this.world);
  @Provide('palette') palette: PaletteData = new PaletteData(this.world);
  @Inject('cubeSession') session: CubeSession;
  @Ref('viewport') viewport: Viewport;
  @Ref('nextCube') nextCube: NextCube;
  @Ref('mirrorCube') mirrorCube: MirrorCube;
  private readonly displayCube = new Cube(3);

  settings: FormulaTimerSettings = { category: 'f2l', selectedIds: { f2l: [], advf2l: [], oll: [], pll: [] },
    nextMode: 'random', beforeZ2: false, beforeY: '', randomU: true, slowOnly: false, slowSeconds: 3,
    preload: false, mirrorCube: false, hideUnrelated: false, preloadLayout: 'alternate' };
  records: FormulaRecord[] = [];
  items: FormulaItem[] = [];
  invalidItems: string[] = [];
  ollPreviews: { [id: string]: string } = {};
  f2lPreviews: { [id: string]: CubeIconTile[] } = {};
  f2lPictures: { [id: string]: string } = {};
  readonly previewColors = PRESET_PALETTES['默认'];
  readonly previewCells = topNetCells('after');
  current: FormulaCase | null = null;
  queuedCase: FormulaCase | null = null;
  activeSide = 0;
  get preloadActive(): boolean { return this.settings.preload && !!this.current && !this.replayRecord && !this.statsOpen; }
  snapshot: SessionSnapshot | null = null;
  feedback = '';
  warning = '';
  now = Date.now();
  pickerOpen = false;
  pickerGroup: 'builtin' | 'custom' = 'builtin';
  recordResult = 'all';
  statsOpen = false;
  statsExpandedId = '';
  statsPreferences = new FormulaStatsPreferencesStore(window.localStorage).load();
  focusIds: string[] | null = null;
  focusCategory: FormulaCategory | null = null;
  focusTitle = '';
  replayRecord: FormulaRecord | null = null;
  completedRecord: FormulaRecord | null = null;
  private store = new FormulaTimerStore(window.localStorage);
  private readonly statsStore = new FormulaStatsPreferencesStore(window.localStorage);
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
  private readonly iconCube = new Cube(3);
  private lastMirrorAt = 0;
  private readonly recovery = new FormulaMoveRecovery();
  private displayMask: ReturnType<typeof formulaTimerMaskPlan> = null;
  private recoveryRound = 0;
  private verifyRequest = 0;
  private verifyJob: number | null = null;
  private verifyTimeout: number | null = null;
  private awaitingState = false;
  private unscoredRound = false;
  private preparing = false;
  private physicalRound = false;
  private readonly training = new FormulaTimer({
    now: () => Date.now(),
    schedule: (fn, ms) => window.setTimeout(fn, ms),
    cancel: id => window.clearTimeout(id),
    onResult: record => this.finishRecord(record),
  });

  private clearStatsFocus(): void {
    const wasFocused = this.focusIds !== null;
    this.focusIds = null;
    this.focusCategory = null;
    this.focusTitle = '';
    if (wasFocused) this.current = null;
  }

  get trainingCategory(): FormulaCategory { return this.focusCategory || this.settings.category; }
  get categoryItems(): FormulaItem[] { return this.items.filter(item => item.category === this.trainingCategory); }
  get pickerItems(): FormulaItem[] {
    return this.categoryItems.filter(item => this.settings.category !== 'oll' ||
      (this.pickerGroup === 'custom') === item.id.startsWith('oll:custom-'));
  }
  get selectedIds(): string[] { return this.settings.selectedIds[this.trainingCategory]; }
  get filteredRecords(): FormulaRecord[] {
    return this.records.filter(record => (this.recordResult === 'all' || record.result === this.recordResult) &&
      record.category === this.trainingCategory);
  }
  get statsResult(): StatsResult {
    return summarizeFormulaRecords(this.records, this.statsPreferences.category,
      this.statsPreferences.mode, this.statsPreferences.count, this.settings.slowSeconds);
  }
  get statsChart(): { durationPaths: string[]; reactionPaths: string[];
    durationDots: { x: number; y: number }[]; reactionDots: { x: number; y: number }[];
    failures: number[] } {
    const row = this.statsResult.formulas.find(item => item.id === this.statsExpandedId);
    const empty = { durationPaths: [], reactionPaths: [], durationDots: [], reactionDots: [], failures: [] };
    if (!row) return empty;
    const points = row.points;
    const maximum = points.reduce((max, item) => Math.max(max, item.durationMs || 0, item.reactionMs || 0), 1000);
    const position = (index: number, value: number): { x: number; y: number } => ({
      x: 10 + index * 280 / Math.max(1, points.length - 1), y: 90 - value / maximum * 75,
    });
    const series = (field: 'durationMs' | 'reactionMs') => {
      const paths: string[] = [];
      const dots: { x: number; y: number }[] = [];
      let segment: string[] = [];
      points.forEach((point: StatsPoint, index: number) => {
        const value = point[field];
        if (value === null) {
          if (segment.length > 1) paths.push(segment.join(' '));
          segment = [];
          return;
        }
        const dot = position(index, value);
        dots.push(dot);
        segment.push(`${dot.x},${dot.y}`);
      });
      if (segment.length > 1) paths.push(segment.join(' '));
      return { paths, dots };
    };
    const duration = series('durationMs');
    const reaction = series('reactionMs');
    return { durationPaths: duration.paths, reactionPaths: reaction.paths,
      durationDots: duration.dots, reactionDots: reaction.dots,
      failures: points.map((point, index) => point.result === 'idle-failure' ? position(index, 0).x : -1)
        .filter(x => x >= 0) };
  }
  statsSeconds(value: number | null): string { return value === null ? '—' : (value / 1000).toFixed(2) + ' 秒'; }
  statsRate(value: number | null): string { return value === null ? '—' : (value * 100).toFixed(0) + '%'; }
  statsLabel(label: string): string {
    return ({ duration: '拧动慢', reaction: '反应慢', failure: '失败较多' } as Record<string, string>)[label] || label;
  }
  statsGroupRows(label: 'duration' | 'reaction' | 'failure'): FormulaSummary[] { return this.statsResult.groups[label]; }
  statsGroupValue(row: FormulaSummary, label: string): string {
    return label === 'failure' ? this.statsRate(row.successRate) :
      this.statsSeconds(label === 'reaction' ? row.meanReactionMs : row.meanDurationMs);
  }
  statsAvailable(row: FormulaSummary): boolean {
    return this.items.some(item => item.category === row.category && item.id === row.id);
  }
  statsGroupAvailable(label: 'duration' | 'reaction' | 'failure'): boolean {
    return this.statsGroupRows(label).some(row => this.statsAvailable(row));
  }
  saveStatsPreferences(): void {
    this.statsExpandedId = '';
    if (!this.statsStore.save(this.statsPreferences)) this.warning = '统计筛选偏好保存失败';
  }
  openStats(): void {
    if (this.training.startedAt !== null) this.training.interrupt(Date.now());
    this.clearNextJob();
    this.training.cancel();
    this.current = null;
    this.queuedCase = null;
    this.clearStatsFocus();
    this.statsOpen = true;
  }
  closeStats(): void { this.statsOpen = false; this.nextCase(); this.$nextTick(() => this.resize()); }
  toggleStatsRow(id: string): void { this.statsExpandedId = this.statsExpandedId === id ? '' : id; }
  startStatsFocus(rows: FormulaSummary[], title: string): void {
    const available = rows.filter(row => this.statsAvailable(row));
    if (!available.length) return;
    if (this.training.startedAt !== null) this.training.interrupt(Date.now());
    this.clearNextJob();
    this.training.cancel();
    this.focusCategory = this.statsPreferences.category;
    this.focusIds = available.map(row => row.id);
    this.focusTitle = title;
    this.statsOpen = false;
    this.nextCase();
    this.$nextTick(() => this.resize());
  }
  leaveStatsFocus(): void {
    if (this.training.startedAt !== null) this.training.interrupt(Date.now());
    this.clearNextJob();
    this.clearStatsFocus();
    this.nextCase();
  }
  get elapsed(): string {
    if (this.replayRecord || this.completedRecord) return (((this.replayRecord || this.completedRecord)!.durationMs) / 1000).toFixed(2);
    if (this.training.startedAt === null) return '0.00';
    return (this.training.elapsedAt(this.now) / 1000).toFixed(2);
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
  formatTps(record: FormulaRecord): string {
    const tps = recordTps(record);
    return tps === null ? '—' : tps.toFixed(2);
  }
  formatMeanTps(value: number | null): string { return value === null ? '—' : value.toFixed(2); }
  get statusLabel(): string {
    if (this.replayRecord) return '复盘题面 · 计时暂停';
    if (this.awaitingState || this.recovery.needsState) return '正在核验实体转动 · 请稍候';
    if (this.unscoredRound) return '实体转动跟随中 · 本轮不计时';
    return this.training.startedAt === null ? '等待首次转动 · 支持实体魔方、鼠标、触摸或键盘' : '计时中 · 停转 2 秒将结束本轮';
  }
  get slowCount(): number {
    return this.categoryItems.filter(item => this.isSlow(item)).length;
  }

  mounted(): void {
    this.world.cube.recordCallbacks.push(this.onDirectMove);
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
    const index = this.world.cube.recordCallbacks.indexOf(this.onDirectMove);
    if (index >= 0) this.world.cube.recordCallbacks.splice(index, 1);
    if (this.capture) { this.capture.renderer.dispose(); this.capture.renderer.forceContextLoss(); this.capture = null; }
    if (this.clockTick !== null) window.clearInterval(this.clockTick);
    window.removeEventListener('mouseup', this.stopPaint);
  }
  onAppDeactivate(): void {
    this.active = false;
    this.clearVerification(false);
    this.stopIconRendering();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.training.cancel();
    this.clearNextJob();
    this.clearStatsFocus();
    this.stopPaint();
    this.queuedCase = null;
  }
  onAppActivate(): void { this.active = true; if (!this.statsOpen) this.resetCase(); this.resize(); this.loop(); }
  onSessionSnapshot(snapshot: SessionSnapshot): void {
    if (this.snapshot?.status === 'connected' && snapshot.status === 'disconnected') {
      this.clearVerification(false);
      this.recovery.start(null);
      if (this.physicalRound) {
        this.training.interrupt(Date.now());
        this.feedback = '蓝牙连接中断，请重试同题；也可直接操作屏幕魔方';
      }
    }
    if (this.snapshot?.status !== 'connected' && snapshot.status === 'connected') {
      this.training.resetSerial();
      this.recovery.start(snapshot.facelets, snapshot.faceletsSerial ?? undefined);
      if (this.current && !this.training.current && !this.replayRecord) this.resetCase();
    }
    this.snapshot = snapshot;
  }
  handlePhysicalEvent(event: LinkEvent, live: boolean): void {
    if (!this.active || this.replayRecord || this.statsOpen) return;
    if (event.type === 'facelets') {
      if (!this.awaitingState && this.training.startedAt === null && !this.recovery.hasBaseline) {
        this.recovery.start(event.facelets, event.serial);
      }
      if (!this.awaitingState || !this.current) return;
      const result = this.recovery.state(event.facelets, event.serial, this.verifyRequest);
      if (result.status === 'stale') return;
      if (result.status === 'confirm') { this.scheduleVerification(false); return; }
      this.clearVerification(false);
      if (result.status === 'uncertain') { this.failVerification('实体动作无法唯一核验，请重试同题'); return; }
      if (result.tail) {
        this.training.interrupt(this.training.lastMoveAt || Date.now());
        this.playRecoveredMoves(result.moves, false);
        this.feedback = '末步已补回，时间无法精确核验，请重试同题';
        return;
      }
      if (result.moves.some(item => item.at === null) && this.training.startedAt === null) {
        this.training.interrupt(Date.now());
        this.playRecoveredMoves(result.moves, false);
        this.scheduleUnscoredNext(false);
        return;
      }
      const round = this.recoveryRound;
      this.playRecoveredMoves(result.moves, true);
      if (round === this.recoveryRound) this.training.releaseVerification();
      return;
    }
    if (event.type !== 'move' || (!live && !event.recovered)) return;
    const at = Date.now();
    const result = this.recovery.move(event.move, event.serial, event.recovered ? null : at, event.recovered);
    if (result.status === 'stale') return;
    this.physicalRound = true;
    if (result.status === 'pending') {
      if (result.moves.length) this.playRecoveredMoves(result.moves, false);
      this.training.holdForVerification();
      this.scheduleVerification(true);
      return;
    }
    if (result.status === 'uncertain') { this.failVerification('实体转动序号无法核验，请重试同题'); return; }
    if (!this.recovery.hasBaseline && !this.unscoredRound) {
      this.unscoredRound = true;
      this.training.interrupt(this.training.lastMoveAt || at);
      this.feedback = '实体状态基线尚未同步；继续显示动作，本轮不计成绩';
    }
    if (result.moves.some(item => item.at === null) && this.training.startedAt === null) {
      this.training.interrupt(at);
      this.playRecoveredMoves(result.moves, false);
      this.scheduleUnscoredNext(false);
      return;
    }
    if (result.moves.length && result.moves[result.moves.length - 1].at === null) {
      this.training.interrupt(this.training.lastMoveAt || at);
      this.playRecoveredMoves(result.moves, false);
      this.feedback = '末步已补回，时间无法精确核验，请重试同题';
      return;
    }
    const round = this.recoveryRound;
    this.playRecoveredMoves(result.moves, true);
    if (round !== this.recoveryRound) return;
    if (this.recovery.needsState) this.scheduleVerification(true);
    else if (result.moves.length && event.serial !== undefined && !event.recovered && this.training.current) this.scheduleVerification(false);
  }
  private playRecoveredMoves(moves: RecoveredMove[], allowCompletion: boolean): void {
    if (moves.length) this.physicalRound = true;
    // 历史/状态补回的动作缺少真实发生时间；即使随后看到了完成题面，也不能据此计算有效 TPS。
    const untimed = moves.some(item => item.at === null);
    if (untimed) this.unscoredRound = true;
    if (untimed && this.training.startedAt !== null) {
      this.training.interrupt(this.training.lastMoveAt || Date.now());
      this.feedback = '已补回实体动作，但时间无法核验；本轮不计成功和 TPS，请重试同题';
    }
    for (const item of moves) {
      const at = item.at ?? Date.now();
      // 计时可能因缺失首步而中断，但同批已核验的后续实体动作仍须显示。
      if (item.at !== null && !this.unscoredRound) this.training.move(at);
      this.playPhysicalMove(item.move, at, item.at === null);
    }
    const last = moves[moves.length - 1];
    if (allowCompletion && !this.unscoredRound && last && this.current && isFormulaGoal(this.current.category, this.displayCube.serialize(), this.current))
      this.training.completeDisplayed(last.at ?? Date.now());
  }
  private playPhysicalMove(physicalMove: string, at: number, instant = false): void {
    this.world.controller.handleUp();
    this.now = at;
    const move = advanceDisplayedCube(this.displayCube, physicalMove);
    if (!move) return;
    const interval = this.lastMirrorAt ? at - this.lastMirrorAt : 500;
    this.lastMirrorAt = at;
    const backlog = this.world.cube.twister.length;
    CubeGroup.durationScale = Math.max(0.067, Math.min(1, interval / 500, backlog ? Math.pow(0.55, backlog) : 1));
    this.world.cube.twister.push(move, false, 1, 'programmatic');
    if (instant) this.world.cube.twister.finish();
  }
  prepareDirectInput(): void {
    if (!this.active || this.statsOpen || this.pickerOpen || this.replayRecord) return;
    this.world.controller.handleUp();
    this.world.cube.twister.finish();
    CubeGroup.durationScale = 1;
  }
  onCubeKeydown(event: KeyboardEvent): void {
    if (!this.active || this.statsOpen || this.pickerOpen || this.replayRecord ||
      event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target?.tagName || '')) return;
    if (!/^[urfdlbmesxyz]$/i.test(event.key)) return;
    event.preventDefault();
    this.prepareDirectInput();
    const sign = /[xyz]/i.test(event.key) ? event.key.toLowerCase() : event.key.toUpperCase();
    this.world.cube.twister.push(sign + (event.shiftKey ? "'" : ''));
  }
  private onDirectMove(action: TwistAction): void {
    if (action.source === 'programmatic' || this.preparing || !this.active || this.statsOpen ||
      this.pickerOpen || this.replayRecord || !this.current || (!this.training.current && !this.unscoredRound) ||
      action.times % 4 === 0) return;
    this.displayCube.twister.twist(new TwistAction(action.sign, action.reverse, action.times), true, true);
    if (/^[xyz]$/.test(action.sign)) return;
    this.now = Date.now();
    if (!this.unscoredRound) this.training.move(this.now);
  }
  private clearVerification(release = true): void {
    this.recoveryRound++;
    if (this.verifyJob !== null) window.clearTimeout(this.verifyJob);
    if (this.verifyTimeout !== null) window.clearTimeout(this.verifyTimeout);
    this.verifyJob = this.verifyTimeout = null;
    this.awaitingState = false;
    if (release) this.training.releaseVerification();
  }
  private failVerification(message: string): void {
    this.clearVerification(false);
    this.recovery.start(null);
    this.training.interrupt(this.training.lastMoveAt || Date.now());
    this.feedback = message;
    // 序号与整幅状态均无法还原动作时，当前题面已不可靠，自动复位同题避免卡死。
    this.clearNextJob();
    const current = this.current;
    this.nextJob = window.setTimeout(() => {
      this.nextJob = null;
      if (!this.active || !current || this.current !== current) return;
      this.resetCase();
      this.feedback = '实体动作无法核验，已自动重置同题；请重新操作';
    }, 1200);
  }
  private scheduleUnscoredNext(completed = true): void {
    if (this.nextJob !== null || !this.current) return;
    this.feedback = completed
      ? '3D 魔方已达到完成条件；本轮起始时间不可靠，不计成绩，准备下一题'
      : '起始动作已补回，但起始时间无法核验；本轮不计成绩，准备重试下一题';
    this.nextJob = window.setTimeout(() => {
      this.nextJob = null;
      if (this.settings.nextMode === 'repeat') this.resetCase(); else this.nextCase();
    }, 700);
  }
  private scheduleVerification(immediate: boolean): void {
    if (!this.recovery.hasBaseline) {
      if (immediate) this.failVerification('没有可用的实体状态基线，请重试同题');
      return;
    }
    this.clearVerification(false);
    const round = this.recoveryRound;
    this.training.holdForVerification();
    this.verifyJob = window.setTimeout(() => {
      if (round !== this.recoveryRound || !this.current) return;
      this.awaitingState = true;
      this.verifyRequest++;
      this.verifyTimeout = window.setTimeout(() => {
        if (round === this.recoveryRound && this.awaitingState)
          this.failVerification('实体状态核验超时，请重试同题');
      }, 1300);
      void this.session.requestFacelets().catch(() => {
        if (round === this.recoveryRound) this.failVerification('无法请求实体状态，请重试同题');
      });
    }, immediate ? 0 : 350);
  }
  private loop(): void {
    if (!this.active) return;
    if (!this.statsOpen) {
      const changed = this.viewport?.draw();
      this.nextCube?.draw(!!changed);
      this.mirrorCube?.draw(!!changed);
    }
    // 逻辑账本可能早于动画（或鼠标转动）变化；可见魔方归位时以画面为准结算。
    if (this.current && !this.awaitingState && !this.recovery.needsState && this.verifyJob === null &&
      !this.world.cube.twister?.length && !this.world.controller?.rotating &&
      !Array.from(this.world.cube.locks?.values() || []).some(lock => lock.size > 0) &&
      isFormulaGoal(this.current.category, unmaskedFormulaFacelets(this.world.cube), this.current)) {
      if (this.unscoredRound) this.scheduleUnscoredNext();
      else if (this.training.startedAt !== null)
        this.training.completeDisplayed(this.training.lastMoveAt || Date.now());
    }
    this.frame = requestAnimationFrame(() => this.loop());
  }
  resize(): void {
    const box = this.$refs.cubeArea as HTMLElement | undefined;
    if (box) this.viewport?.resize(box.clientWidth, box.clientHeight);
    if (box) this.mirrorCube?.resize(box.clientWidth, box.clientHeight);
    const preview = this.$refs.nextCubeArea as HTMLElement | undefined;
    if (preview) this.nextCube?.resize(preview.clientWidth, preview.clientHeight);
  }
  private save(): void { const error = this.store.save(this.settings, this.records); this.warning = error || ''; }
  private clearNextJob(): void {
    if (this.nextJob !== null) window.clearTimeout(this.nextJob);
    this.nextJob = null;
  }
  private finishRecord(record: FormulaRecord): void {
    this.clearVerification(false);
    this.completedRecord = record;
    this.records.unshift(record);
    const times = `反应 ${this.formatReaction(record)} 秒 · 拧公式 ${(record.durationMs / 1000).toFixed(2)} 秒 · ${record.moveCount ?? '—'} 步 · TPS ${this.formatTps(record)}`;
    this.feedback = record.result === 'success' ? `成功 · ${times}` :
      record.result === 'idle-failure' ? `停转 2 秒 · 本轮失败 · ${times}` : `状态不可验证或连接中断 · ${times}`;
    this.save();
    this.clearNextJob();
    if (record.result === 'success' && this.advanceQueuedCase()) return;
    if (record.result !== 'interrupted') this.nextJob = window.setTimeout(() => {
      this.nextJob = null;
      if (this.settings.nextMode === 'repeat') this.resetCase(); else this.nextCase();
    }, 700);
  }
  private validPool(firstOnly = false): FormulaCase[] {
    this.invalidItems = [];
    const plls = this.items.filter(item => item.category === 'pll');
    const pool = chooseFormulaItems(this.items, this.trainingCategory, this.selectedIds, this.settings.slowOnly,
      id => this.isSlow(this.categoryItems.find(item => item.id === id)!), this.focusIds);
    const cases: FormulaCase[] = [];
    const start = firstOnly ? Math.floor(Math.random() * pool.length) : 0;
    for (let offset = 0; offset < pool.length; offset++) {
      const item = pool[(start + offset) % pool.length];
      try { cases.push(makeFormulaCase(item, plls, Math.random, this.settings.beforeZ2,
        this.settings.beforeY, this.settings.randomU));
        if (firstOnly) break;
      }
      catch (error) { this.invalidItems.push(`${item.name}：${(error as Error).message}`); }
    }
    return cases;
  }
  private prepareQueuedCase(): void {
    this.queuedCase = null;
    if (!this.settings.preload || !this.current) return;
    this.queuedCase = this.settings.nextMode === 'repeat' ? {...this.current} : this.validPool(true)[0] || null;
  }
  private advanceQueuedCase(): boolean {
    if (!this.settings.preload || !this.queuedCase || !this.active || this.statsOpen || this.replayRecord || this.pickerOpen) return false;
    const next = this.queuedCase;
    this.queuedCase = null;
    this.activeSide = this.settings.preloadLayout === 'alternate' ? 1 - this.activeSide : 0;
    this.showCase(next, false, true);
    return true;
  }
  changePreloadMode(): void {
    this.save();
    this.activeSide = 0;
    this.queuedCase = null;
    this.resetCase();
    this.$nextTick(() => this.resize());
  }
  changeMirrorCube(): void {
    this.save();
    this.$nextTick(() => this.resize());
  }
  changePreloadLayout(): void {
    this.save();
    this.activeSide = 0;
    this.$nextTick(() => this.resize());
  }
  changeNextMode(): void {
    this.save();
    if (this.settings.preload) { this.queuedCase = null; this.resetCase(); }
  }
  private showCase(item: FormulaCase, keepQueued = false, keepRecovery = false): void {
    this.clearVerification(false);
    this.unscoredRound = false;
    this.physicalRound = false;
    const entity = this.session.snapshot;
    if (!keepRecovery && !this.recovery.canContinue(entity.lastMoveSerial)) this.recovery.start(null);
    if (entity.status === 'connected' && !this.recovery.hasBaseline)
      void this.session.requestFacelets().catch(() => { /* 无状态时仍可实时跟随，断档时暂停。 */ });
    this.completedRecord = null;
    this.current = item;
    this.replayRecord = null;
    this.preparing = true;
    try {
      this.world.controller.handleUp();
      this.world.cube.twister.discardPending();
      CubeGroup.durationScale = 1;
      this.lastMirrorAt = 0;
      const scramble = item.scramble || parseOpFormula(item.formula).inverse.join(' ');
      this.displayMask = formulaTimerMaskPlan(item, advanced.cases);
      applyAdvancedF2LMask(this.world.cube, null);
      this.world.cube.twister.setup(scramble);
      this.displayCube.twister.setup(scramble);
      this.applyDisplayMask();
    } finally { this.preparing = false; }
    if (!keepQueued || !this.queuedCase) this.prepareQueuedCase();
    this.resize();
    this.now = Date.now();
    this.training.beginCase(item, this.now);
    this.$nextTick(() => this.resize());
  }
  nextCase(): void {
    this.clearNextJob();
    this.training.cancel();
    this.completedRecord = null;
    this.current = null;
    this.queuedCase = null;
    this.activeSide = 0;
    const pool = this.validPool(this.settings.preload);
    if (!pool.length) {
      this.feedback = this.focusIds ? '临时训练池没有可用题目，请退出重点训练' :
        this.settings.slowOnly ? '当前筛选范围没有慢公式，请调整阈值或选择' :
        this.invalidItems.length ? `无有效题面：${this.invalidItems[0]}` : '当前公式池为空';
      return;
    }
    this.feedback = '';
    this.showCase(pool[Math.floor(Math.random() * pool.length)]);
  }
  resetCase(): void {
    this.clearNextJob();
    if (!this.current) { this.nextCase(); return; }
    this.showCase(this.current, true);
    this.feedback = '';
  }
  resetVisualCube(): void { this.resetCase(); }
  get queuedMask(): ReturnType<typeof formulaTimerMaskPlan> {
    return this.settings.hideUnrelated && this.queuedCase ? formulaTimerMaskPlan(this.queuedCase, advanced.cases) : null;
  }
  private applyDisplayMask(): void {
    applyAdvancedF2LMask(this.world.cube, this.settings.hideUnrelated ? this.displayMask : null);
  }
  changeHideUnrelated(): void { this.save(); this.applyDisplayMask(); }
  changeCategory(category: FormulaCategory): void {
    this.clearStatsFocus();
    this.settings.category = category; this.save(); this.nextCase();
  }
  toggleBeforeZ2(): void { this.settings.beforeZ2 = !this.settings.beforeZ2; this.save(); this.nextCase(); }
  changeBeforeY(): void { this.save(); this.nextCase(); }
  toggleRandomU(): void { this.settings.randomU = !this.settings.randomU; this.save(); this.nextCase(); }
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
    if (this.focusIds) this.leaveStatsFocus();
    this.pickerGroup = 'builtin';
    for (const item of this.categoryItems) {
      if (this.ollPreviews[item.id] || this.f2lPreviews[item.id]) continue;
      try {
        const moves = parseOpFormula(item.formula).inverse.join(' ');
        const f2l = item.category === 'f2l' || item.category === 'advf2l';
        const facelets = previewFormulaFacelets(f2l ? moves : `z2 ${moves}`);
        if (!f2l) this.$set(this.ollPreviews, item.id, facelets);
        else this.$set(this.f2lPreviews, item.id, cubeIconTiles(facelets));
      } catch {
        if (item.category !== 'f2l' && item.category !== 'advf2l') this.$set(this.ollPreviews, item.id, '');
        else this.$set(this.f2lPreviews, item.id, []);
      }
    }
    this.pickerOpen = true;
    if (this.settings.category === 'f2l' || this.settings.category === 'advf2l') this.startIconRendering();
  }
  private startIconRendering(): void {
    if (this.iconFrame !== null || this.captureUnavailable) return;
    const group: AlgGroup = new AlgsData().algs[0];
    const category = this.settings.category;
    const pending = this.categoryItems.filter(item => !Object.prototype.hasOwnProperty.call(this.f2lPictures, item.id));
    if (!pending.length) return;
    try { if (!this.capture) this.capture = new Capture(); }
    catch { this.captureUnavailable = true; return; }
    const renderBatch = (): void => {
      this.iconFrame = null;
      if (!this.pickerOpen || this.settings.category !== category) return;
      for (let n = 0; n < 2 && pending.length; n++) {
        const item = pending.shift()!;
        try {
          if (category === 'advf2l') {
            const [, caseId, directionText, ...altId] = item.id.split(':');
            const source = advanced.cases.find(candidate => candidate.id === Number(caseId))!;
            const direction = Number(directionText);
            const variant = source.algs[direction].findIndex(candidate => candidate.altId === altId.join(':'));
            const plan = advancedF2LCapturePlan(source, false, direction, this.iconCube, variant);
            this.$set(this.f2lPictures, item.id, this.capture!.snap(plan.strip, plan.exp, 3, plan.blackCubelets));
          } else {
            const alg = group.items.find(candidate => candidate.name === item.name)!;
            this.$set(this.f2lPictures, item.id, this.capture!.snap(group.strip, algsPreviewExpression(alg), alg.order || 3));
          }
        } catch { this.$set(this.f2lPictures, item.id, ''); }
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
