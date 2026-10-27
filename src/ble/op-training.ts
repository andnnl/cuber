import { OpCase } from './op-case';
import { OpView } from './op-window';

export type OpRecord = {
  targetPll: string; pllFormula: string; ollName: string; ollFormula: string; y: string; scramble: string;
  beforeFacelets: string; afterFacelets: string; view: OpView; usedHints: boolean;
  moves: string[]; openingAuf: string | null;
  selectedName: string; ok: boolean; durationMs: number; at: number;
};
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'seamlessOpRecords';

export class OpTraining {
  current: OpCase;
  view: OpView = 'FR';
  hintsVisible = false;
  revealed = false;
  readOnly = false;
  startedAt: number;
  records: OpRecord[] = [];

  constructor(private generate: () => OpCase, private storage: StorageLike, private now: () => number) {
    this.current = generate();
    this.startedAt = now();
    try {
      const saved = JSON.parse(storage.getItem(KEY) || '[]');
      if (Array.isArray(saved)) this.records = saved.filter((item): item is OpRecord =>
        typeof item?.targetPll === 'string' && typeof item?.scramble === 'string' &&
        typeof item?.ollFormula === 'string' && typeof item?.ok === 'boolean' &&
        typeof item?.durationMs === 'number' && Array.isArray(item?.moves) &&
        item.moves.every((move: unknown) => typeof move === 'string')).slice(0, 200);
    } catch { /* Corrupt local records must not prevent practice. */ }
  }

  next(): void {
    this.current = this.generate();
    this.readOnly = false;
    this.retry();
  }
  retry(): void {
    this.hintsVisible = false;
    this.revealed = false;
    this.startedAt = this.now();
  }
  switchView(view: OpView): void { this.view = view; }
  showHints(): void { this.hintsVisible = true; }
  answer(name: string, at = this.now()): boolean {
    if (this.readOnly || this.revealed) return false;
    const ok = name === this.current.targetPll;
    const record: OpRecord = {
      targetPll: this.current.targetPll, pllFormula: this.current.pllFormula, ollName: this.current.ollName,
      ollFormula: this.current.ollFormula, y: this.current.y, scramble: this.current.scramble,
      beforeFacelets: this.current.beforeFacelets, afterFacelets: this.current.afterFacelets,
      moves: this.current.moves.slice(), openingAuf: this.current.openingAuf,
      view: this.view, usedHints: this.hintsVisible, selectedName: name, ok,
      durationMs: Math.max(0, at - this.startedAt), at,
    };
    this.records.unshift(record);
    this.records = this.records.slice(0, 200);
    try { this.storage.setItem(KEY, JSON.stringify(this.records)); } catch { /* Private browsing may refuse writes. */ }
    if (ok) this.revealed = true;
    return ok;
  }
  replay(record: OpRecord): void {
    this.current = { ...this.current, targetPll: record.targetPll, pllFormula: record.pllFormula || '', ollName: record.ollName,
      ollFormula: record.ollFormula, y: record.y, scramble: record.scramble,
      beforeFacelets: record.beforeFacelets, afterFacelets: record.afterFacelets,
      moves: record.moves.slice(), openingAuf: record.openingAuf };
    this.view = record.view;
    this.readOnly = true;
    this.revealed = true;
    this.hintsVisible = true;
  }
  filteredRecords(pll = '', oll = '', result = ''): OpRecord[] {
    return this.records.filter(item => (!pll || item.targetPll === pll) &&
      (!oll || item.ollName === oll) && (!result || (result === 'correct') === item.ok));
  }
}
