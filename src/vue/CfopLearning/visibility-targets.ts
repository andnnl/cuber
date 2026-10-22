import {CfopRoute} from './route';
import {hasInitialZ2, relabelZ2Colors} from './frame-colors';
import {findSlotPieces, trackedSlots} from './tracking';

/** Target identities are resolved from the timeline frame, never from fixed cubelet positions. */
export function visiblePieceSignatures(route: CfopRoute, cursor: number, targets: readonly number[]): Set<string> {
  const frame = route.frames[cursor];
  const visible = new Set<string>();
  if (!frame || targets.length !== 54) return visible;
  const physical = frame.facelets;
  const logical = hasInitialZ2(route.input) ? relabelZ2Colors(physical) : physical;
  const positions: {physical:string[]; logical:string[]}[] = Array.from({length:27}, () => ({physical:[], logical:[]}));
  for (let i = 0; i < 54; i++) {
    positions[targets[i]].physical.push(physical[i]);
    positions[targets[i]].logical.push(logical[i]);
  }
  const signature = (colors: string[]) => colors.slice().sort().join('');
  const include = (position: number) => {
    if (position >= 0) visible.add(signature(positions[position].physical));
  };
  for (const face of ['R', 'F', 'L', 'B']) {
    const target = signature(['D', face]);
    include(positions.findIndex(position => signature(position.logical) === target));
  }
  const crossEnd = route.segments[0]?.end || 0;
  // XCross/XXCross/XXXCross finish their pairs inside the first stage. Use the
  // completed slots at its end to keep those physical pieces visible from move 0.
  const {current, next} = trackedSlots(route, cursor);
  const slots = cursor < crossEnd
    ? route.frames[crossEnd]?.slots || []
    : [...(frame.slots || []), current, next];
  for (const slot of new Set(slots)) {
    if (!slot) continue;
    const pieces = findSlotPieces(logical, targets, slot);
    if (pieces) {
      include(pieces.cornerIndex);
      include(pieces.edgeIndex);
    }
  }
  return visible;
}
