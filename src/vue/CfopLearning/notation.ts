export interface CfopMappedStep {
  physicalMove?: string;
  nextOrientation: number;
  viewTurn?: string;
  requiresPhysicalSnapshot: boolean;
}

const FACE_MAP: {[face: string]: string[]} = {
  F: ['F', 'L', 'B', 'R'], B: ['B', 'R', 'F', 'L'],
  L: ['L', 'B', 'R', 'F'], R: ['R', 'F', 'L', 'B'],
  U: ['U', 'U', 'U', 'U'], D: ['D', 'D', 'D', 'D'],
};
const SLICE_MAP = ['S', 'M', "S'", "M'"];

export function mapStep(move: string, orientation: number): CfopMappedStep {
  const n = (orientation % 4 + 4) % 4;
  if (move === 'y' || move === "y'") return {
    nextOrientation: (n + (move === 'y' ? 1 : 3)) % 4,
    viewTurn: move, requiresPhysicalSnapshot: false,
  };
  if (!/^[URFDLBS](2|')?$/.test(move)) throw new Error(`不支持的动作: ${move}`);
  const suffix = move.slice(1);
  let physical = move[0] === 'S' ? SLICE_MAP[n] : FACE_MAP[move[0]][n];
  if (suffix === '2') physical = physical[0] + '2';
  else if (suffix === "'") physical = physical.endsWith("'") ? physical.slice(0, -1) : physical + "'";
  return {physicalMove: physical, nextOrientation: n, requiresPhysicalSnapshot: move[0] === 'S'};
}

export function orientationAt(moves: string[], cursor: number): number {
  let orientation = 0;
  for (let i = 0; i < cursor; i++) orientation = mapStep(moves[i], orientation).nextOrientation;
  return orientation;
}
