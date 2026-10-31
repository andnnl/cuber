import { isSolvedFacelets } from './pll-training';

export type FormulaCategory = 'f2l' | 'oll' | 'pll';
export type FormulaResult = 'success' | 'idle-failure' | 'interrupted';
export interface FormulaCase { id: string; category: FormulaCategory; name: string; formula: string; initialFacelets: string; scramble?: string }
export interface FormulaRecord extends FormulaCase { at: number; durationMs: number; result: FormulaResult }

export function isFormulaGoal(category: FormulaCategory, facelets: string): boolean {
  if (category !== 'oll') return isSolvedFacelets(facelets);
  if (!/^[URFDLB]{54}$/.test(facelets) || new Set([4, 13, 22, 31, 40, 49].map(i => facelets[i])).size !== 6) return false;
  if (facelets.slice(0, 9) !== facelets[4].repeat(9) || facelets.slice(27, 36) !== facelets[31].repeat(9)) return false;
  return [9, 18, 36, 45].every(base => facelets.slice(base + 3, base + 9) === facelets[base + 4].repeat(6));
}

export function recentMedian(records: FormulaRecord[], category: FormulaCategory, id: string): number | null {
  const times = records.filter(r => r.category === category && r.id === id && r.result === 'success')
    .sort((a, b) => b.at - a.at).slice(0, 5).map(r => r.durationMs).sort((a, b) => a - b);
  if (!times.length) return null;
  const mid = Math.floor(times.length / 2);
  return times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
}

export interface FormulaTimerClock {
  now(): number;
  schedule(fn: () => void, ms: number): number;
  cancel(id: number): void;
  requestFacelets(): Promise<void>;
  onResult(record: FormulaRecord): void;
}

export class FormulaTimer {
  current: FormulaCase | null = null;
  startedAt: number | null = null;
  lastMoveAt: number | null = null;
  private generation = 0;
  private lastSerial = 0;
  private startSerial = 0;
  private seenUnfinished = false;
  private baseline = '';
  private lastFreshFacelets = '';
  private job: number | null = null;

  constructor(private readonly clock: FormulaTimerClock) {}

  beginCase(item: FormulaCase): number {
    this.cancel();
    this.current = item;
    this.startedAt = null;
    this.lastMoveAt = null;
    this.startSerial = this.lastSerial;
    this.seenUnfinished = false;
    this.lastFreshFacelets = '';
    this.baseline = '';
    return this.generation;
  }

  move(at: number, serial?: number, recovered = false): boolean {
    if (!this.current || recovered || (serial !== undefined && serial > 0 && serial <= this.lastSerial)) return false;
    if (serial !== undefined && serial > 0) this.lastSerial = serial;
    if (this.startedAt === null) {
      this.startedAt = at;
      this.startSerial = serial && serial > 0 ? serial : 0;
      this.seenUnfinished = !!this.baseline && !isFormulaGoal(this.current.category, this.baseline);
    }
    this.lastMoveAt = at;
    this.clearJob();
    const generation = this.generation;
    this.job = this.clock.schedule(() => { void this.expire(generation, at); }, 1000);
    return true;
  }

  facelets(value: string, at: number, serial?: number): boolean {
    if (!this.current || !/^[URFDLB]{54}$/.test(value)) return false;
    if (serial !== undefined && serial > 0 && serial < this.startSerial) return false;
    if (this.startedAt === null) { this.baseline = value; return false; }
    this.lastFreshFacelets = value;
    if (!isFormulaGoal(this.current.category, value)) { this.seenUnfinished = true; return false; }
    if (!this.seenUnfinished) return false;
    this.finish('success', at);
    return true;
  }

  interrupt(at: number): void {
    if (this.current && this.startedAt !== null) this.finish('interrupted', at);
    else this.cancel();
  }

  cancel(): void {
    this.generation++;
    this.clearJob();
    this.current = null;
    this.startedAt = null;
    this.lastMoveAt = null;
    this.lastFreshFacelets = '';
  }

  dispose(): void { this.cancel(); }

  private clearJob(): void {
    if (this.job !== null) this.clock.cancel(this.job);
    this.job = null;
  }

  private async expire(generation: number, lastMoveAt: number): Promise<void> {
    if (generation !== this.generation || this.lastMoveAt !== lastMoveAt) return;
    this.job = null;
    try { await this.clock.requestFacelets(); }
    catch {
      if (generation === this.generation && this.lastMoveAt === lastMoveAt) this.finish('interrupted', this.clock.now());
      return;
    }
    if (generation !== this.generation || this.lastMoveAt !== lastMoveAt) return;
    this.job = this.clock.schedule(() => {
      if (generation !== this.generation || this.lastMoveAt !== lastMoveAt) return;
      this.finish(this.lastFreshFacelets ? 'idle-failure' : 'interrupted', lastMoveAt + 1000);
    }, 150);
  }

  private finish(result: FormulaResult, at: number): void {
    if (!this.current || this.startedAt === null) return;
    const record: FormulaRecord = { ...this.current, result, at, durationMs: Math.max(0, at - this.startedAt) };
    this.cancel();
    this.clock.onResult(record);
  }
}
