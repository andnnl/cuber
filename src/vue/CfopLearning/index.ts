import {Component, Inject, Provide, Ref, Vue} from 'vue-property-decorator';
import World from '../../cuber/world';
import CubeGroup from '../../cuber/group';
import Cubelet from '../../cuber/cubelet';
import {COLORS} from '../../cuber/define';
import tweener from '../../cuber/tweener';
import {PreferanceData, PaletteData, PRESET_PALETTES} from '../../data';
import {CubeSession, SessionSnapshot} from '../../ble/cube-session';
import {LinkEvent} from '../../ble/types';
import {FACELET_TARGETS, paintCubeVisibility} from '../BleCrossTrainer/visibility';
import {HIGHLIGHT_COLORS, clearAllHighlights, highlightPiece, tickHighlights} from '../CrossF2LTrainer/highlight';
import Viewport from '../Viewport';
import Setting from '../Setting';
import {CfopClient} from '../../wasm/CfopClient';
import {buildRoute, CfopFrame, CfopRoute, CfopStage} from './route';
import {mapStep, orientationAt} from './notation';
import {confirmView, FollowState, pauseFollow, reduceFollow, startFollow} from './follow';
import {CFOP_THEME_CSS} from './theme';
import {findSlotPieces, trackedSlots, trackingGroupNumber} from './tracking';
import {hasInitialZ2, relabelZ2Colors} from './frame-colors';
import {normalizeCfopScramble} from './scramble';
import {visiblePieceSignatures} from './visibility-targets';

interface Candidate {target?: string; moves: string[]; completed_slots?: string[]; segments?: CfopStage['segments'];}
const DEFAULT_ACTIONS = ['U', "U'", 'U2', 'D', "D'", 'D2', 'R', "R'", 'R2', 'L', "L'", 'L2',
  'F', "F'", 'F2', 'y', "y'"];
const OPTIONAL_ACTIONS = ['S', "S'"];
const FACELET_POSITIONS = FACELET_TARGETS.map(([position]) => position);

@Component({template: require('./index.html'), components: {viewport: Viewport, setting: Setting}})
export default class CfopLearning extends Vue {
  @Inject('cubeSession') session: CubeSession;
  @Inject('isFollowing') isFollowing: () => boolean;
  @Provide('world') world = new World();
  @Provide('preferance') preferance = new PreferanceData(this.world);
  @Provide('palette') palette = new PaletteData(this.world);
  @Ref('viewport') viewport: Viewport;

  input = "R U R' F U F'";
  mode = 'AUTO';
  startDepth = 11;
  stageDepth = 12;
  fullDepth = 30;
  perSlot = 3;
  timeLimit = 45;
  allowedActions = DEFAULT_ACTIONS.slice();
  availableActions = DEFAULT_ACTIONS.concat(OPTIONAL_ACTIONS);
  speed = 700;
  autoCross = false;
  autoF2l = false;
  bottomColorZ2 = false;
  ghost = false;
  hideUnrelated = false;
  snapshot: SessionSnapshot = {status:'disconnected', deviceName:'', battery:null,
    facelets:null, lastMoveSerial:null, generation:0, disconnectSource:null, error:''};
  route: CfopRoute | null = null;
  stages: CfopStage[] = [];
  options: Candidate[] = [];
  cursor = 0;
  busy = false;
  playing = false;
  stepping = false;
  status = '';
  error = '';
  follow: FollowState | null = null;
  needsFacelets = false;
  private client = new CfopClient();
  private generation = 0;
  private animationVersion = 0;
  private viewFrame: number | null = null;
  private appActive = true;
  private baseSceneY = this.world.scene.rotation.y;
  private frameResolver: ((facelets: string) => void) | null = null;
  private frameRejecter: ((error: Error) => void) | null = null;
  private frameGeneration = 0;
  private frameRequestVersion = 0;
  private frameSerial: number | null = null;
  private receivedFrameSerial: number | null = null;
  private cancelAnimation: (() => void) | null = null;
  private previousColors: {[face: string]: string} | null = null;

