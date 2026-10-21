import {CfopRoute} from './route';

export interface TrackedSlots {
  current: string | null;
  next: string | null;
}

/** A move at `cursor` belongs to the first unfinished F2L segment covering that move. */
export function trackedSlots(route: CfopRoute, cursor: number): TrackedSlots {
  const crossEnd = route.segments[0]?.end || 0;
  const segments = route.segments.filter(segment => segment.slot && segment.end > Math.max(cursor, crossEnd));
  if (cursor < crossEnd) return {current:null, next:segments[0]?.slot || null};
  if (segments.length && segments[0].start > cursor) return {current:null, next:segments[0].slot || null};
  return {current:segments[0]?.slot || null, next:segments[1]?.slot || null};
}

/** Keep a pair's color tied to its displayed F2L group, including already-solved groups. */
export function trackingGroupNumber(route: CfopRoute, slot: string): number {
  return route.segments.filter(segment => segment.slot).findIndex(segment => segment.slot === slot) + 1;
}

export interface SlotPieces {
  cornerIndex: number;
  edgeIndex: number;
}

/** Resolve physical cubies from sticker identities, not their transient 3D positions. */
export function findSlotPieces(facelets: string, targets: readonly number[], slot: string): SlotPieces | null {
  if (facelets.length !== 54 || targets.length !== 54 || !/^(FR|FL|BL|BR)$/.test(slot)) return null;
  const colors: string[][] = Array.from({length:27}, () => []);
  for (let i = 0; i < 54; i++) colors[targets[i]].push(facelets[i]);
  const signature = (text: string) => text.split('').sort().join('');
  const corner = signature(`D${slot}`);
  const edge = signature(slot);
  const cornerIndex = colors.findIndex(piece => signature(piece.join('')) === corner);
  const edgeIndex = colors.findIndex(piece => signature(piece.join('')) === edge);
  return cornerIndex >= 0 && edgeIndex >= 0 ? {cornerIndex, edgeIndex} : null;
}
