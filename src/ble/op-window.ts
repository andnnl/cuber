import { describePllSix, matchPllSix, PllSixDescription, PllSixMatch } from './pll-six-sticker';
import { applyStickerPermutation, traceOpStickers } from './op-sticker-trace';

export type OpView = 'FR' | 'LF';
export type OpWindow = { indices: number[]; six: string; sources: number[]; related: number[];
  description: PllSixDescription | null; match: PllSixMatch | null };

export function opWindowIndices(view: OpView): number[] {
  return view === 'FR' ? [18, 19, 20, 9, 10, 11] : [36, 37, 38, 18, 19, 20];
}

const rotateToLF = traceOpStickers(["y'"]).positions[1];

export function opWindow(before: string, positions: number[][], view: OpView,
  pieceIds?: number[]): OpWindow {
  if (!positions.length) throw Error('贴纸轨迹为空');
  const final = positions[positions.length - 1];
  const after = applyStickerPermutation(before, final);
  const indices = opWindowIndices(view);
  const sources = indices.map(index => final.indexOf(index));
  if (sources.some(id => id < 0) || new Set(sources).size !== 6) throw Error('六格来源不唯一');
  const keyPieces = new Set(sources.map(id => pieceIds?.[id]).filter((id): id is number => id !== undefined));
  const related = pieceIds ? pieceIds.map((piece, id) => keyPieces.has(piece) ? id : -1).filter(id => id >= 0) : [];
  const observed = view === 'LF' ? applyStickerPermutation(after, rotateToLF) : after;
  return { indices, six: indices.map(i => after[i]).join(''), sources, related,
    description: describePllSix(observed), match: matchPllSix(observed) };
}
