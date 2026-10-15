// Observer front only changes notation. The actual cube and F2L targets never rotate.
const FACE_MAP: { [front: string]: { [face: string]: string } } = {
  F: { F: 'F', R: 'R', B: 'B', L: 'L' },
  L: { F: 'L', R: 'F', B: 'R', L: 'B' },
  B: { F: 'B', R: 'L', B: 'F', L: 'R' },
  R: { F: 'R', R: 'B', B: 'L', L: 'F' },
};
export const FRONTS = ['F', 'L', 'B', 'R'];

// Displayed move -> physical move in the current trainer base frame.
export function relativeMove(move: string, front: string): string {
  const map = FACE_MAP[front];
  if (!map) throw new Error(`无效观察正面：${front}`);
  return (map[move[0]] || move[0]) + move.slice(1);
}

// Physical move -> move written as though front faced the observer.
export function physicalMove(move: string, front: string): string {
  const map = FACE_MAP[front];
  if (!map) throw new Error(`无效观察正面：${front}`);
  return (Object.keys(map).find(face => map[face] === move[0]) || move[0]) + move.slice(1);
}

export function slotInView(slot: string, front: string): string {
  const mapped = slot.split('').map(face => physicalMove(face, front)).sort().join('');
  if (['FR', 'FL', 'BR', 'BL'].indexOf(mapped) < 0) throw new Error(`无效 F2L 槽位：${slot}`);
  return mapped;
}

export interface GripStep {
  movement: string;
  instruction: string;
  [key: string]: any;
}
export interface GripRoute {
  score: number;
  regrips: number;
  steps: GripStep[];
  [key: string]: any;
}
export interface Candidate {
  moves: string[];
  slots?: string[];
  slot?: string;
  length?: number;
}
export interface Recommendation {
  id: string;
  front: string;
  displayMoves: string[];
  physicalMoves: string[];
  slots: string[];
  physicalSlots: string[];
  sourceIndices: number[];
  route: GripRoute;
  depth: number;
  offset: number;
}

export function recommendExistingViews(solutions: Candidate[], scoreGrip: (moves: string[]) => GripRoute | null):
  { front: string; solutions: Recommendation[] }[] {
  return FRONTS.map(front => {
    const byFormula = new Map<string, Recommendation>();
    solutions.forEach((solution, sourceIndex) => {
      const physicalMoves = solution.moves;
      const physicalSlots = solution.slots || (solution.slot ? [solution.slot] : []);
      const displayMoves = physicalMoves.map(move => physicalMove(move, front));
      const key = displayMoves.join(' ');
      const slots = physicalSlots.map(slot => slotInView(slot, front));
      const previous = byFormula.get(key);
      if (previous) {
        for (const slot of slots) if (previous.slots.indexOf(slot) < 0) previous.slots.push(slot);
        for (const slot of physicalSlots) if (previous.physicalSlots.indexOf(slot) < 0) previous.physicalSlots.push(slot);
        previous.sourceIndices.push(sourceIndex);
        return;
      }
      const route = scoreGrip(displayMoves);
      if (!route) return;
      byFormula.set(key, {
        id: `${front}:${key}`, front, displayMoves, physicalMoves: physicalMoves.slice(),
        slots, physicalSlots: physicalSlots.slice(), sourceIndices: [sourceIndex], route,
        depth: physicalMoves.length, offset: 0,
      });
    });
    const ranked = Array.from(byFormula.values());
    ranked.sort((a, b) => a.route.score - b.route.score
      || a.route.regrips - b.route.regrips
      || a.depth - b.depth
      || a.displayMoves.join(' ').localeCompare(b.displayMoves.join(' '))
      || a.sourceIndices[0] - b.sourceIndices[0]);
    return { front, solutions: ranked };
  });
}

export function simpleGripInstruction(step: GripStep): string {
  const marker = '；动作后左';
  const end = step.instruction.lastIndexOf(marker);
  return `${step.movement}：${end < 0 ? step.instruction : step.instruction.slice(0, end)}`;
}
