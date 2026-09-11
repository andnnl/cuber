// 转动记号引擎: Kociemba facelet 串层面的单步转动应用 + 状态差分
//
// 用于: ① 3D 镜像的 resync (facelets 与本地推演不符时) ② mock 回放 ③ 打乱目标态推演。
// 采用 Kociemba 标准角/棱置换表 (cubie 层面), 用 vendor utils.ts 注释中的
// "F R 后状态串" 官方样例做回归验证 (见 scripts/test-ble.js)。

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

// 角块: URF=0 UFL=1 ULB=2 UBR=3 DFR=4 DLF=5 DBL=6 DRB=7 (与 vendor CORNER_FACELET_MAP 同序)
// 棱块: UR=0 UF=1 UL=2 UB=3 DR=4 DF=5 DL=6 DB=7 FR=8 FL=9 BL=10 BR=11 (与 vendor EDGE_FACELET_MAP 同序)

const CORNER_FACELET_MAP = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
const EDGE_FACELET_MAP = [
  [5, 10], [7, 19], [3, 37], [1, 46],
  [32, 16], [28, 25], [30, 43], [34, 52],
  [23, 12], [21, 41], [50, 39], [48, 14],
];

// 单步转动置换表 (新位置 i 从旧位置 perm[i] 取块; ori 为朝向增量)
const FACE_NAMES = "URFDLB";
type MoveTable = { cp: number[]; co: number[]; ep: number[]; eo: number[] };

const U: MoveTable = {
  cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0],
  ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
const D: MoveTable = {
  cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0],
  ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
const R: MoveTable = {
  cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2],
  ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
const L: MoveTable = {
  cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0],
  ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
const F: MoveTable = {
  cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0],
  ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
};
const B: MoveTable = {
  cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1],
  ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1],
};
const TABLES: { [face: string]: MoveTable } = { U, R, F, D, L, B };

/** cubie 状态 (CP/CO/EP/EO) */
export interface CubieState { cp: number[]; co: number[]; ep: number[]; eo: number[]; }

