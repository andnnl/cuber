import Cube from '../cuber/cube';

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
