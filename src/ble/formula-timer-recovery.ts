import { applyFaceletMove } from './move-diff';

export interface RecoveredMove { move: string; at: number | null }
export interface RecoveryResult { status: 'ready' | 'pending' | 'recovered' | 'uncertain' | 'stale'; moves: RecoveredMove[]; tail: boolean }
const EMPTY: RecoveredMove[] = [];
const MOVES = ([] as string[]).concat(...'URFDLB'.split('').map(face => [face, `${face}'`, `${face}2`]));
const relation = (a: number, b: number): number => {
  const delta = ((a & 255) - (b & 255)) & 255;
  return delta === 0 ? 0 : delta < 128 ? delta : -1;
};
const distance = (a: number, b: number): number => ((a & 255) - (b & 255)) & 255;

/** 实体状态独立于随机题面；只有唯一的补步序列才能送往画面。 */
export class FormulaMoveRecovery {
  private baseline: string | null = null;
  private serial: number | null = null;
  private pending = new Map<number, RecoveredMove>();
  private gap = false;

  start(facelets: string | null, serial?: number): void {
    this.baseline = facelets && /^[URFDLB]{54}$/.test(facelets) ? facelets : null;
    this.serial = serial === undefined ? null : serial & 255;
    this.pending.clear();
    this.gap = false;
  }

  get needsState(): boolean { return this.gap; }
  get hasBaseline(): boolean { return this.baseline !== null && this.serial !== null; }

  move(move: string, serial?: number, at: number | null = null, recovered = false): RecoveryResult {
    if (MOVES.indexOf(move) < 0) return { status: 'stale', moves: EMPTY, tail: false };
    if (serial === undefined || this.serial === null || this.baseline === null) {
      if (recovered) return { status: 'stale', moves: EMPTY, tail: false };
      // 没有实体基线仍可实时跟随，但不能从完整状态猜测漏步。
      return { status: 'ready', moves: [{ move, at }], tail: false };
    }
    const key = serial & 255;
    if (relation(key, this.serial) <= 0 || this.pending.has(key)) return { status: 'stale', moves: EMPTY, tail: false };
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
      if (next) this.baseline = next;
      this.pending.delete(key);
      this.serial = key;
      moves.push(item);
    }
    this.gap = this.pending.size > 0;
    return { status: this.gap ? 'pending' : 'ready', moves, tail: false };
  }

  state(facelets: string, serial?: number): RecoveryResult {
    if (!this.hasBaseline || !/^[URFDLB]{54}$/.test(facelets))
      return { status: 'uncertain', moves: EMPTY, tail: false };
    const target = serial === undefined ? this.serial! : serial & 255;
    if (relation(target, this.serial!) < 0) return { status: 'stale', moves: EMPTY, tail: false };
    const count = distance(target, this.serial!);
    if ([...this.pending.keys()].some(key => relation(key, target) > 0))
      return { status: 'stale', moves: EMPTY, tail: false };
    if (count > 3)
      return { status: 'uncertain', moves: EMPTY, tail: false };
    const solutions: RecoveredMove[][] = [];
    const visit = (step: number, state: string, sequence: RecoveredMove[], unknown: number): void => {
      if (solutions.length > 1) return;
      if (step === count) {
        if (state === facelets) solutions.push(sequence);
        return;
      }
      const key = (this.serial! + step + 1) & 255;
      const known = this.pending.get(key);
      const candidates = known ? [known] : MOVES.map(move => ({ move, at: null }));
      if (!known && unknown >= 2) return;
      for (const candidate of candidates) {
        const next = applyFaceletMove(state, candidate.move);
        if (next) visit(step + 1, next, [...sequence, candidate], unknown + (known ? 0 : 1));
        if (solutions.length > 1) return;
      }
    };
    visit(0, this.baseline!, [], 0);
    if (solutions.length !== 1) return { status: 'uncertain', moves: EMPTY, tail: false };
    const moves = solutions[0];
    const tail = moves.length > 0 && moves[moves.length - 1].at === null;
    this.baseline = facelets;
    this.serial = target;
    this.pending.clear();
    this.gap = false;
    return { status: moves.some(item => item.at === null) ? 'recovered' : 'ready', moves, tail };
  }
}
