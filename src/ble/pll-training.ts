/** PLL 六格训练的案例与实体计时，不修改展示魔方。 */
export type PllItem = { name: string; origin: string };
export type PllCase = PllItem & { preRotation: string; postAuf: string; scramble: string };
export type PllResult = { name: string; kind: 'observation' | 'bluetooth'; durationMs: number | null; at: number;
  version?: number; ok?: boolean; selectedName?: string; scramble?: string };

const AUF = ['', 'U', "U'", 'U2'];
const ROTATIONS = ['', 'y', "y'", 'y2'];

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
  private z2Enabled = false;

  constructor(private readonly items: PllItem[], private readonly random: () => number,
    private readonly clock: () => number, private readonly invert: (origin: string) => string) {
    if (items.length === 0) throw new Error('PLL 公式库为空');
    this.next();
  }

  next(): PllCase {
    const pool = this.allowedNames.size ? this.items.filter(item => this.allowedNames.has(item.name)) : this.items;
    const item = pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
    const preRotation = ROTATIONS[Math.floor(this.random() * 4)];
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
