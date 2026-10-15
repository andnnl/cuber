import { isCrossDone, f2lSlotsDone } from "./facelets";
import { toTrainFrame } from "./move-diff";

export type CrossTrainMode = "cross" | "xcross" | "xxcross" | "xxxcross";
export type SlotSelectionMode = "ALL" | "FIXED";
export const CROSS_SLOTS = ["FL", "FR", "BL", "BR"];

export function pairCountForMode(mode: CrossTrainMode): number {
  return mode === "xxxcross" ? 3 : mode === "xxcross" ? 2 : mode === "xcross" ? 1 : 0;
}

export function normalizeTrainSlots(slots: string[], count: number): string[] {
  const unique = slots.filter((slot, index) => CROSS_SLOTS.indexOf(slot) >= 0 && slots.indexOf(slot) === index).slice(0, count);
  for (const slot of CROSS_SLOTS) if (unique.length < count && unique.indexOf(slot) < 0) unique.push(slot);
  return unique;
}

/** 状态先进入底色训练帧，再以十字和目标槽位的真实归位状态结算。 */
export function evaluateCrossTarget(
  coreState: string, mode: CrossTrainMode, selection: SlotSelectionMode,
  fixedSlots: string[], whiteBottom = false,
): { ok: boolean; cross: boolean; completedSlots: string[] } {
  const state = whiteBottom ? toTrainFrame(coreState) : coreState;
  const cross = isCrossDone(state);
  const completedSlots = cross ? f2lSlotsDone(state) : [];
  const count = pairCountForMode(mode);
  const targetsValid = selection === "ALL" || fixedSlots.length === count &&
    new Set(fixedSlots).size === count && fixedSlots.every(slot => CROSS_SLOTS.indexOf(slot) >= 0);
  return {
    ok: cross && targetsValid && (selection === "ALL"
      ? completedSlots.length >= count : fixedSlots.every(slot => completedSlots.indexOf(slot) >= 0)),
    cross, completedSlots,
  };
}
