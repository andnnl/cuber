import { applyFaceletMove } from './move-diff';

export interface RecoveredMove { move: string; at: number | null }
export interface RecoveryResult { status: 'ready' | 'pending' | 'recovered' | 'uncertain' | 'stale' | 'confirm'; moves: RecoveredMove[]; tail: boolean }
const EMPTY: RecoveredMove[] = [];
const MOVES = ([] as string[]).concat(...'URFDLB'.split('').map(face => [face, `${face}'`, `${face}2`]));
const QUARTER_MOVES = MOVES.filter(move => !move.endsWith('2'));
const MAX_WINDOW = 32;
const MAX_UNKNOWN = 2;
const AXES: { [face: string]: string } = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' };
const relation = (a: number, b: number): number => {
  const delta = ((a & 255) - (b & 255)) & 255;
  return delta === 0 ? 0 : delta < 128 ? delta : -1;
};
const distance = (a: number, b: number): number => ((a & 255) - (b & 255)) & 255;

function equivalentSequence(moves: RecoveredMove[]): string {
  const blocks: string[] = [];
  let axis = '';
  let block: string[] = [];
  for (const item of moves) {
    const nextAxis = AXES[item.move[0]];
    if (axis && axis !== nextAxis) {
      blocks.push(block.sort().join(','));
      block = [];
    }
    axis = nextAxis;
    block.push(`${item.move}@${item.at === null ? '?' : item.at}`);
  }
  if (block.length) blocks.push(block.sort().join(','));
  return blocks.join('|');
}

/** 实体状态独立于随机题面；只有唯一的补步等价类才能送往画面。 */
export class FormulaMoveRecovery {
  private baseline: string | null = null;
  private serial: number | null = null;
  private pending = new Map<number, RecoveredMove>();
  private gap = false;
  private unsequencedFacelets = false;
  private recentStates: string[] = [];
  private revision = 0;
  private confirmation: { facelets: string; request: number; revision: number; attempts: number } | null = null;
  private reanchorSerial = false;

  start(facelets: string | null, serial?: number): void {
    this.baseline = facelets && /^[URFDLB]{54}$/.test(facelets) ? facelets : null;
    // Gen3/Gen4 的 FACELETS 常驻 s=0，并非 MOVE 序号；不能据此推断首步断档。
    this.unsequencedFacelets = serial !== undefined && (serial & 255) === 0;
    this.serial = serial === undefined || this.unsequencedFacelets ? null : serial & 255;
    this.pending.clear();
    this.gap = false;
    this.recentStates = [];
    this.revision++;
    this.confirmation = null;
    this.reanchorSerial = false;
  }

  get needsState(): boolean { return this.gap; }
  get hasBaseline(): boolean { return this.baseline !== null && this.serial !== null; }

  canContinue(serial?: number | null): boolean {
    return this.baseline !== null && !this.gap &&
      (serial === undefined || serial === null || (serial & 255) === this.serial);
  }

  move(move: string, serial?: number, at: number | null = null, recovered = false): RecoveryResult {
    if (MOVES.indexOf(move) < 0) return { status: 'stale', moves: EMPTY, tail: false };
    if (this.reanchorSerial && recovered) return { status: 'stale', moves: EMPTY, tail: false };
    if (this.reanchorSerial && serial !== undefined && this.serial !== null && relation(serial, this.serial) > 0) {
      this.serial = (serial - 1) & 255;
      this.reanchorSerial = false;
    }
    if (this.unsequencedFacelets && this.serial === null && this.baseline && serial !== undefined && !recovered)
      this.serial = (serial - 1) & 255; // 首条实时 MOVE 是状态帧之后的第一步。
    if (serial === undefined || this.serial === null || this.baseline === null) {
      if (recovered) return { status: 'stale', moves: EMPTY, tail: false };
      this.revision++;
      this.confirmation = null;
      // 没有实体基线仍可实时跟随，但不能从完整状态猜测漏步。
      return { status: 'ready', moves: [{ move, at }], tail: false };
    }
    const key = serial & 255;
    if (relation(key, this.serial) <= 0 || this.pending.has(key)) return { status: 'stale', moves: EMPTY, tail: false };
    this.revision++;
    this.confirmation = null;
    this.pending.set(key, { move, at });
    if (this.gap || distance(key, this.serial) !== 1) {
      this.gap = true;
      if (recovered) return this.flushKnown();
      return { status: 'pending', moves: EMPTY, tail: false };
    }
    return this.flushKnown();
  }

