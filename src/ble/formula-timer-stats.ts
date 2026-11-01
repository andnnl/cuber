import { FormulaCategory, FormulaRecord, FormulaResult } from './formula-timer';

export type StatsMode = 'per-formula' | 'category';
export type StatsLabel = 'duration' | 'reaction' | 'failure';
export interface StatsPoint {
  at: number;
  result: FormulaResult;
  durationMs: number | null;
  reactionMs: number | null;
}
export interface StatsTotals {
  recordCount: number;
  attemptCount: number;
  successCount: number;
  successRate: number | null;
  durationCount: number;
  meanDurationMs: number | null;
  reactionCount: number;
  meanReactionMs: number | null;
}
export interface FormulaSummary extends StatsTotals {
  id: string;
  category: FormulaCategory;
  name: string;
  records: FormulaRecord[];
  points: StatsPoint[];
  labels: StatsLabel[];
  insufficient: boolean;
}
export interface StatsResult {
  overview: StatsTotals;
  formulas: FormulaSummary[];
  groups: Record<StatsLabel, FormulaSummary[]>;
}

const validTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const mean = (values: number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function aggregate(records: FormulaRecord[]): StatsTotals {
  const attempts = records.filter(record => record.result === 'success' || record.result === 'idle-failure');
  const successes = records.filter(record => record.result === 'success');
  const durations = successes.filter(record => validTime(record.durationMs)).map(record => record.durationMs);
  const reactions = successes.filter(record => validTime(record.reactionMs)).map(record => record.reactionMs!);
  return {
    recordCount: records.length, attemptCount: attempts.length, successCount: successes.length,
    successRate: attempts.length ? successes.length / attempts.length : null,
    durationCount: durations.length, meanDurationMs: mean(durations),
    reactionCount: reactions.length, meanReactionMs: mean(reactions),
  };
}

const tie = (a: FormulaSummary, b: FormulaSummary): number =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const descending = (a: number | null, b: number | null): number =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a;

export function summarizeFormulaRecords(records: FormulaRecord[], category: FormulaCategory,
  mode: StatsMode, count: number, slowSeconds: number): StatsResult {
  const sorted = records.map((record, index) => ({ record, index }))
    .filter(item => item.record.category === category)
    .sort((a, b) => b.record.at - a.record.at || a.index - b.index);
  const groups = new Map<string, Array<{ record: FormulaRecord; index: number }>>();
  for (const item of mode === 'category' ? sorted.slice(0, count) : sorted) {
    const chosen = groups.get(item.record.id) || [];
    if (mode === 'category' || chosen.length < count) chosen.push(item);
    groups.set(item.record.id, chosen);
  }
  const formulas: FormulaSummary[] = Array.from(groups.entries()).map(([id, chosen]) => ({
    id, category, name: chosen[0].record.name, records: chosen.map(item => item.record),
    points: chosen.slice().sort((a, b) => a.record.at - b.record.at || a.index - b.index)
      .map(({ record }) => ({
      at: record.at, result: record.result,
      durationMs: record.result === 'success' && validTime(record.durationMs) ? record.durationMs : null,
      reactionMs: record.result === 'success' && validTime(record.reactionMs) ? record.reactionMs! : null,
    })),
    ...aggregate(chosen.map(item => item.record)), labels: [],
    insufficient: chosen.filter(item => item.record.result === 'success').length < 3,
  }));
  const reactionBaseline = median(formulas.filter(row => row.reactionCount >= 3 && row.meanReactionMs !== null)
    .map(row => row.meanReactionMs!));
  for (const row of formulas) {
    if (row.successCount >= 3 && row.meanDurationMs !== null && row.meanDurationMs > slowSeconds * 1000)
      row.labels.push('duration');
    if (row.reactionCount >= 3 && reactionBaseline !== null && row.meanReactionMs! > reactionBaseline * 1.5)
      row.labels.push('reaction');
    if (row.attemptCount >= 5 && row.successRate !== null && row.successRate < 0.8)
      row.labels.push('failure');
  }
  formulas.sort((a, b) => descending(a.meanDurationMs, b.meanDurationMs) || tie(a, b));
  const sample = ([] as FormulaRecord[]).concat(...Array.from(groups.values()).map(chosen =>
    chosen.map(item => item.record)));
  return {
    overview: aggregate(sample), formulas,
    groups: {
      duration: formulas.filter(row => row.labels.indexOf('duration') >= 0)
        .sort((a, b) => descending(a.meanDurationMs, b.meanDurationMs) || tie(a, b)),
      reaction: formulas.filter(row => row.labels.indexOf('reaction') >= 0)
        .sort((a, b) => descending(a.meanReactionMs, b.meanReactionMs) || tie(a, b)),
      failure: formulas.filter(row => row.labels.indexOf('failure') >= 0)
        .sort((a, b) => (a.successRate! - b.successRate!) || tie(a, b)),
    },
  };
}
