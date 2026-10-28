import { OpTrace } from './op-sticker-trace';
import { opWindowIndices, OpView } from './op-window';
import { topNetCells } from './op-top-net';

export type OpCoverage = {
  view: OpView; indices: number[]; sources: number[]; visibleSources: number[];
  arrowIds: number[]; changed: number[]; endpoints: number[]; missing: number; full: boolean;
};
export type OpFocus = OpCoverage;
export type FocusLevel = 'beginner' | 'intermediate' | 'all';
export const OP_VIEWS: OpView[] = ['FR', 'RB', 'BL', 'LF'];

const VISIBLE = new Set(topNetCells('before').map(cell => cell.index));

/** OLL sticker permutation alone decides which six-cell windows have all sources visible. */
export function opWindowCoverage(trace: OpTrace): OpCoverage[] {
  const initial = trace.positions[0];
  const final = trace.positions[trace.positions.length - 1];
  if (!initial || !final || initial.length !== 54 || final.length !== 54) return [];
  return OP_VIEWS.map(view => {
    const indices = opWindowIndices(view);
    const sources = indices.map(index => final.indexOf(index));
    if (sources.some(id => id < 0)) throw Error('OLL 轨迹中六格贴纸身份不完整');
    const visibleSources = indices.filter((_, i) => VISIBLE.has(initial[sources[i]]));
    const arrowIds = sources.filter(id => VISIBLE.has(initial[id]));
    const changed = indices.filter((index, i) => initial[sources[i]] !== index);
    const missing = 6 - visibleSources.length;
    return { view, indices, sources, visibleSources, arrowIds, changed,
      endpoints: [0, 1, 2, 3, 4, 5], missing, full: missing === 0 };
  });
}

export function focusDifficulty(focus: OpFocus): number {
  return focus.missing * 100 + focus.changed.length * 10 + focus.arrowIds.length;
}

export function selectFocusedCase<T extends { focus: OpFocus }>(candidates: T[], level: FocusLevel): T {
  if (!candidates.length) throw Error('无可用练习题');
  if (level === 'all') return candidates[0];
  const sorted = [...candidates].sort((a, b) => focusDifficulty(a.focus) - focusDifficulty(b.focus));
  return sorted[level === 'beginner' ? 0 : Math.floor((sorted.length - 1) / 2)];
}

export function calculateOpFocus(trace: OpTrace): OpFocus {
  const coverage = opWindowCoverage(trace);
  if (!coverage.length) throw Error('OLL 轨迹为空');
  return coverage.slice().sort((a, b) => focusDifficulty(a) - focusDifficulty(b))[0];
}