  private applyStandardColors(): void {
    if (this.previousColors) return;
    this.previousColors = {};
    for (const face of ['U', 'D', 'F', 'B', 'R', 'L']) {
      this.previousColors[face] = COLORS[face];
      const color = PRESET_PALETTES['默认'][face];
      COLORS[face] = color;
      Cubelet.LAMBERS[face].color.set(color);
      Cubelet.BASICS[face].color.set(color);
    }
    this.world.dirty = true;
  }

  private restoreColors(): void {
    if (!this.previousColors) return;
    for (const face of Object.keys(this.previousColors)) {
      const color = this.previousColors[face];
      COLORS[face] = color;
      Cubelet.LAMBERS[face].color.set(color);
      Cubelet.BASICS[face].color.set(color);
    }
    this.previousColors = null;
    // 其他界面（或设置面板）可能在本页停留期间保存了新配色；
    // 恢复当前持久化选择，而非始终停留在进入 CFOP 时的快照。
    try {
      if (window.localStorage.getItem('palette')) {
        this.palette.load();
        this.palette.refresh();
      }
    } catch { /* 无存储权限时保留进入页面前的配色 */ }
  }

  mounted(): void {
    this.autoCross = window.localStorage.getItem('cfopAutoCross') === '1';
    this.autoF2l = window.localStorage.getItem('cfopAutoF2l') === '1';
    try { this.bottomColorZ2 = window.localStorage.getItem('cfopBottomColorZ2') === '1'; }
    catch { this.bottomColorZ2 = false; }
    if (!document.getElementById('cfop-learning-theme')) {
      const style = document.createElement('style');
      style.id = 'cfop-learning-theme';
      style.textContent = CFOP_THEME_CSS;
      document.head.appendChild(style);
    }
    this.snapshot = this.session.snapshot;
    this.$nextTick(() => {
      this.preferance.refresh();
      this.palette.refresh();
      this.applyStandardColors();
      this.resize();
      this.drawLoop();
    });
  }

  beforeDestroy(): void { this.onAppDeactivate(); this.client.dispose(); }
  onAppDeactivate(): void {
    this.appActive = false;
    this.restoreColors();
    ++this.frameRequestVersion;
    this.cancelSearch();
    this.stopPlayback();
    this.rejectFrame(new Error('已离开 CFOP 学习页'));
    this.follow = null;
    clearAllHighlights(this.world);
    paintCubeVisibility(this.world, null, false, false, false);
    if (this.viewFrame !== null) cancelAnimationFrame(this.viewFrame);
    this.viewFrame = null;
  }
  onAppActivate(): void {
    if (this.appActive) return;
    this.appActive = true;
    this.applyStandardColors();
    this.snapshot = this.session.snapshot;
    this.resize();
    this.drawLoop();
  }
  onSessionSnapshot(snapshot: SessionSnapshot): void {
    if (this.frameResolver && (snapshot.status !== 'connected' || snapshot.generation !== this.frameGeneration))
      this.rejectFrame(new Error('蓝牙连接已变化，请重新读取实体状态'));
    if (this.follow && (snapshot.status !== 'connected' || snapshot.generation !== this.follow.generation)) {
      this.follow = {...this.follow, status:'blocked', reason:'蓝牙会话已变化，请重新读取实体状态'};
    }
    this.snapshot = snapshot;
  }
  onPhysicalFollowChanged(enabled: boolean): void {
    if (!enabled) this.stopTraining();
  }
  handlePhysicalEvent(event: LinkEvent): void {
    if (event.type === 'facelets') {
      if (this.frameResolver) {
        if (typeof event.serial === 'number' && this.frameSerial !== null && event.serial < this.frameSerial) return;
        const resolve = this.frameResolver;
        this.frameResolver = null;
        this.frameRejecter = null;
        this.needsFacelets = false;
        this.receivedFrameSerial = this.session.snapshot.lastMoveSerial;
        resolve(event.facelets);
      } else if (this.follow && this.follow.status !== 'blocked' &&
          (typeof event.serial !== 'number' || this.follow.lastSerial === null || event.serial >= this.follow.lastSerial) &&
          event.facelets !== this.follow.actual) {
        this.follow = pauseFollow(this.follow, '实体状态与转动账本不符，请重新同步');
      }
      return;
    }
    if (event.type !== 'move') return;
    if (this.frameResolver && !event.recovered) this.rejectFrame(new Error('读取实体状态时魔方发生转动，请重试'));
    if (!this.follow) return;
    this.follow = reduceFollow(this.follow, event);
    if (this.follow.actual && /^[URFDLB]{54}$/.test(this.follow.actual)) this.paintFrame(this.follow.actual);
    this.cursor = this.follow.cursor;
    this.refreshTracking();
  }

