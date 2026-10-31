import { FormulaCategory, FormulaRecord } from './formula-timer';

const KEY = 'formulaTimer.v1';
const CATEGORIES: FormulaCategory[] = ['f2l', 'oll', 'pll'];
const RESULTS = ['success', 'idle-failure', 'interrupted'];

export interface FormulaTimerSettings {
  category: FormulaCategory;
  selectedIds: Record<FormulaCategory, string[]>;
  nextMode: 'repeat' | 'random';
  slowOnly: boolean;
  slowSeconds: number;
}

export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

function defaults(): FormulaTimerSettings {
  return { category: 'f2l', selectedIds: { f2l: [], oll: [], pll: [] }, nextMode: 'random',
    slowOnly: false, slowSeconds: 3 };
}

function validRecord(value: any): value is FormulaRecord {
  return value && CATEGORIES.indexOf(value.category) >= 0 && RESULTS.indexOf(value.result) >= 0 &&
    ['id', 'name', 'formula', 'initialFacelets'].every(key => typeof value[key] === 'string') &&
    (value.scramble === undefined || typeof value.scramble === 'string') &&
    Number.isFinite(value.at) && Number.isFinite(value.durationMs) && value.durationMs >= 0;
}

export class FormulaTimerStore {
  constructor(private readonly storage: StorageLike) {}

  load(): { settings: FormulaTimerSettings; records: FormulaRecord[]; warning: string } {
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return { settings: defaults(), records: [], warning: '' };
      const data = JSON.parse(raw);
      if (data.version !== 1 || !data.settings || !Array.isArray(data.records)) throw Error('版本或结构不匹配');
      const value = data.settings;
      if (CATEGORIES.indexOf(value.category) < 0 || ['repeat', 'random'].indexOf(value.nextMode) < 0 ||
          typeof value.slowOnly !== 'boolean' || !Number.isFinite(value.slowSeconds) ||
          value.slowSeconds <= 0 || !value.selectedIds ||
          !CATEGORIES.every(category => Array.isArray(value.selectedIds[category]) &&
            value.selectedIds[category].every((id: unknown) => typeof id === 'string')) ||
          !data.records.every(validRecord)) throw Error('设置或记录格式无效');
      return { settings: value as FormulaTimerSettings, records: data.records as FormulaRecord[], warning: '' };
    } catch {
      return { settings: defaults(), records: [], warning: '训练设置或记录读取失败，已使用默认值' };
    }
  }

  save(settings: FormulaTimerSettings, records: FormulaRecord[]): string | null {
    try {
      this.storage.setItem(KEY, JSON.stringify({ version: 1, settings, records }));
      return null;
    } catch { return '训练设置或记录保存失败，请检查本机存储空间'; }
  }
}
