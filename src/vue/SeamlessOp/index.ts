import { Component, Provide, Ref, Vue } from 'vue-property-decorator';
import Cube from '../../cuber/cube';
import World from '../../cuber/world';
import { PreferanceData, PaletteData, PRESET_PALETTES } from '../../data';
import { generateOpCase, validateOpCase, OpCase, OpCaseMode, OpItem } from '../../ble/op-case';
import { OpTraining, OpRecord } from '../../ble/op-training';
import { traceOpStickers, OpTrace, applyStickerPermutation } from '../../ble/op-sticker-trace';
import { previewOllFacelets } from '../../ble/op-oll-preview';
import { CustomOll, restoreCustomOlls, selectedOllPool, customOllItem } from '../../ble/op-custom-oll';
import { loadCustomOllLibrary, saveCustomOllLibrary } from '../../ble/op-oll-library';
import { topNetCells, topObservationArrows, filterOpDestinationArrows, OpDestinationFace, TopNetCell, TopNetArrow } from '../../ble/op-top-net';
import { calculateOpFocus, focusDifficulty, selectFocusedCase, opWindowCoverage, FocusLevel, OpFocus, OpCoverage } from '../../ble/op-focus';
import { OpView } from '../../ble/op-window';
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
const DESTINATION_FACES: OpDestinationFace[] = ['L', 'F', 'R', 'B'];
type Settings = { mode: OpCaseMode; pllNames: string[]; ollNames: string[]; customOll: string; useCustom: boolean; customOlls: CustomOll[]; z2: boolean; showHints: boolean; allTrajectories: boolean; focusLevel: FocusLevel; destinationFaces: OpDestinationFace[] };
const defaults = (): Settings => ({ mode: 'pll', pllNames: [], ollNames: [], customOll: '', useCustom: false, customOlls: [], z2: false, showHints: false, allTrajectories: false, focusLevel: 'beginner', destinationFaces: DESTINATION_FACES.slice() });

@Component({ template: require('./index.html'), components: { viewport: Viewport, setting: Setting } })
export default class SeamlessOp extends Vue {
  readonly PLL = PLL;
  readonly OLL = OLL;
  readonly ollPreviewColors = PRESET_PALETTES['默认'];
  readonly ollPreviews: Record<string, string> = OLL.reduce((previews, item) => {
    previews[item.name] = previewOllFacelets(item, simulate);
    return previews;
  }, {} as Record<string, string>);
  readonly beforeCells = topNetCells('before');
  readonly afterCells = topNetCells('after');
  readonly destinationFaces = DESTINATION_FACES;
  @Provide('world') world: World = new World();
  @Provide('preferance') preferance: PreferanceData = new PreferanceData(this.world);
  @Provide('palette') palette: PaletteData = new PaletteData(this.world);
  @Ref('viewport') viewport: Viewport;