  private rejectFrame(error: Error): void {
    this.frameRejecter?.(error);
    this.frameResolver = null;
    this.frameRejecter = null;
    this.needsFacelets = false;
    this.frameSerial = null;
    this.receivedFrameSerial = null;
  }
  private async fetchPhysical(): Promise<string> {
    if (this.snapshot.status !== 'connected') throw new Error('请先连接蓝牙魔方');
    this.rejectFrame(new Error('读取已被新请求取代'));
    const requestVersion = ++this.frameRequestVersion;
    const generation = this.session.snapshot.generation;
    this.frameGeneration = generation;
    this.frameSerial = this.session.snapshot.lastMoveSerial;
    this.receivedFrameSerial = null;
    this.needsFacelets = true;
    let timer: number | undefined;
    const event = new Promise<string>((resolve, reject) => {
      this.frameResolver = resolve;
      this.frameRejecter = reject;
    });
    const resolver = this.frameResolver;
    try {
      const command = this.session.requestFacelets().then(() => new Promise<string>(() => undefined));
      const state = await Promise.race([event, command, new Promise<string>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('等待实体魔方状态超时')), 4500);
      })]);
      if (!this.appActive || requestVersion !== this.frameRequestVersion ||
          this.session.snapshot.status !== 'connected' ||
          this.session.snapshot.generation !== generation) throw new Error('蓝牙连接已变化，请重新读取');
      if (this.receivedFrameSerial !== this.session.snapshot.lastMoveSerial)
        throw new Error('读取实体状态后魔方发生转动，请重试');
      return state;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (this.frameResolver === resolver || !this.frameResolver) {
        this.frameResolver = null;
        this.frameRejecter = null;
        this.needsFacelets = false;
        this.frameSerial = null;
        this.receivedFrameSerial = null;
      }
    }
  }
  async readPhysicalStart(): Promise<void> {
    try {
      const state = await this.fetchPhysical();
      if (!this.appActive) return;
      this.input = state;
      this.invalidate();
      this.status = '已读取实体魔方，按此状态搜索首阶段';
    } catch (error) { if (this.appActive) this.error = String(error); }
  }

  invalidate(): void {
    this.cancelSearch();
    this.stopPlayback();
    this.follow = null;
    this.route = null;
    clearAllHighlights(this.world);
    paintCubeVisibility(this.world, null, false, false, false);
    this.stages = [];
    this.options = [];
    this.cursor = 0;
    this.status = '';
    this.error = '';
  }
  saveAutoOptions(): void {
    window.localStorage.setItem('cfopAutoCross', this.autoCross ? '1' : '0');
    window.localStorage.setItem('cfopAutoF2l', this.autoF2l ? '1' : '0');
  }
  saveBottomColorZ2(): void {
    try { window.localStorage.setItem('cfopBottomColorZ2', this.bottomColorZ2 ? '1' : '0'); }
    catch { /* 无法持久化时，当前页面的选择仍可用于打乱。 */ }
  }
  newScramble(): void {
    this.invalidate();
    const scramble = this.world.cube.twister.scrambler();
    const input = this.bottomColorZ2 ? `${scramble} z2` : scramble;
    this.input = input;
    this.world.cube.twister.setup(input);
    this.world.scene.rotation.y = this.baseSceneY;
    this.world.scene.updateMatrix();
    this.world.dirty = true;
    this.status = '已随机打乱，点击“搜索首阶段”生成解法';
    if (this.autoCross) void this.runAutoCross();
  }
  applyInputScramble(): void {
    let input: string;
    try { input = normalizeCfopScramble(this.input); }
    catch (error) { this.error = String(error); return; }
    this.invalidate();
    this.input = input;
    if (/^[URFDLB]{54}$/.test(input)) this.paintFrame(input);
    else this.world.cube.twister.setup(input);
    this.world.scene.rotation.y = this.baseSceneY;
    this.world.scene.updateMatrix();
    this.world.dirty = true;
    this.status = '已按公式打乱，点击“搜索首阶段”生成解法';
    if (this.autoCross) void this.runAutoCross();
  }
  private async runAutoCross(): Promise<void> {
    const pending = this.searchStart();
    const request = this.generation;
    await pending;
    if (request !== this.generation || !this.autoCross || !this.options.length) return;
    await this.choose(this.options[0]);
  }
  private async runAutoF2l(): Promise<void> {
    const selectedRoute = this.route;
    const selectedStages = this.stages;
    const pending = this.searchFull();
    const request = this.generation;
    await pending;
    if (request !== this.generation || !this.autoF2l || this.route !== selectedRoute ||
        this.stages !== selectedStages || this.options[0]?.target !== 'F2L 全段') return;
    await this.choose(this.options[0]);
  }
  cancelSearch(): void {
    ++this.generation;
    this.client.cancel();
    this.busy = false;
  }
  private async search<T>(operation: string, payload: Record<string, any>): Promise<T | null> {
    this.cancelSearch();
    const id = this.generation;
    this.busy = true;
    this.error = '';
    this.status = '搜索中，可取消…';
    try {
      const result = await this.client.search<T>(operation, {input:this.input.trim(), ...payload}, this.timeLimit * 1000);
      return this.appActive && id === this.generation ? result : null;
    } catch (error) {
      if (id === this.generation) { this.error = String(error); this.status = ''; }
      return null;
    } finally { if (id === this.generation) this.busy = false; }
  }
  async searchStart(): Promise<void> {
    this.invalidate();
    const result = await this.search<Candidate[]>('start', {mode:this.mode, maxSolutions:5, maxDepth:this.startDepth});
    if (!result) return;
    this.options = result.map(candidate => ({...candidate, target:'Cross'}));
    this.status = result.length ? '选择首阶段候选' : '本步数上限内未找到首阶段候选';
  }
  async searchStages(): Promise<void> {
    if (!this.stages.length) return;
    const prefix = this.stages.reduce((moves, stage) => moves.concat(stage.moves), [] as string[]);
    const result = await this.search<any[]>('stages', {prefix, maxDepth:this.stageDepth, perSlot:this.perSlot});
    if (!result) return;
    this.options = result.reduce((all:Candidate[], stage:any) => all.concat(
      (stage.candidates || []).map((candidate:Candidate) => ({...candidate, target:stage.target}))), []);
    if (!this.options.length) {
      const verified = await this.search<{complete:boolean}>('verify', {prefix});
      this.status = verified?.complete ? 'Cross＋四组 F2L 已完成' : '当前上限内无候选，可提高每组步数重试';
    } else this.status = '选择下一组 F2L 候选';
  }
  async searchFull(): Promise<void> {
    if (!this.stages.length) return;
    const prefix = this.stages.reduce((moves, stage) => moves.concat(stage.moves), [] as string[]);
    const result = await this.search<any>('full', {prefix, maxDepth:this.fullDepth, allowedActions:this.allowedActions});
    if (!result) return;
    const candidates = Array.isArray(result) ? result : result.candidates ? result.candidates : [result];
    this.options = candidates.filter((item:any) => item && Array.isArray(item.moves))
      .map((item:any) => ({...item, target:'F2L 全段'}));
    this.status = this.options.length ? '选择一键逐槽位候选（不保证全程最短）' : '当前搜索上限内无候选';
  }
  backStage(): void {
    if (!this.stages.length) return;
    this.cancelSearch();
    this.stopPlayback();
    this.stages = this.stages.slice(0, -1);
    this.options = [];
    this.follow = null;
    void (this.stages.length ? this.refreshRoute().then(() => this.searchStages()) : this.searchStart());
  }
  async choose(option: Candidate): Promise<void> {
    this.cancelSearch();
    this.stages = this.stages.concat([{target:option.target || 'Cross', moves:option.moves, segments:option.segments}]);
    this.options = [];
    if (!await this.refreshRoute()) return;
    if (option.target !== 'F2L 全段') {
      if (this.autoF2l && this.stages.length === 1) void this.runAutoF2l();
      else void this.searchStages();
    }
  }
  private async refreshRoute(): Promise<boolean> {
    this.stopPlayback();
    const id = ++this.generation;
    const moves = this.stages.reduce((all, stage) => all.concat(stage.moves), [] as string[]);
    try {
      const frames = await this.client.timeline<CfopFrame[]>(this.input.trim(), moves);
      if (id !== this.generation || !this.appActive) return false;
      const physicalFrames = hasInitialZ2(this.input)
        ? frames.map(frame => ({...frame, facelets:relabelZ2Colors(frame.facelets)})) : frames;
      this.route = buildRoute(this.input.trim(), this.stages, physicalFrames);
      this.follow = null;
      this.seek(0);
      this.status = `当前路线 ${moves.length} 个动作`;
      return true;
    } catch (error) { if (id === this.generation) this.error = String(error); return false; }
  }

  private paintFrame(facelets: string): void {
    tweener.finish();
    clearAllHighlights(this.world);
    const cube = this.world.cube;
    cube.reset();
    cube.history.clear();
    for (let i = 0; i < 54; i++) cube.stick(FACELET_TARGETS[i][0], FACELET_TARGETS[i][1], facelets[i]);
    cube.dirty = true;
  }
  get tracking(): {current:string | null; next:string | null} {
    return this.route ? trackedSlots(this.route, this.cursor) : {current:null, next:null};
  }
  trackingColor(slot: string): number {
    const group = this.route ? trackingGroupNumber(this.route, slot) : 0;
    return group % 2 === 1 ? HIGHLIGHT_COLORS.target : HIGHLIGHT_COLORS.predict;
  }
  trackingColorCss(slot: string): string {
    return `#${(`000000${this.trackingColor(slot).toString(16)}`).slice(-6)}`;
  }
  private refreshTracking(): void {
    clearAllHighlights(this.world);
    if (!this.route) {
      paintCubeVisibility(this.world, null, false, false, false);
      return;
    }
    const needed = visiblePieceSignatures(this.route, this.cursor, FACELET_POSITIONS);
    paintCubeVisibility(this.world, needed, this.ghost, this.hideUnrelated, false);
    const physicalFacelets = this.world.cube.serialize();
    const facelets = hasInitialZ2(this.route.input) ? relabelZ2Colors(physicalFacelets) : physicalFacelets;
    const {current, next} = this.tracking;
    for (const slot of [next, current]) {
      if (!slot) continue;
      const color = this.trackingColor(slot);
      const positions = findSlotPieces(facelets, FACELET_POSITIONS, slot);
      if (!positions) continue;
      for (const position of [positions.cornerIndex, positions.edgeIndex]) {
        const piece = this.world.cube.cubelets[position];
        const identity = this.world.cube.initials.indexOf(piece);
        if (identity >= 0) highlightPiece(this.world, identity, color);
      }
    }
  }
  private orient(cursor: number): void {
    if (!this.route) return;
    this.world.scene.rotation.y = this.baseSceneY + orientationAt(this.route.moves, cursor) * Math.PI / 2;
    this.world.scene.updateMatrix();
    this.world.dirty = true;
  }
  seek(index: number): void {
    if (!this.route || this.follow) return;
    this.stopPlayback();
    this.cursor = Math.max(0, Math.min(this.route.moves.length, index));
    this.paintFrame(this.route.frames[this.cursor].facelets);
    this.orient(this.cursor);
    this.refreshTracking();
  }
  private stopPlayback(): void {
    ++this.animationVersion;
    this.playing = false;
    this.cancelAnimation?.();
    tweener.finish();
  }
  private animateViewTurn(move: string): Promise<void> {
    const begin = this.world.scene.rotation.y;
    const end = begin + (move === 'y' ? Math.PI / 2 : -Math.PI / 2);
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (this.cancelAnimation === finish) this.cancelAnimation = null;
        resolve();
      };
      this.cancelAnimation = finish;
      tweener.tween(begin, end, Math.max(12, CubeGroup.frames), (value: number) => {
        this.world.scene.rotation.y = value;
        this.world.scene.updateMatrix();
        this.world.dirty = true;
        if (value === end) finish();
        return value === end;
      });
    });
  }
  async next(): Promise<void> {
    if (!this.route || this.follow || this.stepping || this.cursor >= this.route.moves.length) return;
    this.stepping = true;
    const version = this.animationVersion;
    const route = this.route;
    const step = mapStep(this.route.moves[this.cursor], orientationAt(this.route.moves, this.cursor));
    try {
      if (step.viewTurn) {
        await this.animateViewTurn(step.viewTurn);
        if (version !== this.animationVersion || this.route !== route) return;
        this.cursor++;
        this.refreshTracking();
        return;
      }
      const action = step.physicalMove!;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let timer: number;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const i = this.world.callbacks.indexOf(callback);
          if (i >= 0) this.world.callbacks.splice(i, 1);
          if (this.cancelAnimation === cancel) this.cancelAnimation = null;
          if (error) reject(error); else resolve();
        };
        const cancel = () => finish(new Error('播放已取消'));
        const callback = () => {
          finish();
        };
        timer = window.setTimeout(() => finish(new Error('3D 动画超时')), 2500);
        this.cancelAnimation = cancel;
        this.world.callbacks.push(callback);
        this.world.cube.twister.push(action);
      });
      if (version !== this.animationVersion || this.route !== route) return;
      const expected = route.frames[this.cursor + 1].facelets;
      if (this.world.cube.serialize() !== expected) {
        // Rust 的 S 切片验证帧固定中心，3D 引擎的实体切片会连中心一同旋转；
        // 动画结束后以 WASM 验证帧为准，后续步骤仍从同一个确定状态继续。
        if (route.moves[this.cursor][0] !== 'S') throw new Error(`3D 动作 ${action} 与求解状态不一致`);
        this.paintFrame(expected);
      }
      this.cursor++;
      this.refreshTracking();
    } catch (error) {
      if (version !== this.animationVersion || this.route !== route) return;
      this.stopPlayback();
      this.error = String(error);
      if (this.route) this.paintFrame(this.route.frames[this.cursor].facelets);
      this.refreshTracking();
    } finally { this.stepping = false; }
  }
  async togglePlay(): Promise<void> {
    if (this.playing) {
      this.stopPlayback();
      if (this.route && !this.follow) {
        this.paintFrame(this.route.frames[this.cursor].facelets);
        this.orient(this.cursor);
        this.refreshTracking();
      }
      return;
    }
    if (!this.route || this.follow) return;
    this.playing = true;
    const version = this.animationVersion;
    while (this.playing && version === this.animationVersion && this.route && this.cursor < this.route.moves.length) {
      const before = this.cursor;
      await this.next();
      if (this.cursor === before) break;
      if (this.playing) await new Promise(resolve => window.setTimeout(resolve, this.speed));
    }
    if (version === this.animationVersion) this.playing = false;
  }
  async startTraining(): Promise<void> {
    if (!this.route) return;
    if (!this.isFollowing()) { this.error = '请先打开“跟随实体魔方”'; return; }
    if (this.route.moves.some(move => move[0] === 'S')) {
      this.error = '当前路线含切片动作，设备不能逐步验证，请选择其他路线用于蓝牙跟练';
      return;
    }
    this.stopPlayback();
    try {
      const route = this.route;
      const actual = await this.fetchPhysical();
      if (!this.appActive || this.route !== route || !this.isFollowing()) return;
      this.follow = startFollow(route, {...this.session.snapshot, facelets:actual});
      if (this.follow.status === 'blocked') this.error = this.follow.reason || '起点不匹配';
      else {this.cursor = 0; this.paintFrame(actual); this.orient(0); this.refreshTracking(); this.error = '';}
    } catch (error) {if (this.appActive) this.error = String(error);}
  }
  stopTraining(): void {this.follow = null;}
  confirmOrientation(): void {
    if (!this.follow) return;
    try {this.follow = confirmView(this.follow); this.cursor = this.follow.cursor; this.orient(this.cursor); this.refreshTracking();}
    catch (error) {this.error = String(error);}
  }
  async rescanFromPhysical(): Promise<void> {
    this.stopTraining();
    await this.readPhysicalStart();
    if (/^[URFDLB]{54}$/.test(this.input)) await this.searchStart();
  }
  resetVisualCube(): void {this.stopTraining(); this.seek(0);}
  resize(): void {
    if (!this.viewport) return;
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    this.viewport.resize(width, height * (width <= 600 ? .42 : .49));
  }
  private drawLoop(): void {
    if (!this.appActive) return;
    this.viewFrame = requestAnimationFrame(() => this.drawLoop());
    tickHighlights();
    this.viewport?.draw();
  }
}
