import { matchPllSix } from './pll-six-sticker';
import { parseOpFormula } from './op-formula';

export type OpItem = { name: string; origin: string };
export type OpSimulator = (moves: string[]) => string;
export type OpCase = {
  targetPll: string; pllFormula: string; ollName: string; ollFormula: string;
  y: string; scramble: string; moves: string[]; openingAuf: string | null;
  beforeFacelets: string; afterFacelets: string;
};

const ROTATIONS = ['', 'y', "y'", 'y2'];

function f2lComplete(facelets: string): boolean {
  if (!/^[URFDLB]{54}$/.test(facelets)) return false;
  if (facelets.slice(27, 36) !== facelets[31].repeat(9)) return false;
  return [9, 18, 36, 45].every(base =>
    facelets.slice(base + 3, base + 9) === facelets[base + 4].repeat(6));
}

export function validateOpCase(pll: OpItem, oll: OpItem, y: string, simulate: OpSimulator): OpCase {
  if (!ROTATIONS.includes(y)) throw Error('整体朝向不支持');
  const p = parseOpFormula(pll.origin);
  const o = parseOpFormula(oll.origin);
  const scrambleMoves = [y, ...p.inverse, ...o.inverse].filter(Boolean);
  const beforeFacelets = simulate(scrambleMoves);
  const afterFacelets = simulate([...scrambleMoves, ...o.moves]);
  const targetPll = pll.name.startsWith('PLL-') ? pll.name.slice(4) : pll.name;
  if (!f2lComplete(beforeFacelets) || beforeFacelets.slice(0, 9) === beforeFacelets[4].repeat(9))
    throw Error('此组合没有形成有效的 OLL 待定向状态');
  if (!f2lComplete(afterFacelets) || afterFacelets.slice(0, 9) !== afterFacelets[4].repeat(9))
    throw Error('OLL 完成后未保持下两层或未完成顶层定向');
  if (matchPllSix(afterFacelets)?.name !== targetPll) throw Error('目标 PLL 校验失败');
  return { targetPll, pllFormula: pll.origin, ollName: oll.name, ollFormula: oll.origin,
    y, scramble: scrambleMoves.join(' '), moves: o.moves, openingAuf: o.openingAuf,
    beforeFacelets, afterFacelets };
}

export function generateOpCase(plls: OpItem[], olls: OpItem[], random: () => number,
  simulate: OpSimulator): OpCase {
  if (!plls.length || !olls.length) throw Error('PLL 或 OLL 公式池为空');
  const pll = plls[Math.min(plls.length - 1, Math.floor(random() * plls.length))];
  const index = Math.min(olls.length - 1, Math.floor(random() * olls.length));
  const y = ROTATIONS[Math.min(3, Math.floor(random() * 4))];
  const reasons: string[] = [];
  for (let offset = 0; offset < olls.length; offset++) {
    const oll = olls[(index + offset) % olls.length];
    try { return validateOpCase(pll, oll, y, simulate); }
    catch (error) { reasons.push(`${oll.name}：${(error as Error).message}`); }
  }
  throw Error(`${pll.name} 无可用 OLL（${reasons.length} 条已检查）；${reasons[0]}`);
}