  settings: Settings = defaults();
  training: OpTraining | null = null;
  feedback = '';
  trace: OpTrace | null = null;
  focus: OpFocus | null = null;
  coverage: OpCoverage[] = [];
  step = 0;
  playing = false;
  width = 0;
  height = 0;
  paletteVersion = 0;
  selectedArrowId: number | null = null;
  private paletteSignature = '';
  pickerOpen = false;
  ollPickerOpen = false;
  ollPickerGroup: 'builtin' | 'custom' = 'builtin';
  customName = '';
  customFormula = '';
  customEditingId: string | null = null;
  customError = '';
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
  get availableOlls(): OpItem[] { return selectedOllPool(OLL, this.settings.customOlls, this.settings.ollNames); }
  get choices(): string[] { return [...PLL.map(item => item.name.slice(4)), '无 PLL']; }
  get revealed(): boolean { return !!this.training?.revealed; }
  get hintsVisible(): boolean { return !!this.training?.hintsVisible; }
  get records(): OpRecord[] { return this.training?.filteredRecords(this.recordFilter, this.recordOllFilter, this.recordResultFilter) || []; }
  get cubeHeight(): number {
    return this.width <= 600 ? Math.max(220, Math.min(300, Math.floor(this.height * .34))) : Math.max(240, Math.floor(this.height * .44));
  }
  get netBefore(): string {
    if (!this.current || !this.trace) return '';
    return applyStickerPermutation(this.current.beforeFacelets, this.trace.positions[this.step]);
  }
  get allNetArrows(): TopNetArrow[] {
    if (!this.hintsVisible || !this.trace) return [];
    return topObservationArrows(this.netBefore, this.trace.positions, this.step);
  }
  get netArrows(): TopNetArrow[] {
    const arrows = this.settings.allTrajectories || !this.focus ? this.allNetArrows :
      this.allNetArrows.filter(arrow => this.focus!.arrowIds.indexOf(arrow.id) >= 0);
    return filterOpDestinationArrows(arrows, this.settings.destinationFaces);
  }
  toggleDestinationFace(face: OpDestinationFace): void {
    const selected = this.settings.destinationFaces;
    this.settings.destinationFaces = selected.indexOf(face) >= 0 ? selected.filter(item => item !== face) : [...selected, face];
    this.selectedArrowId = null;
    this.saveSettings();
  }
  get activeNetArrow(): TopNetArrow | null { return this.netArrows.find(arrow => arrow.id === this.selectedArrowId) || null; }
  get displayedNetArrows(): TopNetArrow[] { return this.activeNetArrow ? [this.activeNetArrow] : this.netArrows; }
  netSource(index: number): TopNetArrow | undefined { return this.netArrows.find(arrow => arrow.from === index); }
  selectNetSource(index: number): void {
    const arrow = this.netSource(index);
    if (arrow) this.selectedArrowId = this.selectedArrowId === arrow.id ? null : arrow.id;
  }
  selectNetTarget(index: number): void {
    const arrow = this.netArrows.find(item => item.to === index);
    if (arrow) this.selectedArrowId = this.selectedArrowId === arrow.id ? null : arrow.id;
  }
  selectOpWindow(view: OpView): void {
    this.focus = this.coverage.find(item => item.view === view) || this.focus;
    this.settings.destinationFaces = DESTINATION_FACES.filter(face => view.includes(face));
    this.selectedArrowId = null;
    this.saveSettings();
  }
  netRoute(arrow: TopNetArrow): string {
    const x1 = this.netX(arrow.from), y1 = this.netY(arrow.from);
    const x2 = this.netX(arrow.to), y2 = this.netY(arrow.to);
    if (arrow.from === arrow.to) return `M ${x1} ${y1} C ${x1 + 55} ${y1 - 70} ${x1 - 55} ${y1 - 70} ${x1} ${y1}`;
    return `M ${x1} ${y1} Q ${(x1 + x2) / 2 + 18} ${(y1 + y2) / 2 - 18} ${x2} ${y2}`;
  }
  netStyle(cell: TopNetCell, facelets: string): object {
    void this.paletteVersion;
    return { gridRow: cell.row + 1, gridColumn: cell.col + 1,
      backgroundColor: this.palette.getColor(facelets[cell.index]) };
  }
  ollPreviewStyle(cell: TopNetCell, name: string): object {
    return { gridRow: cell.row + 1, gridColumn: cell.col + 1,
      backgroundColor: this.ollPreviewColors[this.ollPreviews[name][cell.index]] };
  }
  netCell(index: number): TopNetCell | undefined { return this.afterCells.find(cell => cell.index === index); }
  private netCenter(position: number): number { return [25, 100, 200, 300, 375][position] || 0; }
  netX(index: number): number { return this.netCenter(this.netCell(index)?.col || 0); }
  netY(index: number): number { return this.netCenter(this.netCell(index)?.row || 0); }