  private flushKnown(): RecoveryResult {
    const moves: RecoveredMove[] = [];
    while (this.serial !== null && this.pending.has((this.serial + 1) & 255)) {
      const key = (this.serial + 1) & 255;
      const item = this.pending.get(key)!;
      const next = this.baseline && applyFaceletMove(this.baseline, item.move);
      if (this.baseline && !next) return { status: 'uncertain', moves: EMPTY, tail: false };
      if (next) {
        this.rememberState(this.baseline!);
        this.baseline = next;
      }
      this.pending.delete(key);
      this.serial = key;
      moves.push(item);
    }
    this.gap = this.pending.size > 0;
    return { status: this.gap ? 'pending' : 'ready', moves, tail: false };
  }

  state(facelets: string, serial?: number, request?: number): RecoveryResult {
    if (!this.hasBaseline || !/^[URFDLB]{54}$/.test(facelets))
      return { status: 'uncertain', moves: EMPTY, tail: false };
    if (this.unsequencedFacelets && (facelets !== this.baseline || this.pending.size > 0)) {
      if (request === undefined) {
        if (this.recentStates.indexOf(facelets) >= 0)
          return { status: 'stale', moves: EMPTY, tail: false };
      } else {
        const previous = this.confirmation?.revision === this.revision ? this.confirmation : null;
        if (previous && request <= previous.request)
          return { status: 'confirm', moves: EMPTY, tail: false };
        if (!previous || previous.facelets !== facelets) {
          const attempts = previous ? previous.attempts + 1 : 1;
          if (attempts >= 3) return { status: 'uncertain', moves: EMPTY, tail: false };
          this.confirmation = { facelets, request, revision: this.revision, attempts };
          return { status: 'confirm', moves: EMPTY, tail: false };
        }
      }
    }
    // 部分设备的状态帧固定回报 0；使用已收到的最大 MOVE 序号核验缺口，
    // 而不是把 0 当成旧状态或序号回绕。
    const target = this.unsequencedFacelets
      ? this.pending.size
        ? [...this.pending.keys()].reduce((latest, key) => relation(key, latest) > 0 ? key : latest, this.serial!)
        : this.serial!
      : serial === undefined ? this.serial! : serial & 255;
    if (relation(target, this.serial!) < 0) return { status: 'stale', moves: EMPTY, tail: false };
    const count = distance(target, this.serial!);
    if ([...this.pending.keys()].some(key => relation(key, target) > 0))
      return { status: 'stale', moves: EMPTY, tail: false };
    if (count > MAX_WINDOW)
      return { status: 'uncertain', moves: EMPTY, tail: false };
    let moves: RecoveredMove[] | null = null;
    let recoveredCount = count;
    const maxCount = this.unsequencedFacelets ? Math.min(MAX_WINDOW, count + MAX_UNKNOWN) : count;
    for (let length = count; length <= maxCount; length++) {
      if (length - this.pending.size > MAX_UNKNOWN) break;
      const solutions = new Map<string, RecoveredMove[]>();
      const visit = (step: number, state: string, sequence: RecoveredMove[], unknown: number): void => {
        if (solutions.size > 1) return;
        if (step === length) {
          if (state === facelets) {
            const signature = equivalentSequence(sequence);
            if (!solutions.has(signature)) solutions.set(signature, sequence);
          }
          return;
        }
        const key = (this.serial! + step + 1) & 255;
        const known = this.pending.get(key);
        if (!known && unknown >= MAX_UNKNOWN) return;
        const candidates = known ? [known] : (this.unsequencedFacelets ? QUARTER_MOVES : MOVES)
          .map(move => ({ move, at: null }));
        for (const candidate of candidates) {
          const next = applyFaceletMove(state, candidate.move);
          if (next) visit(step + 1, next, [...sequence, candidate], unknown + (known ? 0 : 1));
          if (solutions.size > 1) return;
        }
      };
      visit(0, this.baseline!, [], 0);
      if (solutions.size > 1) return { status: 'uncertain', moves: EMPTY, tail: false };
      if (solutions.size === 1) {
        moves = solutions.values().next().value!;
        recoveredCount = length;
        break;
      }
    }
    if (!moves) return { status: 'uncertain', moves: EMPTY, tail: false };
    const tail = moves.length > 0 && moves[moves.length - 1].at === null;
    if (this.baseline !== facelets) this.rememberState(this.baseline!);
    this.baseline = facelets;
    this.serial = target;
    if (this.unsequencedFacelets && recoveredCount > count) this.reanchorSerial = true;
    this.pending.clear();
    this.gap = false;
    this.revision++;
    this.confirmation = null;
    return { status: moves.some(item => item.at === null) ? 'recovered' : 'ready', moves, tail };
  }

  private rememberState(state: string): void {
    this.recentStates.push(state);
    // 请求状态会穿插在连续通知中；设备可能在数十步后才回送旧快照。
    // MOVE 序号仅有 8 位，保留半个窗口即可覆盖可比较的旧状态，不让其误报断档。
    if (this.recentStates.length > 128) this.recentStates.shift();
  }
}
