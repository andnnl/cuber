import Cube from '../cuber/cube';
import { parseOpFormula } from './op-formula';
import { FormulaCase, FormulaCategory, isFormulaGoal } from './formula-timer';
import { validateOpCase } from './op-case';

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

const ROTATIONS = ['', 'y', "y'", 'y2'];

function randomIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

export function makeFormulaCase(item: FormulaItem, plls: FormulaItem[] = [], random: () => number = Math.random,
  beforeZ2 = false): FormulaCase {
  const parsed = parseOpFormula(item.formula);
  let scramble = parsed.inverse.join(' ');
  if (item.category === 'oll') {
    if (!plls.length) throw Error('OLL 出题缺少 PLL 公式池');
    const start = randomIndex(plls.length, random);
    const y = ROTATIONS[randomIndex(ROTATIONS.length, random)];
    let lastError: Error | null = null;
    let valid = false;
    for (let offset = 0; offset < plls.length; offset++) {
      const pll = plls[(start + offset) % plls.length];
      try {
        const opCase = validateOpCase({ name: pll.name, origin: pll.formula },
          { name: item.name, origin: item.formula }, y, moves => {
            const cube = new Cube(3);
            cube.twister.setup(moves.join(' '));
            return cube.serialize();
          });
        scramble = opCase.scramble;
        valid = true;
        break;
      } catch (error) { lastError = error as Error; }
    }
    if (!valid) throw Error(`OLL 与 PLL 无有效组合：${lastError?.message || '没有可用的 PLL'}`);
  } else if (item.category === 'pll') {
    scramble = [ROTATIONS[randomIndex(ROTATIONS.length, random)], ...parsed.inverse].filter(Boolean).join(' ');
  }
  if (beforeZ2) scramble = `z2 ${scramble}`;
  const cube = new Cube(3);
  cube.twister.setup(scramble);
  const initialFacelets = cube.serialize();
  if (!/^[URFDLB]{54}$/.test(initialFacelets) || isFormulaGoal(item.category, initialFacelets)) {
    throw Error(`${item.name} 生成的题面已完成或无效`);
  }
  return { ...item, scramble, initialFacelets };
}
