import { parseOpFormula } from './op-formula';
import Cube from '../cuber/cube';
import { F2L_SLOTS } from '../cuber/f2l';

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

function normalizeHalfTurns(formula: string): string {
  return formula.replace(/([URFDLBMESxyzurfdlb])2'/g, '$12');
}

const PREVIEW_YAW = ['', "y'", 'y2', 'y'];
const PREVIEW_POSITIONS = [
  Array.from({length:9}, (_, i) => Math.floor(i / 3) * 9 + 6 + i % 3), // U: z=row, y=2, x=col
  Array.from({length:9}, (_, i) => 18 + (2 - Math.floor(i / 3)) * 3 + i % 3), // F
  Array.from({length:9}, (_, i) => (2 - i % 3) * 9 + (2 - Math.floor(i / 3)) * 3 + 2), // R
];

/** 三面九格贴纸；X 表示其他槽位角棱的灰色块体，目标槽位始终朝向缩略图镜头。 */
export function advancedF2LPreview(item: AdvancedF2LCase, z2: boolean, simulator: Cube, direction = 0): string[] {
  if (!F2L_SLOTS[direction]) throw Error(`${item.name}：未知槽位 ${direction}`);
  const yaw = PREVIEW_YAW[direction];
  const selection = item.algs[direction].length ? selectAdvancedF2LCase(item, direction, 0) : null;
  // 按还原态的实体块识别四个槽位；z2 只改变朝向，不能重新指定目标块。
  const greyPieces = new Set(F2L_SLOTS.filter((_, index) => index !== direction)
    .reduce<Cube['cubelets']>((pieces, other) => {
      pieces.push(simulator.initials[other.cornerIndex], simulator.initials[other.edgeIndex]);
      return pieces;
    }, []));
  const targetSlotPieces = [simulator.initials[F2L_SLOTS[direction].cornerIndex], simulator.initials[F2L_SLOTS[direction].edgeIndex]];
  simulator.twister.setup([z2 ? 'z2' : '', yaw].filter(Boolean).join(' '));
  const targetPositions = new Set(targetSlotPieces.map(piece => simulator.cubelets.indexOf(piece)));
  simulator.twister.setup([z2 ? 'z2' : '', ...(selection ? selection.inverse : [normalizeHalfTurns(item.setup)]), yaw].filter(Boolean).join(' '));
  const facelets = simulator.serialize();
  return [0, 18, 9].map((offset, face) => Array.from({length:9}, (_, i) => {
    const position = PREVIEW_POSITIONS[face][i];
    const piece = simulator.cubelets[position];
    return greyPieces.has(piece) && !targetPositions.has(position) ? 'X' : facelets[offset + i];
  }).join(''));
}

export function selectAdvancedF2LCase(item: AdvancedF2LCase, direction: number, variant: number): AdvancedF2LSelection {
  const group = item.algs[direction];
  if (!group) throw Error(`${item.name}：未知方向 ${direction}`);
  if (!group.length) throw Error(`${item.name}：该方向暂无解法`);
  const selected = group[variant];
  if (!selected) throw Error(`${item.name}：未知公式 ${variant}`);
  // 某些来源公式将 180° 记作 U2'；二者旋转结果相同，保留原始字符串作展示。
  const normalized = normalizeHalfTurns(selected.alg);
  const parsed = parseOpFormula(normalized);
  return { id: item.id, direction, variant, altId: selected.altId, displayFormula: selected.alg,
    moves: parsed.moves, inverse: parsed.inverse };
}
