/** Sticker-level wide-turn replay. Centers are deliberately movable: a wide U turn
 * rotates the middle layer too, unlike the fixed-center cubie search representation. */
const POSITIONS: number[][] = (() => {
  const list: number[][] = [];
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) list.push([x - 1, 1.5, z - 1]);
  for (let y = 2; y >= 0; y--) for (let z = 2; z >= 0; z--) list.push([1.5, y - 1, z - 1]);
  for (let y = 2; y >= 0; y--) for (let x = 0; x < 3; x++) list.push([x - 1, y - 1, 1.5]);
  for (let z = 2; z >= 0; z--) for (let x = 0; x < 3; x++) list.push([x - 1, -1.5, z - 1]);
  for (let y = 2; y >= 0; y--) for (let z = 0; z < 3; z++) list.push([-1.5, y - 1, z - 1]);
  for (let y = 2; y >= 0; y--) for (let x = 2; x >= 0; x--) list.push([x - 1, y - 1, -1.5]);
  return list;
})();
const INDEX: { [key: string]: number } = {};
POSITIONS.forEach((position, index) => { INDEX[position.join(',')] = index; });

export function applyWideFormulaFrom(facelets: string, moves: string[]): string {
  if (!/^[URFDLB]{54}$/.test(facelets)) throw new Error('无效 54 面片');
  let state = facelets;
  for (const move of moves) {
    if (!/^(?:[URFDLB]|[ud])(?:2|')?$/.test(move)) throw new Error(`无效记号：${move}`);
    const face = move[0].toUpperCase();
    const axis = face === 'U' || face === 'D' ? 1 : face === 'R' || face === 'L' ? 0 : 2;
    const side = 'URF'.indexOf(face) >= 0 ? 1 : -1;
    const wide = move[0] === 'u' || move[0] === 'd';
    // Clockwise when looking at the face: positive-axis faces turn -90°, negative-axis +90°.
    const turns = move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1;
    const out: string[] = new Array(54);
    POSITIONS.forEach((position, index) => {
      let [x, y, z] = position;
      if (side * position[axis] > 0.5 || (wide && Math.abs(position[axis]) < 0.5)) {
        for (let n = 0; n < turns; n++) {
          if (axis === 0) { const nextY = side * z; z = -side * y; y = nextY; }
          else if (axis === 1) { const nextX = -side * z; z = side * x; x = nextX; }
          else { const nextX = side * y; y = -side * x; x = nextX; }
        }
      }
      out[INDEX[[x, y, z].join(',')]] = state[index];
    });
    state = out.join('');
  }
  return state;
}

const CROSS = [28, 25, 32, 16, 34, 52, 30, 43];
export function isWideCrossSolved(facelets: string): boolean {
  return facelets.length === 54 && CROSS.every(index =>
    facelets[index] === facelets[Math.floor(index / 9) * 9 + 4]);
}

/** Check both engine wide-turn direction and a final D alignment against actual stickers.
 * A correction is offered only when its fully replayed path really forms a cross in ≤8 turns. */
export function correctWideCross(facelets: string, moves: string[]): string[] | null {
  const inverted = moves.map(move => move === 'u' ? "u'" : move === "u'" ? 'u' : move);
  for (const basis of [moves, inverted]) {
    for (const suffix of ['', 'D', "D'", 'D2']) {
      const candidate = basis.slice();
      if (suffix) {
        const last = candidate[candidate.length - 1];
        if (last && last[0] === 'D') {
          const amount = (last.endsWith('2') ? 2 : last.endsWith("'") ? 3 : 1)
            + (suffix === 'D' ? 1 : suffix === 'D2' ? 2 : 3);
          const combined = amount % 4;
          candidate.pop();
          if (combined) candidate.push(combined === 1 ? 'D' : combined === 2 ? 'D2' : "D'");
        } else candidate.push(suffix);
      }
      if (candidate.length > 8) continue;
      if (isWideCrossSolved(applyWideFormulaFrom(facelets, candidate))) return candidate;
    }
  }
  return null;
}
