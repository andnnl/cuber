import { parseOpFormula } from './op-formula';

export type AdvancedF2LVariant = { alg: string; altId: string };
export type AdvancedF2LCase = {
  id: number;
  name: string;
  subgroup: string;
  setup: string;
  sticker: { fl: string; kind: string };
  algs: AdvancedF2LVariant[][];
  oriNames: string[];
};
export type AdvancedF2LSelection = {
  id: number;
  direction: number;
  variant: number;
  altId: string;
  displayFormula: string;
  moves: string[];
  inverse: string[];
};

export function selectAdvancedF2LCase(item: AdvancedF2LCase, direction: number, variant: number): AdvancedF2LSelection {
  const group = item.algs[direction];
  if (!group) throw Error(`${item.name}：未知方向 ${direction}`);
  if (!group.length) throw Error(`${item.name}：该方向暂无解法`);
  const selected = group[variant];
  if (!selected) throw Error(`${item.name}：未知公式 ${variant}`);
  // 某些来源公式将 180° 记作 U2'；二者旋转结果相同，保留原始字符串作展示。
  const normalized = selected.alg.replace(/([URFDLBMESxyzurfdlb])2'/g, '$12');
  const parsed = parseOpFormula(normalized);
  return { id: item.id, direction, variant, altId: selected.altId, displayFormula: selected.alg,
    moves: parsed.moves, inverse: parsed.inverse };
}