export function solvedCubie(): CubieState {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

/** 在 cubie 层面应用单步转动 (face: U/R/F/D/L/B, amount: 1=CW 2=180 3=CCW) */
export function applyCubieMove(state: CubieState, face: string, amount: number): CubieState {
  const t = TABLES[face];
  const res: CubieState = { cp: state.cp.slice(), co: state.co.slice(), ep: state.ep.slice(), eo: state.eo.slice() };
  for (let n = 0; n < amount; n++) {
    const cp = res.cp.slice(), co = res.co.slice(), ep = res.ep.slice(), eo = res.eo.slice();
    for (let i = 0; i < 8; i++) {
      res.cp[i] = cp[t.cp[i]];
      res.co[i] = (co[t.cp[i]] + t.co[i]) % 3;
    }
    for (let i = 0; i < 12; i++) {
      res.ep[i] = ep[t.ep[i]];
      res.eo[i] = (eo[t.ep[i]] + t.eo[i]) % 2;
    }
  }
  return res;
}

/** cubie → Kociemba facelet 串 (与 vendor toKociembaFacelets 同语义) */
export function cubieToFacelets(s: CubieState): string {
  const faces = FACE_NAMES;
  const out: string[] = [];
  for (let i = 0; i < 54; i++) out[i] = faces[Math.floor(i / 9)];
  for (let i = 0; i < 8; i++) {
    for (let p = 0; p < 3; p++) {
      out[CORNER_FACELET_MAP[i][(p + s.co[i]) % 3]] = faces[Math.floor(CORNER_FACELET_MAP[s.cp[i]][p] / 9)];
    }
  }
  for (let i = 0; i < 12; i++) {
    for (let p = 0; p < 2; p++) {
      out[EDGE_FACELET_MAP[i][(p + s.eo[i]) % 2]] = faces[Math.floor(EDGE_FACELET_MAP[s.ep[i]][p] / 9)];
    }
  }
  return out.join("");
}

/** facelet 串 → cubie (按贴纸组合匹配块与朝向, 非法返回 null) */
export function faceletsToCubie(facelets: string): CubieState | null {
  const cp: number[] = [], co: number[] = [], ep: number[] = [], eo: number[] = [];
  for (let i = 0; i < 8; i++) {
    const s = CORNER_FACELET_MAP[i].map((idx) => facelets[idx]);
    let found = false;
    for (let piece = 0; piece < 8 && !found; piece++) {
      const home = CORNER_FACELET_MAP[piece].map((idx) => SOLVED[idx]);
      for (let o = 0; o < 3 && !found; o++) {
        // toKociembaFacelets 语义: sticker[(j+co)%3] = piece 的第 j 个 home 色
        let ok = true;
        for (let j = 0; j < 3; j++) {
          if (s[(j + o) % 3] !== home[j]) { ok = false; break; }
        }
        if (ok) { cp.push(piece); co.push(o); found = true; }
      }
    }
    if (!found) return null;
  }
  for (let i = 0; i < 12; i++) {
    const s = EDGE_FACELET_MAP[i].map((idx) => facelets[idx]);
    let found = false;
    for (let piece = 0; piece < 12 && !found; piece++) {
      const home = EDGE_FACELET_MAP[piece].map((idx) => SOLVED[idx]);
      for (let o = 0; o < 2 && !found; o++) {
        let ok = true;
        for (let j = 0; j < 2; j++) {
          if (s[(j + o) % 2] !== home[j]) { ok = false; break; }
        }
        if (ok) { ep.push(piece); eo.push(o); found = true; }
      }
    }
    if (!found) return null;
  }
  return { cp, co, ep, eo };
}

/** 在 facelet 串层面应用一步转动 (move 形如 "R" / "R'" / "R2") */
export function applyFaceletMove(facelets: string, move: string): string | null {
  const state = faceletsToCubie(facelets);
  if (!state) return null;
  const m = move.trim();
  const face = m[0];
  if (FACE_NAMES.indexOf(face) < 0) return null;
  const amount = m.length > 1 ? (m[1] === "2" ? 2 : m[1] === "'" ? 3 : 0) : 1;
  if (amount === 0) return null;
  return cubieToFacelets(applyCubieMove(state, face, amount));
}

/** 公式推演: solved 经 moves 应用后的 facelet 串 (空格分隔记号) */
export function applyFormula(moves: string): string {
  return applyFormulaFrom(SOLVED, moves);
}

/** 公式推演: 从指定状态起应用 moves (打乱目标态 = 当前态 + 打乱公式) */
export function applyFormulaFrom(start: string, moves: string): string {
  let state = start;
  for (const token of moves.trim().split(/\s+/)) {
    if (!token) continue;
    const next = applyFaceletMove(state, token);
    if (next === null) return start;
    state = next;
  }
  return state;
}

/** 转动记号取逆: R→R', R'→R, R2→R2 */
export function invertMove(move: string): string {
  if (move.endsWith("2")) {
    return move;
  }
  return move.endsWith("'") ? move.slice(0, -1) : move + "'";
}

/**
 * 状态差分 → 转动记号序列。
 * 先尝试单步 (18 种), 再尝试两步组合 (快速连转一帧内多次转动的兜底);
 * 无法用 ≤2 步解释的差异返回 null (调用方应以 facelets 全量 resync)。
 */
export function diffToMoves(prev: string, next: string): string[] | null {
  if (prev === next) return [];
  const single: string[] = [];
  for (const face of FACE_NAMES) {
    single.push(face, face + "'", face + "2");
  }
  for (const mv of single) {
    if (applyFaceletMove(prev, mv) === next) return [mv];
  }
  for (const a of single) {
    const mid = applyFaceletMove(prev, a);
    if (!mid) continue;
    for (const b of single) {
      if (applyFaceletMove(mid, b) === next) return [a, b];
    }
  }
  return null;
}
