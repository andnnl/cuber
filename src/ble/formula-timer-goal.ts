import { F2L_SLOTS } from '../cuber/f2l';
import { CORNER_FACELET_MAP, EDGE_FACELET_MAP } from './move-diff';

export type AdvancedF2LSlot = 'FR' | 'FL' | 'BL' | 'BR';
export interface AdvancedF2LGoalContext {
  id: string;
  initialFacelets: string;
  targetSlot?: AdvancedF2LSlot;
}
export interface AdvancedF2LGoal { cross: string[]; slots: string[] }

const goals = new WeakMap<AdvancedF2LGoalContext, AdvancedF2LGoal | null>();

function validFacelets(facelets: string): boolean {
  return /^[URFDLB]{54}$/.test(facelets) &&
    new Set([4, 13, 22, 31, 40, 49].map(index => facelets[index])).size === 6;
}

function pieceColors(facelets: string, positions: number[]): string {
  return positions.map(position => facelets[Math.floor(position / 9) * 9 + 4]).join('');
}

function pieceDone(facelets: string, colors: string): boolean {
  const positions = colors.length === 2 ? EDGE_FACELET_MAP : CORNER_FACELET_MAP;
  return positions.some(piece => piece.every(position => {
    const center = facelets[Math.floor(position / 9) * 9 + 4];
    return colors.indexOf(center) >= 0 && facelets[position] === center;
  }));
}

function slotDone(facelets: string, colors: string): boolean {
  return pieceDone(facelets, colors) && pieceDone(facelets, colors.slice(1));
}

export function createAdvancedF2LGoal(context: AdvancedF2LGoalContext): AdvancedF2LGoal | null {
  if (!validFacelets(context.initialFacelets)) return null;
  const targetSlot = F2L_SLOTS.find(slot => slot.name === context.targetSlot);
  if (!targetSlot) return null;
  const initial = context.initialFacelets;
  const cross = EDGE_FACELET_MAP.slice(4, 8).map(piece => pieceColors(initial, piece))
    .filter(colors => pieceDone(initial, colors));
  const slots = F2L_SLOTS.map(slot => pieceColors(initial, CORNER_FACELET_MAP[slot.solverCorner]))
    .filter(colors => slotDone(initial, colors));
  const targetColors = pieceColors(initial, CORNER_FACELET_MAP[targetSlot.solverCorner]);
  return { cross, slots: [...new Set([...slots, targetColors])] };
}

export function isAdvancedF2LGoal(facelets: string, context?: AdvancedF2LGoalContext): boolean {
  if (!context || !validFacelets(facelets)) return false;
  if (!goals.has(context)) goals.set(context, createAdvancedF2LGoal(context));
  const goal = goals.get(context);
  return !!goal && goal.cross.every(colors => pieceDone(facelets, colors)) &&
    goal.slots.every(colors => slotDone(facelets, colors));
}
