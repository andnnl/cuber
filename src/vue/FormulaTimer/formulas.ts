import { AlgsData } from '../Algs';
import { loadCustomOllLibrary } from '../../ble/op-oll-library';
import { buildFormulaPool, FormulaItem } from '../../ble/formula-timer-formula';
import { AdvancedF2LCase } from '../../ble/adv-f2l';

export const advanced: { cases: AdvancedF2LCase[] } = require('../AdvancedF2L/data.json');

export function loadFormulaPool(storage: Storage): FormulaItem[] {
  const groups = new AlgsData().algs;
  const custom = loadCustomOllLibrary(storage, groups[1].items);
  return buildFormulaPool(groups, custom, advanced.cases);
}
