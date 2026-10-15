export const SLOTS = ['FL', 'FR', 'BL', 'BR'];

// URFDLB indices; sticker identity at every index also checks orientation.
const CROSS_STICKERS = [28, 25, 32, 16, 34, 52, 30, 43];
const SLOT_STICKERS: { [name: string]: number[] } = {
  FL: [27, 44, 24, 21, 41],
  FR: [29, 26, 15, 23, 12],
  BL: [33, 53, 42, 50, 39],
  BR: [35, 17, 51, 48, 14],
};
const CENTERS = 'URFDLB';

export function remainingSlots(solvedSlots: string[]): string[] {
  return SLOTS.filter(slot => solvedSlots.indexOf(slot) < 0);
}

export function predictionMustReset(predictionSlot: string, solvedSlots: string[]): boolean {
  return remainingSlots(solvedSlots).indexOf(predictionSlot) < 0;
}

function stickersSolved(facelets: string, indices: number[]): boolean {
  return indices.every(index => facelets[index] === CENTERS[Math.floor(index / 9)]);
}

export function verifySolvedTargets(facelets: string, slots: string[]): {
  ok: boolean; cross: boolean; slots: { [name: string]: boolean };
} {
  if (facelets.length !== 54 || slots.some(slot => !SLOT_STICKERS[slot])) {
    return { ok: false, cross: false, slots: {} };
  }
  const cross = stickersSolved(facelets, CROSS_STICKERS);
  const slotResults: { [name: string]: boolean } = {};
  for (const slot of slots) slotResults[slot] = stickersSolved(facelets, SLOT_STICKERS[slot]);
  return { ok: cross && slots.every(slot => slotResults[slot]), cross, slots: slotResults };
}
