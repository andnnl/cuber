import { FormulaCategory } from './formula-timer';
import { StorageLike } from './formula-timer-store';
import { StatsMode } from './formula-timer-stats';

export interface FormulaStatsPreferences {
  category: FormulaCategory;
  mode: StatsMode;
  count: 10 | 20 | 50 | 100;
}

const KEY = 'formulaTimer.stats.v1';
const defaults = (): FormulaStatsPreferences => ({ category: 'f2l', mode: 'per-formula', count: 20 });

export class FormulaStatsPreferencesStore {
  constructor(private readonly storage: StorageLike) {}

  load(): FormulaStatsPreferences {
    try {
      const value = JSON.parse(this.storage.getItem(KEY) || 'null');
      if (['f2l', 'oll', 'pll'].includes(value?.category) &&
          ['per-formula', 'category'].includes(value?.mode) &&
          [10, 20, 50, 100].includes(value?.count)) return value;
    } catch { /* 损坏偏好不影响训练记录 */ }
    return defaults();
  }

  save(value: FormulaStatsPreferences): boolean {
    try { this.storage.setItem(KEY, JSON.stringify(value)); return true; }
    catch { return false; }
  }
}
