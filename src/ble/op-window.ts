import { describePllSix, matchPllSix, distinguishingRelations, PllSixDescription, PllSixMatch } from './pll-six-sticker';
import { PLL_SIX_CATALOG } from './pll-six-sticker-catalog';
import { applyStickerPermutation, traceOpStickers } from './op-sticker-trace';

export type OpView = 'FR' | 'LF';
export type OpWindow = { indices: number[]; six: string; sources: number[]; related: number[];
  description: PllSixDescription | null; match: PllSixMatch | null };
export type OpWindowScore = { unique: boolean; visibleSources: number; relationCount: number };

export function recommendOpWindow(fr: OpWindowScore, lf: OpWindowScore): { view: OpView; message: string } {
  let view: OpView;
  if (fr.unique !== lf.unique) view = fr.unique ? 'FR' : 'LF';
  else if (fr.visibleSources !== lf.visibleSources) view = fr.visibleSources > lf.visibleSources ? 'FR' : 'LF';
  else view = fr.relationCount <= lf.relationCount ? 'FR' : 'LF';
  return { view, message: !fr.unique && !lf.unique ? '单窗口不足以唯一判别，请切换两窗口对照观察' :
    `推荐 ${view === 'FR' ? 'F/R' : 'L/F'} 六格观察` };
}

export function scoreOpWindow(window: OpWindow, view: OpView): OpWindowScore {
  // A full-state match alone does not imply that an observer can distinguish this six-sticker signature.
  const signature = window.description?.signature;
  const unique = !!signature && !!window.match && PLL_SIX_CATALOG[signature] === window.match.name;
  const visibleFaces = view === 'FR' ? [0, 1, 2] : [0, 2, 4];
  return { unique, visibleSources: window.sources.filter(index => visibleFaces.indexOf(Math.floor(index / 9)) >= 0).length,
    relationCount: window.match ? distinguishingRelations(window.match).length : 15 };
}

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
