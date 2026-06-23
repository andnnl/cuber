/**
 * cuber 验证模块
 */

const CORNER_POSITIONS = {
  UFR: 0, UFL: 1, UBL: 2, UBR: 3,
  DFR: 4, DFL: 5, DBL: 6, DBR: 7
};

const EDGE_POSITIONS = {
  UF: 0, UL: 1, UB: 2, UR: 3,
  DF: 4, DL: 5, DB: 6, DR: 7,
  FR: 8, FL: 9, BL: 10, BR: 11
};

const CORNER_FACE_MAP = [
  ['U', 'R', 'F'],
  ['U', 'F', 'L'],
  ['U', 'L', 'B'],
  ['U', 'B', 'R'],
  ['D', 'F', 'R'],
  ['D', 'L', 'F'],
  ['D', 'B', 'L'],
  ['D', 'R', 'B']
];

const EDGE_FACE_MAP = [
  ['U', 'F'],
  ['U', 'L'],
  ['U', 'B'],
  ['U', 'R'],
  ['D', 'F'],
  ['D', 'L'],
  ['D', 'B'],
  ['D', 'R'],
  ['F', 'R'],
  ['F', 'L'],
  ['B', 'L'],
  ['B', 'R']
];

const CORNER_STICKER_IDX = {
  U: [8, 6, 0, 2, 2, 0, 6, 8],
  R: [0, 2, 2, 0, 6, 2, 2, 8],
  F: [2, 0, 0, 2, 8, 6, 8, 6],
  D: [2, 0, 6, 8, 2, 0, 6, 8],
  L: [2, 2, 0, 0, 8, 8, 6, 6],
  B: [2, 2, 2, 0, 8, 8, 8, 6]
};

const EDGE_STICKER_IDX = {
  U: [7, 3, 1, 5, null, null, null, null, null, null, null, null],
  D: [null, null, null, null, 1, 3, 7, 5, null, null, null, null],
  F: [1, null, null, null, 7, null, null, null, 5, 3, null, null],
  B: [null, null, 1, null, null, null, 7, null, null, null, 5, 3],
  R: [null, null, null, 1, null, null, null, 7, 3, null, null, 5],
  L: [null, 1, null, null, null, 7, null, null, null, 5, 3, null]
};

const MOVE_CYCLES = {
  U: { corners: [0, 1, 2, 3], edges: [0, 1, 2, 3], cornerOriChanges: [0, 0, 0, 0], edgeOri: 0 },
  D: { corners: [4, 5, 6, 7], edges: [4, 5, 6, 7], cornerOriChanges: [0, 0, 0, 0], edgeOri: 0 },
  F: { corners: [0, 4, 5, 1], edges: [0, 8, 4, 9], cornerOriChanges: [1, 2, 1, 2], edgeOri: 1 },
  B: { corners: [2, 6, 5, 1], edges: [2, 10, 6, 9], cornerOriChanges: [1, 2, 1, 2], edgeOri: 1 },
  R: { corners: [0, 3, 7, 4], edges: [3, 11, 7, 8], cornerOriChanges: [2, 2, 1, 1], edgeOri: 0 },
  L: { corners: [1, 5, 6, 2], edges: [1, 9, 5, 10], cornerOriChanges: [1, 1, 2, 2], edgeOri: 0 }
};

class CubeState {
  constructor() {
    this.corners = Array.from({ length: 8 }, (_, i) => ({ pos: i, ori: 0 }));
    this.edges = Array.from({ length: 12 }, (_, i) => ({ pos: i, ori: 0 }));
  }

  isSolved() {
    return this.corners.every((c, i) => c.pos === i && c.ori === 0) &&
           this.edges.every((e, i) => e.pos === i && e.ori === 0);
  }

  isCrossSolved() {
    const crossEdges = [4, 7, 6, 5];
    return crossEdges.every(pos => {
      const idx = this.edges.findIndex(e => e.pos === pos);
      return this.edges[idx].ori === 0;
    });
  }

