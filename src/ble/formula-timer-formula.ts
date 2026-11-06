import Cube from '../cuber/cube';
import { parseOpFormula } from './op-formula';
import { FormulaCase, FormulaCategory, isFormulaGoal } from './formula-timer';
import { validateOpCase } from './op-case';
import { AdvancedF2LCase, selectAdvancedF2LCase } from './adv-f2l';
import { AdvancedF2LSlot } from './formula-timer-goal';
import { F2L_SLOTS } from '../cuber/f2l';
import { CORNER_FACELET_MAP } from './move-diff';

export interface FormulaItem { id: string; category: FormulaCategory; name: string; formula: string; targetSlot?: AdvancedF2LSlot }
interface FormulaGroup { name: string; items: Array<{ name: string; origin: string; exp?: string }> }
interface CustomOll { id?: string; name: string; origin: string }

export function buildFormulaPool(groups: FormulaGroup[], customOlls: CustomOll[], advancedF2Ls: AdvancedF2LCase[] = []): FormulaItem[] {
  const categories: FormulaCategory[] = ['f2l', 'oll', 'pll'];
  const items: FormulaItem[] = [];
  categories.forEach((category, index) => {
    for (const item of groups[index]?.items || []) {
      items.push({ id: `${category}:${item.name}`, category, name: item.name, formula: item.exp || item.origin });
    }
  });
  customOlls.forEach((item, index) => items.push({ id: `oll:${item.id || `custom-${index}-${item.name}`}`,
    category: 'oll', name: item.name, formula: item.origin }));
  const directions = ['前右', '前左', '后左', '后右'];
  const simulator = new Cube(3);
  for (const item of advancedF2Ls) item.algs.forEach((variants, direction) => variants.forEach((variant, index) => {
    const selected = selectAdvancedF2LCase(item, direction, index);
    simulator.twister.setup(selected.inverse.join(' '));
    const state = simulator.serialize();
    const cornerPosition = item.subgroup === 'Trapped Edge' ? direction : F2L_SLOTS[direction].solverCorner;
    const targetColors = CORNER_FACELET_MAP[cornerPosition].map(position => state[position]).sort().join('');
    const targetSlot = F2L_SLOTS.find(slot => CORNER_FACELET_MAP[slot.solverCorner]
      .map(position => state[Math.floor(position / 9) * 9 + 4]).sort().join('') === targetColors);
    if (!targetSlot) throw Error(`${item.name}：无法根据目标角块配色确定归位槽位`);
    items.push({ id: `advf2l:${item.id}:${direction}:${variant.altId}`, category: 'advf2l',
      name: `${item.name} · ${directions[direction]} · 解法 ${index + 1}`, formula: selected.moves.join(' '),
      targetSlot: targetSlot.name as AdvancedF2LSlot });
  }));
  return items;
}

const PRE_AUF = ['', 'U', "U'", 'U2'];

function randomIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

export function makeFormulaCase(item: FormulaItem, plls: FormulaItem[] = [], random: () => number = Math.random,
  beforeZ2 = false, beforeY: '' | 'y' | "y'" | 'y2' = '', randomU = true): FormulaCase {
  const parsed = parseOpFormula(item.formula);
  let scramble = parsed.inverse.join(' ');
  if (item.category === 'oll') {
    if (!plls.length) throw Error('OLL 出题缺少 PLL 公式池');
    const start = randomIndex(plls.length, random);
    const y = PRE_AUF[randomIndex(PRE_AUF.length, random)];
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
    scramble = [PRE_AUF[randomIndex(PRE_AUF.length, random)], ...parsed.inverse].filter(Boolean).join(' ');
  }
  // 随机 U 只在逆公式之后执行；关闭时不消耗随机值。
  const afterAuf = randomU ? PRE_AUF[randomIndex(PRE_AUF.length, random)] : '';
  scramble = [beforeZ2 ? 'z2' : '', beforeY, scramble, afterAuf].filter(Boolean).join(' ');
  const cube = new Cube(3);
  if (item.category === 'pll') {
    cube.twister.setup(parsed.inverse.join(' '));
    if (isFormulaGoal('pll', cube.serialize())) throw Error(`${item.name} 的 PLL 公式无效`);
  }
  cube.twister.setup(scramble);
  const initialFacelets = cube.serialize();
  const generated = { ...item, scramble, initialFacelets };
  if (!/^[URFDLB]{54}$/.test(initialFacelets) || isFormulaGoal(item.category, initialFacelets, generated)) {
    throw Error(`${item.name} 生成的题面已完成或无效`);
  }
  return generated;
}
