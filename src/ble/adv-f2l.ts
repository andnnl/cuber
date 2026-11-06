import { parseOpFormula } from './op-formula';
import Cube from '../cuber/cube';
import { F2L_SLOTS } from '../cuber/f2l';
import { CORNER_FACELET_MAP, EDGE_FACELET_MAP } from './move-diff';

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

export function advancedF2LCapturePlan(item: AdvancedF2LCase, z2: boolean, direction = 0, simulator = new Cube(3), variant = 0): {
  exp: string; strip: { [face: string]: number[] }; blackCubelets: number[];
} {
  if (!F2L_SLOTS[direction]) throw Error(`${item.name}：未知槽位 ${direction}`);
  const selection = item.algs[direction].length ? selectAdvancedF2LCase(item, direction, variant) : null;
  const initialExp = [z2 ? 'z2' : '', ...(selection ? selection.inverse : [normalizeHalfTurns(item.setup)]),
    selection ? '' : ['', 'y', 'y2', "y'"][direction]]
    .filter(Boolean).join(' ');
  simulator.twister.setup(initialExp);
  const cornerPosition = F2L_SLOTS[direction].cornerIndex + (item.subgroup === 'Trapped Edge' ? 6 : 0);
  return { exp: initialExp, ...advancedF2LMask(simulator, simulator.cubelets[cornerPosition].initial) };
}

export function advancedF2LMask(simulator: Cube, targetCorner: number): {
  strip: { [face: string]: number[] }; blackCubelets: number[];
} {
  const state = simulator.serialize();
  const piecesByColors = new Map<string, number>();
  for (const piece of simulator.initials) {
    piecesByColors.set(piece.stickers.filter(Boolean).map(sticker => sticker.name).sort().join(''), piece.initial);
  }
  const protectedCubelets = new Set<number>();
  const blackCubelets: number[] = [];
  F2L_SLOTS.forEach(slot => {
    const corner = CORNER_FACELET_MAP[slot.solverCorner];
    const edge = EDGE_FACELET_MAP[slot.solverEdge];
    const indices = [corner, edge].map(positions => piecesByColors.get(positions
      .map(position => state[Math.floor(position / 9) * 9 + 4]).sort().join(''))!);
    const done = corner.concat(edge).every(position => state[position] === state[Math.floor(position / 9) * 9 + 4]);
    if (indices[0] === targetCorner || done) indices.forEach(piece => protectedCubelets.add(piece));
    else blackCubelets.push(...indices);
  });
  const strip: { [face: string]: number[] } = {};
  for (const piece of simulator.initials) {
    const faces = piece.stickers.filter(Boolean).map(sticker => sticker.name);
    if (protectedCubelets.has(piece.initial) || faces.indexOf(state[4]) < 0) continue;
    for (const face of faces) {
      if (!strip[face]) strip[face] = [];
      strip[face].push(piece.initial);
    }
  }
  return {
    strip, blackCubelets,
  };
}

export function applyAdvancedF2LMask(cube: Cube, plan: ReturnType<typeof advancedF2LMask> | null): void {
  cube.strip(plan ? plan.strip : {});
  if (!plan) return;
  for (const index of plan.blackCubelets) {
    for (let face = 0; face < 6; face++) cube.stick(index, face, 'remove');
  }
}

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
