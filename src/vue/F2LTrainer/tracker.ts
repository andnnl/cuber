import Cube from "../../cuber/cube";
import Cubelet from "../../cuber/cubelet";
import { F2LSlot } from "../../cuber/f2l";

export interface PieceState {
  slot: number;
  visibleFaces: number[];
}

export interface PieceDiff {
  type: "corner" | "edge";
  fromSlot: number;
  toSlot: number;
  moved: boolean;
}

export class PieceTracker {
  private before: Map<number, PieceState> = new Map();

  snapshot(cube: Cube, slot: F2LSlot): void {
    this.before.clear();
    this.record(slot.cornerIndex, cube);
    this.record(slot.edgeIndex, cube);
  }

  diff(cube: Cube, slot: F2LSlot): PieceDiff[] {
    const diffs: PieceDiff[] = [];
    for (const [initialIndex] of this.before) {
      const before = this.before.get(initialIndex)!;
      const after = this.getState(cube.initials[initialIndex]);
      diffs.push({
        type: initialIndex === slot.cornerIndex ? "corner" : "edge",
        fromSlot: before.slot,
        toSlot: after.slot,
        moved: before.slot !== after.slot,
      });
    }
    return diffs;
  }

  private record(initialIndex: number, cube: Cube): void {
    const cubelet = cube.initials[initialIndex];
    this.before.set(initialIndex, this.getState(cubelet));
  }

  private getState(cubelet: Cubelet): PieceState {
    const visibleFaces: number[] = [];
    for (let f = 0; f < 6; f++) {
      if (cubelet.stickers[f].visible) {
        visibleFaces.push(f);
      }
    }
    return {
      slot: cubelet.index,
      visibleFaces,
    };
  }
}