  mounted(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS) || '{}');
      const customOlls = loadCustomOllLibrary(localStorage, OLL,
        item => { validateOpCase(null, item, '', simulate); });
      const restored = restoreCustomOlls({ ...saved, customOlls,
        ollNames: saved.useCustom && !Array.isArray(saved.customOlls) &&
          customOlls.some(item => item.id === 'custom-legacy') ?
          ['custom-legacy'] : saved.ollNames }, OLL);
      this.settings = { ...defaults(), ...saved,
        customOlls: restored.customOlls, ollNames: restored.ollNames, useCustom: false,
        customOll: restored.customOlls.some(item => item.id === 'custom-legacy') ? '' :
          typeof saved.customOll === 'string' ? saved.customOll : '',
        z2: saved.z2 === true,
        showHints: saved.showHints === true,
        allTrajectories: saved.allTrajectories === true,
        focusLevel: ['beginner', 'intermediate', 'all'].indexOf(saved.focusLevel) >= 0 ? saved.focusLevel : 'beginner',
        destinationFaces: Array.isArray(saved.destinationFaces) ?
          DESTINATION_FACES.filter(face => saved.destinationFaces.indexOf(face) >= 0) : DESTINATION_FACES.slice(),
        pllNames: Array.isArray(saved.pllNames) ? saved.pllNames.filter((name: string) => PLL.some(item => item.name === name)) : [] };
      if (['pll', 'none', 'mixed'].indexOf(this.settings.mode) < 0) this.settings.mode = 'pll';
      for (const item of restored.customOlls) this.$set(this.ollPreviews, item.id, previewOllFacelets(customOllItem(item), simulate));
      if (this.settings.customOll) {
        this.customName = '旧自定义 OLL';
        this.customFormula = this.settings.customOll;
        this.customError = '旧公式未通过校验，请修改后保存到自定义分组';
      }
      if (!Array.isArray(saved.customOlls) || saved.useCustom) this.saveSettings();
    } catch { this.settings = defaults(); }
    try { this.training = new OpTraining(() => this.generate(), localStorage, Date.now); }
    catch (error) { this.feedback = (error as Error).message; }
    this.training?.setHintsVisible(this.settings.showHints);
    this.loadCase();
    this.$nextTick(() => { this.preferance.refresh(); this.palette.refresh(); this.resize(); this.loop(); });
  }
  beforeDestroy(): void { this.onAppDeactivate(); }
  onAppDeactivate(): void { this.pause(); this.active = false; if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; }
  onAppActivate(): void { this.active = true; this.resize(); this.loop(); }
  private loop(): void {
    if (!this.active) return;
    this.viewport?.draw();
    const colors = 'URFDLB'.split('').map(face => this.palette.getColor(face)).join('|');
    if (colors !== this.paletteSignature) { this.paletteSignature = colors; this.paletteVersion++; }
    this.frame = requestAnimationFrame(() => this.loop());
  }
  resize(): void {
    this.width = Math.max(300, document.documentElement.clientWidth);
    this.height = document.documentElement.clientHeight;
    this.viewport?.resize(this.$refs.cubeArea ? (this.$refs.cubeArea as HTMLElement).clientWidth : this.width, this.cubeHeight);
  }
  private generate(): OpCase {
    const plls = this.settings.pllNames.length ? PLL.filter(item => this.settings.pllNames.indexOf(item.name) >= 0) : PLL;
    const olls = this.availableOlls;
    if (this.settings.focusLevel === 'all' || this.settings.mode === 'none')
      return generateOpCase(plls, olls, Math.random, simulate, this.settings.mode, this.settings.z2);
    if (this.settings.mode === 'mixed' && Math.random() < 1 / (plls.length + 1))
      return generateOpCase(plls, olls, Math.random, simulate, 'none', this.settings.z2);
    const candidates: Array<{ sample: OpCase; focus: OpFocus }> = [];
    for (let i = 0; i < 8; i++) {
      const sample = generateOpCase(plls, olls, Math.random, simulate, 'pll', this.settings.z2);
      const focus = calculateOpFocus(traceOpStickers(sample.moves));
      candidates.push({ sample, focus });
    }
    return selectFocusedCase(candidates, this.settings.focusLevel).sample;
  }
  private loadCase(): void {
    if (!this.current) return;
    this.pause();
    this.step = 0;
    this.selectedArrowId = null;
    this.world.cube.twister.setup(this.current.scramble);
    this.trace = traceOpStickers(this.current.moves);
    this.coverage = opWindowCoverage(this.trace);
    try { this.focus = calculateOpFocus(this.trace); }
    catch (error) { this.focus = null; this.feedback = `观察窗口不可用：${(error as Error).message}`; }
  }
  saveSettings(): void {
    try {
      const { customOlls, ...settings } = this.settings;
      localStorage.setItem(SETTINGS, JSON.stringify(settings));
    } catch { /* Storage unavailable. */ }
  }
  changeZ2(): void {
    this.saveSettings();
    if (!this.current || !this.training) { this.nextCase(); return; }
    const previous = this.current;
    const pll = previous.pllFormula ? { name: `PLL-${previous.targetPll}`, origin: previous.pllFormula } : null;
    const oll = { name: previous.ollName, origin: previous.ollFormula };
    try {
      const next = validateOpCase(pll, oll, previous.y, simulate, this.settings.z2);
      this.training.replace(next);
      this.feedback = '';
      this.loadCase();
    } catch (error) {
      this.settings.z2 = !!previous.z2;
      this.saveSettings();
      this.feedback = `切换 z2 失败，已恢复原题：${(error as Error).message}`;
    }
  }
  nextCase(): void {
    if (!this.training) {
      try { this.training = new OpTraining(() => this.generate(), localStorage, Date.now); this.training.setHintsVisible(this.settings.showHints); this.feedback = ''; this.loadCase(); }
      catch (error) { this.feedback = (error as Error).message; }
      return;
    }
    try { this.training.next(); this.feedback = ''; this.loadCase(); }
    catch (error) { this.feedback = (error as Error).message; }
  }
  retry(): void { this.training?.retry(); this.feedback = ''; this.loadCase(); }
  resetVisualCube(): void { this.retry(); }
  toggleHints(): void {
    this.training?.setHintsVisible(this.settings.showHints);
    this.saveSettings();
  }
  answer(name: string): void {
    if (!this.training || this.training.readOnly || this.training.revealed) return;
    const correct = this.training.answer(name);
    this.feedback = correct ? `正确：${name}。可以播放 OLL 核验。` : `${name} 不正确，请再观察。`;
  }
  replay(record: OpRecord): void {
    this.training?.replay(record);
    this.settings.z2 = !!record.z2;
    this.saveSettings();
    this.feedback = '正在复盘，只查看题面，不计成绩';
    this.loadCase();
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
  openPicker(oll = false): void {
    this.ollPickerOpen = oll;
    this.ollPickerGroup = 'builtin';
    this.customError = this.settings.customOll && this.customFormula === this.settings.customOll ?
      '旧公式未通过校验，请修改后保存到自定义分组' : '';
    this.pickerOpen = true;
  }
  editCustomOll(item: CustomOll): void {
    this.customEditingId = item.id;
    this.customName = item.name;
    this.customFormula = item.origin;
    this.customError = '';
  }
  clearCustomEditor(): void {
    this.customEditingId = null;
    this.customName = '';
    this.customFormula = '';
    this.customError = '';
  }
  saveCustomOll(): void {
    const name = this.customName.trim(), origin = this.customFormula.trim();
    if (!name || name.length > 40) { this.customError = '请填写不超过 40 字的名称'; return; }
    if (this.settings.customOlls.some(item => item.name === name && item.id !== this.customEditingId)) {
      this.customError = '已有同名的自定义 OLL'; return;
    }
    const id = this.customEditingId || `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const item: CustomOll = { id, name, origin };
    try {
      validateOpCase(null, customOllItem(item), '', simulate);
      const preview = previewOllFacelets(customOllItem(item), simulate);
      const index = this.settings.customOlls.findIndex(entry => entry.id === id);
      const updated = this.settings.customOlls.slice();
      if (index >= 0) updated[index] = item;
      else updated.push(item);
      saveCustomOllLibrary(localStorage, updated);
      if (index >= 0) this.$set(this.settings.customOlls, index, item);
      else this.settings.customOlls.push(item);
      this.$set(this.ollPreviews, id, preview);
      this.settings.customOll = '';
      this.saveSettings();
      this.clearCustomEditor();
    } catch (error) { this.customError = `无法保存：${(error as Error).message}`; }
  }
  deleteCustomOll(id: string): void {
    const updated = this.settings.customOlls.filter(item => item.id !== id);
    try { saveCustomOllLibrary(localStorage, updated); }
    catch (error) { this.customError = `删除失败：${(error as Error).message}`; return; }
    this.settings.customOlls = updated;
    this.settings.ollNames = this.settings.ollNames.filter(name => name !== id);
    this.$delete(this.ollPreviews, id);
    if (this.customEditingId === id) this.clearCustomEditor();
    this.saveSettings();
  }
  toggleChoice(name: string): void {
    const list = this.ollPickerOpen ? this.settings.ollNames : this.settings.pllNames;
    const index = list.indexOf(name);
    if (index < 0) list.push(name); else list.splice(index, 1);
    this.saveSettings();
  }
  get currentOllGroupIds(): string[] {
    return this.ollPickerGroup === 'builtin' ? OLL.map(item => item.name) : this.settings.customOlls.map(item => item.id);
  }
  selectAllOlls(): void {
    this.settings.ollNames = [...new Set([...this.settings.ollNames, ...this.currentOllGroupIds])];
    this.saveSettings();
  }
  clearOllSelection(): void {
    const ids = new Set(this.currentOllGroupIds);
    this.settings.ollNames = this.settings.ollNames.filter(name => !ids.has(name));
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
