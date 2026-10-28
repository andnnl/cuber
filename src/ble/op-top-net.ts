export type TopNetCell = { index: number; side: 'U' | 'L' | 'F' | 'R' | 'B'; row: number; col: number };
export type TopNetArrow = { id: number; from: number; to: number; targetVisible: boolean };
export type OpDestinationFace = 'L' | 'F' | 'R' | 'B';

/** Keep U trajectories; side-face buttons only affect where the sticker lands. */
export function filterOpDestinationArrows(arrows: TopNetArrow[], selectedFaces: OpDestinationFace[]): TopNetArrow[] {
  return arrows.filter(arrow => {
    const face = 'URFDLB'[Math.floor(arrow.to / 9)];
    return face !== 'L' && face !== 'F' && face !== 'R' && face !== 'B' ||
      selectedFaces.indexOf(face as OpDestinationFace) >= 0;
  });
}

const CELLS: TopNetCell[] = [
  ...[47, 46, 45].map((index, col): TopNetCell => ({ index, side: 'B', row: 0, col: col + 1 })),
  ...Array.from({ length: 9 }, (_, n): TopNetCell =>
    ({ index: n, side: 'U', row: 1 + Math.floor(n / 3), col: 1 + n % 3 })),
  ...[36, 37, 38].map((index, row): TopNetCell => ({ index, side: 'L', row: row + 1, col: 0 })),
  ...[11, 10, 9].map((index, row): TopNetCell => ({ index, side: 'R', row: row + 1, col: 4 })),
  ...[18, 19, 20].map((index, col): TopNetCell => ({ index, side: 'F', row: 4, col: col + 1 })),
];

export function topNetCells(panel: 'before' | 'after'): TopNetCell[] {
  return CELLS.filter(cell => panel === 'after' || cell.side !== 'B');
}

/** Positions are identity → serialized slot for every OLL step. */
export function topNetArrows(positions: number[][], step: number, identities?: number[]): TopNetArrow[] {
  const visible = new Set(topNetCells('before').map(cell => cell.index));
  const target = visible;
  const final = positions[positions.length - 1];
  const current = positions[Math.max(0, Math.min(step, positions.length - 1))];
  if (!final || !current || current === final) return [];
  return (identities || Array.from({ length: 54 }, (_, id) => id))
    .filter(id => visible.has(current[id]) && current[id] !== final[id])
    .map(id => ({ id, from: current[id], to: final[id], targetVisible: target.has(final[id]) }));
}

/** Follow visible U/L/F/R stickers unlike the current U centre (including z2). */
export function topObservationArrows(facelets: string, positions: number[][], step: number): TopNetArrow[] {
  if (facelets.length !== 54) return [];
  const current = positions[Math.max(0, Math.min(step, positions.length - 1))];
  const final = positions[positions.length - 1];
  const initial = positions[0];
  if (!current || !final || !initial || current === final) return [];
  const visible = new Set(topNetCells('before').map(cell => cell.index));
  return current.reduce<TopNetArrow[]>((arrows, from, id) => {
    if (visible.has(initial[id]) && visible.has(from) && facelets[from] !== facelets[4]) {
      arrows.push({ id, from, to: final[id], targetVisible: visible.has(final[id]) });
    }
    return arrows;
  }, []);
}

/** A single focused trajectory avoids stacking arrows over sticker colours. */
export function selectNetArrow(arrows: TopNetArrow[], id: number | null): TopNetArrow | null {
  return arrows.find(arrow => arrow.id === id) || arrows.find(arrow => arrow.targetVisible) || arrows[0] || null;
}