  applyMove(move) {
    const base = move.replace(/['2]/g, '');
    const isPrime = move.includes("'");
    const isDouble = move.includes("2");
    const times = isDouble ? 2 : 1;
    const dir = isPrime ? -1 : 1;

    const cycle = MOVE_CYCLES[base];
    if (!cycle) return;

    for (let t = 0; t < times; t++) {
      this._rotate(cycle, dir);
    }
  }

  _rotate(cycle, dir) {
    const { corners, edges, cornerOriChanges, edgeOri } = cycle;

    const cornerPositions = corners.map(i => this.corners[i]);
    const edgePositions = edges.map(i => this.edges[i]);

    for (let i = 0; i < corners.length; i++) {
      const srcIdx = dir > 0 ? (i - 1 + corners.length) % corners.length : (i + 1) % corners.length;
      const targetIdx = corners[i];
      let newOri = cornerPositions[srcIdx].ori;
      const oriChange = dir > 0 ? cornerOriChanges[i] : (3 - cornerOriChanges[(i + 1) % corners.length]) % 3;
      if (oriChange > 0) {
        newOri = (newOri + oriChange) % 3;
      }
      this.corners[targetIdx] = { pos: cornerPositions[srcIdx].pos, ori: newOri };
    }

    for (let i = 0; i < edges.length; i++) {
      const srcIdx = dir > 0 ? (i - 1 + edges.length) % edges.length : (i + 1) % edges.length;
      const targetIdx = edges[i];
      let newOri = edgePositions[srcIdx].ori;
      if (edgeOri > 0) {
        newOri = (newOri + (dir > 0 ? edgeOri : (2 - edgeOri))) % 2;
      }
      this.edges[targetIdx] = { pos: edgePositions[srcIdx].pos, ori: newOri };
    }
  }

  applyMoves(movesStr) {
    const moves = movesStr.split(/\s+/).filter(m => m.length > 0);
    for (const m of moves) {
      this.applyMove(m);
    }
  }

  serialize() {
    const faces = { U: 'U', R: 'R', F: 'F', D: 'D', L: 'L', B: 'B' };
    const result = {
      U: Array(9).fill('U'),
      R: Array(9).fill('R'),
      F: Array(9).fill('F'),
      D: Array(9).fill('D'),
      L: Array(9).fill('L'),
      B: Array(9).fill('B')
    };

    for (let i = 0; i < 8; i++) {
      const corner = this.corners[i];
      const physicalFaces = CORNER_FACE_MAP[corner.pos];
      const targetFaces = CORNER_FACE_MAP[i];
      for (let f = 0; f < 3; f++) {
        const srcFace = physicalFaces[(f + corner.ori) % 3];
        const targetFace = targetFaces[f];
        const stickerIdx = CORNER_STICKER_IDX[targetFace][i];
        result[targetFace][stickerIdx] = srcFace;
      }
    }

    for (let i = 0; i < 12; i++) {
      const edge = this.edges[i];
      const physicalFaces = EDGE_FACE_MAP[edge.pos];
      const targetFaces = EDGE_FACE_MAP[i];
      for (let f = 0; f < 2; f++) {
        const srcFace = physicalFaces[(f + edge.ori) % 2];
        const targetFace = targetFaces[f];
        const stickerIdx = EDGE_STICKER_IDX[targetFace][i];
        if (stickerIdx !== null) {
          result[targetFace][stickerIdx] = srcFace;
        }
      }
    }

    return result.U.join('') + result.R.join('') + result.F.join('') + 
           result.D.join('') + result.L.join('') + result.B.join('');
  }
}

function verifySolve(scramble, solution) {
  const state = new CubeState();
  state.applyMoves(scramble);
  const scrambleState = state.serialize();
  
  state.applyMoves(solution);
  const solutionState = state.serialize();
  
  return {
    scrambleState,
    solutionState,
    isCrossSolved: state.isCrossSolved(),
    isSolved: state.isSolved()
  };
}

module.exports = { CubeState, verifySolve };