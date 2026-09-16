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

// 54 串 → 3D 贴纸位置坐标 (遍历顺序与 BleCrossTrainer FACELET_TARGETS 一致):
// U: z升序 x升序 y=+1; R: y降序 z降序 x=+1; F: y降序 x升序 z=+1;
// D: z降序 x升序 y=-1; L: y降序 z升序 x=-1; B: y降序 x降序 z=-1
// 注意: 面法线分量取 ±1.5 (贴纸外表面位置) 而非 ±1 (块中心) —— 角块 3 个面的贴纸
// 若都记块中心坐标会重合 (如 (1,1,1) 同时是 U/R/F 贴纸), 查找表将产生重复键。
const FACELEFT_POS: [number, number, number][] = (() => {
  const list: [number, number, number][] = [];
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) list.push([x - 1, 1.5, z - 1]); // U
  for (let y = 2; y >= 0; y--) for (let z = 2; z >= 0; z--) list.push([1.5, y - 1, z - 1]); // R
  for (let y = 2; y >= 0; y--) for (let x = 0; x < 3; x++) list.push([x - 1, y - 1, 1.5]); // F
  for (let z = 2; z >= 0; z--) for (let x = 0; x < 3; x++) list.push([x - 1, -1.5, z - 1]); // D
  for (let y = 2; y >= 0; y--) for (let z = 0; z < 3; z++) list.push([-1.5, y - 1, z - 1]); // L
  for (let y = 2; y >= 0; y--) for (let x = 2; x >= 0; x--) list.push([x - 1, y - 1, -1.5]); // B
  return list;
})();
const POS_TO_FACELEFT: { [k: string]: number } = (() => {
  const m: { [k: string]: number } = {};
  FACELEFT_POS.forEach((p, i) => {
    m[p.join(",")] = i;
  });
  return m;
})();

/**
 * z2 = 整体绕前后轴 (F/B 轴) 旋转 180° (自逆): U↔D, R↔L, F/B 面内自转 180°。
 * 用于物理魔方参考姿态 (黄顶绿前) 与 3D 标准姿态 (白顶绿前) 的 facelet 帧互转。
 * 实现按贴纸位置 (x,y,z) → (-x,-y,z) 位移贴纸, 与 CrossF2LTrainer/pieces.ts 的
 * rotatePositionIndex(axis='z', times=2) 同语义。
 */
export function z2Facelets(facelets: string): string {
  const out: string[] = new Array(54);
  for (let i = 0; i < 54; i++) {
    const [x, y, z] = FACELEFT_POS[i];
    out[i] = facelets[POS_TO_FACELEFT[`${-x},${-y},${z}`]];
  }
  return out.join("");
}

/** z2 共轭转动: 物理帧转动 → 3D 帧转动 (U↔D, R↔L; F/B 不变; ' 与 2 后缀保留) */
export function z2Move(move: string): string {
  const face = move.charAt(0);
  const rest = move.slice(1);
  const map: { [k: string]: string } = { U: "D", D: "U", R: "L", L: "R" };
  return (map[face] || face) + rest;
}

/**
 * 训练帧变换 (自逆): 白色十字 ⇄ 标准 D 面十字。
 * 智能魔方以核心为坐标系 (中心恒 URFDLB); 用户校准后白色中心位于核心 U 轴,
 * 还原的白色十字 (4 条白棱围住白色中心) 位于核心 U 面, 而 isCrossDone 判定与
 * Kociemba 求解器均面向标准 D 面十字。判定/求解前先用本变换把状态转入训练帧。
 * 实现 = 位置置换 z2Facelets (r) + 面字母原地换名 U↔D/R↔L (ρ) 复合, T = ρ∘r;
 * T(solved) = solved, 且转动共轭恒等式 T∘M_f∘T = M_{z2Move(f)} 成立 ——
 * 训练帧下求得的解需逐记号 z2Move 换回核心帧后再作用于实物/3D。
 */
export function toTrainFrame(facelets: string): string {
  const swapped = z2Facelets(facelets);
  let out = "";
  for (let i = 0; i < swapped.length; i++) {
    const ch = swapped[i];
    out += ch === "U" ? "D" : ch === "D" ? "U" : ch === "R" ? "L" : ch === "L" ? "R" : ch;
  }
  return out;
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
 * 相邻同面转动合并 (HTM 口径): D,D→D2; R,R,R→R'; R,R'→抵消。
 * 智能魔方对 180° 转发 2 个 1/4 转 MOVE 事件, 步数统计/展示需与
 * 求解器解法的记号数 (D2 计 1 步) 对齐时先用此函数化简。
 */
export function simplifyMoves(moves: string[]): string[] {
  const amt = (m: string) => (m.endsWith("2") ? 2 : m.endsWith("'") ? 3 : 1);
  const name = (f: string, a: number) => (a === 2 ? f + "2" : a === 3 ? f + "'" : f);
  // 栈内不变量: 相邻项异面 (同面已在入栈前合并)
  const stack: { f: string; a: number }[] = [];
  for (const mv of moves) {
    const f = mv.charAt(0);
    const top = stack.length > 0 ? stack[stack.length - 1] : null;
    if (top && top.f === f) {
      const a = (top.a + amt(mv)) % 4;
      stack.pop();
      if (a !== 0) {
        stack.push({ f, a });
      }
    } else {
      stack.push({ f, a: amt(mv) });
    }
  }
  return stack.map((s) => name(s.f, s.a));
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
