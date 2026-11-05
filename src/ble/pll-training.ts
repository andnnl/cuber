/** PLL 六格训练的案例与实体计时，不修改展示魔方。 */
import { z2Move } from './move-diff';

/** 题面先执行 z2 时，实体固定坐标的层名要转换到当前画面坐标。 */
export function displayPllPhysicalMove(move: string, useZ2: boolean): string {
  return useZ2 ? z2Move(move) : move;
}

export type PllItem = { name: string; origin: string };
/** preRotation 沿用原字段名，值现在是前置 AUF，不再是整体 y 转体。 */
export type PllCase = PllItem & { preRotation: string; postAuf: string; scramble: string };
export type PllResult = { name: string; kind: 'observation' | 'bluetooth'; durationMs: number | null; at: number;
  version?: number; ok?: boolean; selectedName?: string; scramble?: string };

const AUF = ['', 'U', "U'", 'U2'];

export function isSolvedFacelets(value: string): boolean {
  return /^[URFDLB]{54}$/.test(value) && new Set([4, 13, 22, 31, 40, 49].map(index => value[index])).size === 6 &&
    [0, 9, 18, 27, 36, 45].every(
    (start) => value.slice(start, start + 9) === value[start].repeat(9));
}

export class PllTraining {
  current: PllCase;
  records: PllResult[] = [];
  lastResult: PllResult | null = null;
  startedAt: number | null = null;
  private caseStartedAt = 0;
  private lastPhysicalFacelets = '';
  private sawUnsolvedAfterStart = false;
  private startSerial: number | null = null;
  private allowedNames = new Set<string>();
  private allowedChapters = new Set<number>();
  private chapterCases = new Map<string, Array<PllCase & { chapter: number | null }>>();
  private z2Enabled = false;

  constructor(private readonly items: PllItem[], private readonly random: () => number,
    private readonly clock: () => number, private readonly invert: (origin: string) => string,
    private readonly classify?: (scramble: string) => number | null) {
    if (items.length === 0) throw new Error('PLL 公式库为空');
    this.next();
  }

  next(): PllCase {
    const pool = this.allowedNames.size ? this.items.filter(item => this.allowedNames.has(item.name)) : this.items;
    if (this.allowedChapters.size) {
      const candidates = pool.reduce<Array<PllCase & { chapter: number | null }>>((result, item) => {
        result.push(...this.casesFor(item).filter(candidate => this.allowedChapters.has(candidate.chapter!)));
        return result;
      }, []);
      if (!candidates.length) throw new Error('所选 PLL 公式与六格分类没有可用题目');
      const chosen = candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))];
      this.current = { name: chosen.name, origin: chosen.origin, preRotation: chosen.preRotation,
        postAuf: chosen.postAuf, scramble: chosen.scramble };
      this.retry();
      return this.current;
    }
    const item = pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
    const preRotation = AUF[Math.floor(this.random() * 4)];
    const postAuf = AUF[Math.floor(this.random() * 4)];
    this.current = { ...item, preRotation, postAuf,
      scramble: this.scramble(item.origin, preRotation, postAuf) };
    this.retry();
    return this.current;
  }

  setZ2(enabled: boolean): void {
    this.z2Enabled = enabled;
    this.current.scramble = this.scramble(this.current.origin, this.current.preRotation, this.current.postAuf);
  }

  private scramble(origin: string, preRotation: string, postAuf: string): string {
    return [this.z2Enabled ? 'z2' : '', preRotation, this.invert(origin), postAuf].filter(Boolean).join(' ');
  }

  setAllowedNames(names: string[]): void {
    const known = new Set(this.items.map(item => item.name));
    this.allowedNames = new Set(names.filter(name => known.has(name)));
  }

  setAllowedChapters(chapters: number[]): void {
    this.allowedChapters = new Set(chapters.filter(chapter => Number.isInteger(chapter) && chapter >= 1 && chapter <= 9));
  }

  canUseFilters(names: string[], chapters: number[]): boolean {
    if (!chapters.length) return true;
    const known = new Set(this.items.map(item => item.name));
    const allowed = names.filter(name => known.has(name));
    const pool = allowed.length ? this.items.filter(item => allowed.indexOf(item.name) >= 0) : this.items;
    return pool.some(item => this.casesFor(item).some(candidate => chapters.indexOf(candidate.chapter!) >= 0));
  }

  private casesFor(item: PllItem): Array<PllCase & { chapter: number | null }> {
    const key = `${this.z2Enabled ? 'z2' : 'normal'}:${item.name}`;
    const cached = this.chapterCases.get(key);
    if (cached) return cached;
    const cases: Array<PllCase & { chapter: number | null }> = [];
    for (const preRotation of AUF) for (const postAuf of AUF) {
      const scramble = this.scramble(item.origin, preRotation, postAuf);
      cases.push({ ...item, preRotation, postAuf, scramble, chapter: this.classify?.(scramble) ?? null });
    }
    this.chapterCases.set(key, cases);
    return cases;
  }

  retry(): void {
    this.restartCaseClock(this.clock());
  }

  restartCaseClock(now: number): void {
    this.caseStartedAt = now;
    this.startedAt = null;
    this.startSerial = null;
    this.sawUnsolvedAfterStart = false;
  }

  answer(name: string, now: number): boolean {
    const ok = name === this.current.name;
    this.record('observation', now, ok, name);
    if (ok) this.next();
    return ok;
  }

  move(now: number, serial?: number, recovered = false): boolean {
    if (recovered) return false;
    if (this.startedAt === null) {
      this.startedAt = now;
      this.startSerial = serial === undefined ? null : serial;
      this.sawUnsolvedAfterStart = !!this.lastPhysicalFacelets && !isSolvedFacelets(this.lastPhysicalFacelets);
    }
    return true;
  }

  facelets(value: string, now: number, serial?: number): boolean {
    this.lastPhysicalFacelets = value;
    if (this.startedAt === null) return false;
    // 某些协议把 FACELETS 序号固定为 0；只有正序号才与 MOVE 序号比较。
    if (this.startSerial !== null && serial !== undefined && serial > 0 && serial < this.startSerial) return false;
    if (!isSolvedFacelets(value)) {
      this.sawUnsolvedAfterStart = true;
      return false;
    }
    if (!this.sawUnsolvedAfterStart) return false;
    this.record('bluetooth', now, true);
    this.next();
    return true;
  }

  private record(kind: PllResult['kind'], now: number, ok: boolean, selectedName?: string): void {
    const result: PllResult = { name: this.current.name, kind,
      durationMs: Math.max(0, now - (kind === 'bluetooth' && this.startedAt !== null ? this.startedAt : this.caseStartedAt)),
      at: now, version: 2, ok, selectedName, scramble: this.current.scramble };
    this.lastResult = result;
    this.records.unshift(result);
    if (this.records.length > 200) this.records.length = 200;
  }
}
