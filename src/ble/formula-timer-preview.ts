import Cube from '../cuber/cube';
import { AdvancedF2LCase, advancedF2LMask } from './adv-f2l';
import { FormulaCase } from './formula-timer';
import { F2L_SLOTS } from '../cuber/f2l';
import { CORNER_FACELET_MAP, EDGE_FACELET_MAP } from './move-diff';
import { parseOpFormula } from './op-formula';

export function unmaskedFormulaFacelets(cube: Cube): string {
  const hidden: Cube['initials'][number]['stickers'] = [];
  for (const piece of cube.initials) for (const sticker of piece.stickers) {
    if (sticker && !sticker.visible) hidden.push(sticker);
  }
  hidden.forEach(sticker => { sticker.visible = true; });
  try { return cube.serialize(); }
  finally { hidden.forEach(sticker => { sticker.visible = false; }); }
}

export function formulaTimerMaskPlan(item: Pick<FormulaCase, 'id' | 'category' | 'formula' | 'scramble'>,
  advanced: AdvancedF2LCase[], simulator = new Cube(3)): ReturnType<typeof advancedF2LMask> | null {
  if (item.category !== 'f2l' && item.category !== 'advf2l') return null;
  const inverse = parseOpFormula(item.formula).inverse;
  const moves = parseOpFormula(item.scramble || inverse.join(' ')).moves;
  let initial = moves;
  for (let offset = 0; offset <= moves.length - inverse.length; offset++) {
    if (!moves.slice(0, offset).every(move => /^[xyz]/.test(move))) continue;
    if (moves.slice(offset, offset + inverse.length).join(' ') !== inverse.join(' ')) continue;
    const tail = moves.slice(offset + inverse.length);
    if (tail.length === 1 && /^U(?:2|')?$/.test(tail[0])) initial = moves.slice(0, -1);
    break;
  }
  simulator.twister.setup(initial.join(' '));
  let target: number;
  if (item.category === 'advf2l') {
    const [, caseId, directionText] = item.id.split(':');
    const source = advanced.find(candidate => candidate.id === Number(caseId));
    const slot = F2L_SLOTS[Number(directionText)];
    if (!source || !slot) return null;
    target = simulator.cubelets[slot.cornerIndex + (source.subgroup === 'Trapped Edge' ? 6 : 0)].initial;
  } else {
    const state = simulator.serialize();
    const slot = F2L_SLOTS.find(candidate => CORNER_FACELET_MAP[candidate.solverCorner]
      .concat(EDGE_FACELET_MAP[candidate.solverEdge])
      .some(position => state[position] !== state[Math.floor(position / 9) * 9 + 4]));
    if (!slot) return null;
    const cornerColors = CORNER_FACELET_MAP[slot.solverCorner].map(position => state[Math.floor(position / 9) * 9 + 4]).sort().join('');
    const corner = simulator.initials.find(piece => piece.stickers.filter(Boolean).map(sticker => sticker.name).sort().join('') === cornerColors);
    if (!corner) return null;
    target = corner.initial;
  }
  return advancedF2LMask(simulator, target);
}

export type CubeIconTile = { face: 'U' | 'F' | 'R'; color: string; points: string };
export type AlgsPreviewItem = { origin: string; exp?: string; scramble?: boolean };

/** Match mode=algs: flip the cube, then render the inverse case unless it is already a scramble. */
export function algsPreviewExpression(item: AlgsPreviewItem): string {
  const formula = item.exp || item.origin;
  return item.scramble ? `x2 ${formula}` : `x2 (${formula})'`;
}
type Point = [number, number];
type Corners = [Point, Point, Point, Point];

/** A deterministic preview, separate from the random orientation used for training. */
export function previewFormulaFacelets(moves: string): string {
  const cube = new Cube(3);
  cube.twister.setup(moves);
  return cube.serialize();
}

const faces: Array<{ face: CubeIconTile['face']; offset: number; corners: Corners }> = [
  { face: 'U', offset: 0, corners: [[45, 4], [82, 22], [45, 40], [8, 22]] },
  { face: 'F', offset: 18, corners: [[8, 22], [45, 40], [45, 81], [8, 63]] },
  { face: 'R', offset: 9, corners: [[45, 40], [82, 22], [82, 63], [45, 81]] },
];

function interpolate([tl, tr, br, bl]: Corners, row: number, col: number): Point {
  const u = col / 3, v = row / 3;
  return [tl[0] * (1 - u) * (1 - v) + tr[0] * u * (1 - v) + br[0] * u * v + bl[0] * (1 - u) * v,
    tl[1] * (1 - u) * (1 - v) + tr[1] * u * (1 - v) + br[1] * u * v + bl[1] * (1 - u) * v];
}

export function cubeIconTiles(facelets: string): CubeIconTile[] {
  if (!/^[URFDLB]{54}$/.test(facelets)) throw Error('3D 缩略图需要 54 格有效面色');
  const tiles: CubeIconTile[] = [];
  for (const { face, offset, corners } of faces) for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const points = [interpolate(corners, row, col), interpolate(corners, row, col + 1),
      interpolate(corners, row + 1, col + 1), interpolate(corners, row + 1, col)]
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    tiles.push({ face, color: facelets[offset + row * 3 + col], points });
  }
  return tiles;
}
