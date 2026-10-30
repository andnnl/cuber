import Cube from '../cuber/cube';
import { parseOpFormula } from './op-formula';
import { FormulaCase, FormulaCategory, isFormulaGoal } from './formula-timer';

export interface FormulaItem { id: string; category: FormulaCategory; name: string; formula: string }
interface FormulaGroup { name: string; items: Array<{ name: string; origin: string; exp?: string }> }
interface CustomOll { id?: string; name: string; origin: string }

export function buildFormulaPool(groups: FormulaGroup[], customOlls: CustomOll[]): FormulaItem[] {
  const categories: FormulaCategory[] = ['f2l', 'oll', 'pll'];
  const items: FormulaItem[] = [];
  categories.forEach((category, index) => {
    for (const item of groups[index]?.items || []) {
      items.push({ id: `${category}:${item.name}`, category, name: item.name, formula: item.exp || item.origin });
    }
  });
  customOlls.forEach((item, index) => items.push({ id: `oll:${item.id || `custom-${index}-${item.name}`}`,
    category: 'oll', name: item.name, formula: item.origin }));
  return items;
}

export function makeFormulaCase(item: FormulaItem): FormulaCase {
  const parsed = parseOpFormula(item.formula);
  const cube = new Cube(3);
  cube.twister.setup(parsed.inverse.join(' '));
  const initialFacelets = cube.serialize();
  if (!/^[URFDLB]{54}$/.test(initialFacelets) || isFormulaGoal(item.category, initialFacelets)) {
    throw Error(`${item.name} 生成的题面已完成或无效`);
  }
  return { ...item, initialFacelets };
}
