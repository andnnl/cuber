import { FACE } from "./define";

export interface F2LSlot {
  name: string;
  solverCorner: number;
  solverEdge: number;
  cornerIndex: number;
  edgeIndex: number;
}

export const F2L_SLOTS: F2LSlot[] = [
  {
    name: "FR",
    solverCorner: 4, // DFR
    solverEdge: 8, // FR
    cornerIndex: 20, // (1, -1, 1) -> _x=2, _y=0, _z=2 -> 2*9+0*3+2 = 20
    edgeIndex: 23, // (1, 0, 1) -> _x=2, _y=1, _z=2 -> 2*9+1*3+2 = 23
  },
  {
    name: "FL",
    solverCorner: 5, // DFL
    solverEdge: 9, // FL
    cornerIndex: 18, // (-1, -1, 1) -> _x=0, _y=0, _z=2 -> 2*9+0*3+0 = 18
    edgeIndex: 21, // (-1, 0, 1) -> _x=0, _y=1, _z=2 -> 2*9+1*3+0 = 21
  },
  {
    name: "BL",
    solverCorner: 6, // DBL
    solverEdge: 10, // BL
    cornerIndex: 0, // (-1, -1, -1) -> _x=0, _y=0, _z=0 -> 0*9+0*3+0 = 0
    edgeIndex: 3, // (-1, 0, -1) -> _x=0, _y=1, _z=0 -> 0*9+1*3+0 = 3
  },
  {
    name: "BR",
    solverCorner: 7, // DBR
    solverEdge: 11, // BR
    cornerIndex: 2, // (1, -1, -1) -> _x=2, _y=0, _z=0 -> 0*9+0*3+2 = 2
    edgeIndex: 5, // (1, 0, -1) -> _x=2, _y=1, _z=0 -> 0*9+1*3+2 = 5
  },
];

export function getSlotByName(name: string): F2LSlot | undefined {
  return F2L_SLOTS.find((s) => s.name === name);
}
