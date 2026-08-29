import Cube from "../../cuber/cube";
import Cubelet from "../../cuber/cubelet";
import { F2LSlot } from "../../cuber/f2l";

export interface PieceState {
  slot: number;
  visibleFaces: number[];
  type: "corner" | "edge";
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
    this.recordPieceAt(cube, slot.cornerIndex, "corner");
    this.recordPieceAt(cube, slot.edgeIndex, "edge");
  }

  diff(cube: Cube, slot: F2LSlot): PieceDiff[] {
    const diffs: PieceDiff[] = [];
    for (const [initialIndex] of this.before) {
      const before = this.before.get(initialIndex)!;
      const after = this.getState(cube.initials[initialIndex]);
      diffs.push({
        type: before.type,
        fromSlot: before.slot,
        toSlot: after.slot,
        moved: before.slot !== after.slot,
      });
    }
    return diffs;
  }

  private recordPieceAt(cube: Cube, positionIndex: number, type: "corner" | "edge"): void {
    const cubelet = cube.cubelets[positionIndex];
    if (!cubelet) {
      return;
    }
    this.before.set(cubelet.initial, {
      ...this.getState(cubelet),
      type,
    });
  }

  getInitialIndices(): number[] {
    return Array.from(this.before.keys());
  }

  private getState(cubelet: Cubelet): Omit<PieceState, "type"> {
    const visibleFaces: number[] = [];
    for (let f = 0; f < 6; f++) {
      const sticker = cubelet.stickers[f];
      if (sticker && sticker.visible) {
        visibleFaces.push(f);
      }
    }
    return {
      slot: cubelet.index,
      visibleFaces,
    };
  }
}
