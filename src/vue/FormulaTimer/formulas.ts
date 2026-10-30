import { AlgsData } from '../Algs';
import { loadCustomOllLibrary } from '../../ble/op-oll-library';
import { buildFormulaPool, FormulaItem } from '../../ble/formula-timer-formula';

export function loadFormulaPool(storage: Storage): FormulaItem[] {
  const groups = new AlgsData().algs;
  const custom = loadCustomOllLibrary(storage, groups[1].items);
  return buildFormulaPool(groups, custom);
}
