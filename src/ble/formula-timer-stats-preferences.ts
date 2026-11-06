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
      if (['f2l', 'advf2l', 'oll', 'pll'].indexOf(value?.category) >= 0 &&
          ['per-formula', 'category'].indexOf(value?.mode) >= 0 &&
          [10, 20, 50, 100].indexOf(value?.count) >= 0) return value;
    } catch { /* 损坏偏好不影响训练记录 */ }
    return defaults();
  }

  save(value: FormulaStatsPreferences): boolean {
    try { this.storage.setItem(KEY, JSON.stringify(value)); return true; }
    catch { return false; }
  }
}
