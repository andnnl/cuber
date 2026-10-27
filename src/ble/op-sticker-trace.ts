import Cube from '../cuber/cube';
import { FACE } from '../cuber/define';
import { TwistAction } from '../cuber/twister';

export type OpTrace = { positions: number[][]; pieceIds: number[] };

function stickerKey(cube: Cube, serializedIndex: number): { key: string; piece: number } {
  const face = [FACE.U, FACE.R, FACE.F, FACE.D, FACE.L, FACE.B][Math.floor(serializedIndex / 9)];
  const row = Math.floor(serializedIndex % 9 / 3), col = serializedIndex % 3;
  let x = col, y = 2 - row, z = 2;
  switch (face) {
    case FACE.U: y = 2; z = row; break;
    case FACE.R: x = 2; z = 2 - col; break;
    case FACE.D: y = 0; z = 2 - row; break;
    case FACE.L: x = 0; z = col; break;
    case FACE.B: x = 2 - col; z = 0; break;
  }
  const cubelet = cube.cubelets[z * 9 + y * 3 + x];
  return { key: `${cubelet.initial}:${cubelet.getFace(face)}`, piece: cubelet.initial };
}

/** Each identity is the sticker occupying the corresponding serialized slot at step zero. */
export function traceOpStickers(moves: string[]): OpTrace {
  const cube = new Cube(3);
  const initial = Array.from({ length: 54 }, (_, i) => stickerKey(cube, i));
  const byKey = new Map(initial.map((sticker, id) => [sticker.key, id]));
  if (byKey.size !== 54) throw Error('初始贴纸身份不唯一');
  const positions: number[][] = [];
  const capture = (): void => {
    const current = new Array<number>(54);
    for (let position = 0; position < 54; position++) {
      const id = byKey.get(stickerKey(cube, position).key);
      if (id === undefined) throw Error(`转动后缺少贴纸：${position}`);
      current[id] = position;
    }
    if (new Set(current).size !== 54) throw Error('贴纸轨迹不唯一');
    positions.push(current);
  };
  capture();
  for (const move of moves) {
    cube.twister.twist(new TwistAction(move), true, true);
    capture();
  }
  return { positions, pieceIds: initial.map(sticker => sticker.piece) };
}

export function applyStickerPermutation(facelets: string, positions: number[]): string {
  if (facelets.length !== 54 || positions.length !== 54 || new Set(positions).size !== 54)
    throw Error('无效贴纸置换');
  const output = Array<string>(54);
  positions.forEach((position, id) => { output[position] = facelets[id]; });
  return output.join('');
}
