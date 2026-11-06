import { isSolvedFacelets } from './pll-training';
import { AdvancedF2LSlot, isAdvancedF2LGoal } from './formula-timer-goal';

export type FormulaCategory = 'f2l' | 'advf2l' | 'oll' | 'pll';
export type FormulaResult = 'success' | 'idle-failure' | 'interrupted';
export interface FormulaCase { id: string; category: FormulaCategory; name: string; formula: string; initialFacelets: string; scramble?: string; targetSlot?: AdvancedF2LSlot }
export interface FormulaRecord extends FormulaCase { at: number; durationMs: number; reactionMs?: number; moveCount?: number; result: FormulaResult }

export function isFormulaGoal(category: FormulaCategory, facelets: string, context?: FormulaCase): boolean {
  if (category === 'advf2l') return isAdvancedF2LGoal(facelets, context);
  if (category === 'pll') return isSolvedFacelets(facelets);
  if (category === 'f2l') {
    // 当前中心色为基准：D 面含十字与底角，四侧面下两排覆盖四组 F2L 槽位。
    // 顶层可未还原，且 z2 后 D 中心不一定是字母 D。
    if (!/^[URFDLB]{54}$/.test(facelets) ||
      new Set([4, 13, 22, 31, 40, 49].map(i => facelets[i])).size !== 6) return false;
    if (facelets.slice(27, 36) !== facelets[31].repeat(9)) return false;
    return [9, 18, 36, 45].every(base =>
      facelets.slice(base + 3, base + 9) === facelets[base + 4].repeat(6));
  }
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
  onResult(record: FormulaRecord): void;
}

export class FormulaTimer {
  current: FormulaCase | null = null;
  presentedAt: number | null = null;
  reactionMs: number | null = null;
  startedAt: number | null = null;
  lastMoveAt: number | null = null;
  moveCount = 0;
  private generation = 0;
  private lastSerial: number | null = null;
  private job: number | null = null;
  private verifying = false;

  constructor(private readonly clock: FormulaTimerClock) {}

  /** 新蓝牙连接可能重新从任意序号起报，不能沿用上个设备的去重基准。 */
  resetSerial(): void { this.lastSerial = null; }

  private serialRelation(serial: number, reference: number): -1 | 0 | 1 {
    const diff = ((serial & 0xff) - (reference & 0xff)) & 0xff;
    return diff === 0 ? 0 : diff < 0x80 ? 1 : -1;
  }

  beginCase(item: FormulaCase, displayedAt = this.clock.now()): number {
    this.cancel();
    this.current = item;
    this.presentedAt = displayedAt;
    this.startedAt = null;
    this.lastMoveAt = null;
    this.moveCount = 0;
    return this.generation;
  }

  holdForVerification(): void { this.verifying = true; }
  releaseVerification(): void {
    this.verifying = false;
    if (this.current && this.lastMoveAt !== null && this.clock.now() >= this.lastMoveAt + 2000)
      this.expire(this.generation, this.lastMoveAt);
  }

  /** 末转后最多显示 2 秒；核验请求挂起时也不能让计时继续累加。 */
  elapsedAt(at: number): number {
    if (this.startedAt === null) return 0;
    const end = this.lastMoveAt === null ? at : Math.min(at, this.lastMoveAt + 2000);
    return Math.max(0, end - this.startedAt);
  }

  /** 由屏幕逻辑题面完成触发；蓝牙实体状态不参与本训练的成功判定。 */
  completeDisplayed(at: number): boolean {
    if (!this.current || this.startedAt === null) return false;
    this.finish('success', at);
    return true;
  }

  move(at: number, serial?: number, recovered = false): boolean {
    if (!this.current || recovered || (serial !== undefined && this.lastSerial !== null &&
        this.serialRelation(serial, this.lastSerial) <= 0)) return false;
    if (serial !== undefined) this.lastSerial = serial & 0xff;
    this.moveCount++;
    if (this.startedAt === null) {
      this.reactionMs = Math.max(0, at - this.presentedAt!);
      this.startedAt = at;
    }
    this.lastMoveAt = at;
    this.clearJob();
    const generation = this.generation;
    this.job = this.clock.schedule(() => { void this.expire(generation, at); }, 2000);
    return true;
  }

  interrupt(at: number): void {
    if (this.current && this.startedAt !== null) this.finish('interrupted', at);
    else this.cancel();
  }

  cancel(): void {
    this.generation++;
    this.verifying = false;
    this.clearJob();
    this.current = null;
    this.presentedAt = null;
    this.reactionMs = null;
    this.startedAt = null;
    this.lastMoveAt = null;
    this.moveCount = 0;
  }

  dispose(): void { this.cancel(); }

  private clearJob(): void {
    if (this.job !== null) this.clock.cancel(this.job);
    this.job = null;
  }

  private expire(generation: number, lastMoveAt: number): void {
    if (generation !== this.generation || this.lastMoveAt !== lastMoveAt) return;
    this.job = null;
    if (this.verifying) return;
    this.finish('idle-failure', lastMoveAt + 2000);
  }

  private finish(result: FormulaResult, at: number): void {
    if (!this.current || this.startedAt === null) return;
    const record: FormulaRecord = { ...this.current, result, at, durationMs: Math.max(0, at - this.startedAt),
      reactionMs: this.reactionMs!, moveCount: this.moveCount };
    this.cancel();
    this.clock.onResult(record);
  }
}
