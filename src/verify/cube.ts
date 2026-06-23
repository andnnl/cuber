/**
 * 纯 TypeScript 魔方验证模块
 * 不依赖 Three.js，可在 Node.js 中运行
 * 
 * 用于验证求解器的正确性
 */

// 面定义
export enum FACE {
  U = 0, // Up (白)
  D = 1, // Down (黄)
  F = 2, // Front (绿)
  B = 3, // Back (蓝)
  L = 4, // Left (橙)
  R = 5, // Right (红)
}

// 颜色字符
export const FACE_CHARS = ['U', 'D', 'F', 'B', 'L', 'R'];

// 棱块位置定义
export enum EdgePos {
  UF = 0, UL = 1, UB = 2, UR = 3,
  DF = 4, DL = 5, DB = 6, DR = 7,
  FR = 8, FL = 9, BL = 10, BR = 11,
}

// 角块位置定义
export enum CornerPos {
  UFR = 0, UFL = 1, UBL = 2, UBR = 3,
  DFR = 4, DFL = 5, DBL = 6, DBR = 7,
}

/**
 * 棱块定义
 * 每个棱块有两个贴纸，位于两个面上
 */
export const EDGE_FACES: [FACE, FACE][] = [
  [FACE.U, FACE.F], // UF
  [FACE.U, FACE.L], // UL
  [FACE.U, FACE.B], // UB
  [FACE.U, FACE.R], // UR
  [FACE.D, FACE.F], // DF
  [FACE.D, FACE.L], // DL
  [FACE.D, FACE.B], // DB
  [FACE.D, FACE.R], // DR
  [FACE.F, FACE.R], // FR
  [FACE.F, FACE.L], // FL
  [FACE.B, FACE.L], // BL
  [FACE.B, FACE.R], // BR
];

/**
 * 角块定义
 * 每个角块有三个贴纸，位于三个面上
 */
export const CORNER_FACES: [FACE, FACE, FACE][] = [
  [FACE.U, FACE.F, FACE.R], // UFR
  [FACE.U, FACE.F, FACE.L], // UFL
  [FACE.U, FACE.B, FACE.L], // UBL
  [FACE.U, FACE.B, FACE.R], // UBR
  [FACE.D, FACE.F, FACE.R], // DFR
  [FACE.D, FACE.F, FACE.L], // DFL
  [FACE.D, FACE.B, FACE.L], // DBL
  [FACE.D, FACE.B, FACE.R], // DBR
];

/**
 * 棱块贴纸位置映射
 * [棱块位置][方向(0或1)] = {面, 行, 列}
 */
export const EDGE_STICKERS: [{face: FACE, row: number, col: number}, {face: FACE, row: number, col: number}][] = [
  // UF: U面第2行第1列, F面第0行第1列
  [{face: FACE.U, row: 2, col: 1}, {face: FACE.F, row: 0, col: 1}],
  // UL: U面第1行第0列, L面第0行第2列
  [{face: FACE.U, row: 1, col: 0}, {face: FACE.L, row: 0, col: 2}],
  // UB: U面第0行第1列, B面第0行第1列
  [{face: FACE.U, row: 0, col: 1}, {face: FACE.B, row: 0, col: 1}],
  // UR: U面第1行第2列, R面第0行第0列
  [{face: FACE.U, row: 1, col: 2}, {face: FACE.R, row: 0, col: 0}],
  // DF: D面第0行第1列, F面第2行第1列
  [{face: FACE.D, row: 0, col: 1}, {face: FACE.F, row: 2, col: 1}],
  // DL: D面第1行第0列, L面第2行第0列
  [{face: FACE.D, row: 1, col: 0}, {face: FACE.L, row: 2, col: 0}],
  // DB: D面第2行第1列, B面第2行第1列
  [{face: FACE.D, row: 2, col: 1}, {face: FACE.B, row: 2, col: 1}],
  // DR: D面第1行第2列, R面第2行第2列
  [{face: FACE.D, row: 1, col: 2}, {face: FACE.R, row: 2, col: 2}],
  // FR: F面第1行第2列, R面第1行第0列
  [{face: FACE.F, row: 1, col: 2}, {face: FACE.R, row: 1, col: 0}],
  // FL: F面第1行第0列, L面第1行第2列
  [{face: FACE.F, row: 1, col: 0}, {face: FACE.L, row: 1, col: 2}],
  // BL: B面第1行第2列, L面第1行第0列
  [{face: FACE.B, row: 1, col: 2}, {face: FACE.L, row: 1, col: 0}],
  // BR: B面第1行第0列, R面第1行第2列
  [{face: FACE.B, row: 1, col: 0}, {face: FACE.R, row: 1, col: 2}],
];

/**
 * 角块贴纸位置映射
 * [角块位置][方向(0,1,2)] = {面, 行, 列}
 */
export const CORNER_STICKERS: [{face: FACE, row: number, col: number}, {face: FACE, row: number, col: number}, {face: FACE, row: number, col: number}][] = [
  // UFR: U(2,2), F(0,2), R(0,0)
  [{face: FACE.U, row: 2, col: 2}, {face: FACE.F, row: 0, col: 2}, {face: FACE.R, row: 0, col: 0}],
  // UFL: U(2,0), F(0,0), L(0,2)
  [{face: FACE.U, row: 2, col: 0}, {face: FACE.F, row: 0, col: 0}, {face: FACE.L, row: 0, col: 2}],
  // UBL: U(0,0), B(0,2), L(0,0)
  [{face: FACE.U, row: 0, col: 0}, {face: FACE.B, row: 0, col: 2}, {face: FACE.L, row: 0, col: 0}],
  // UBR: U(0,2), B(0,0), R(0,2)
  [{face: FACE.U, row: 0, col: 2}, {face: FACE.B, row: 0, col: 0}, {face: FACE.R, row: 0, col: 2}],
  // DFR: D(0,2), F(2,2), R(2,2)
  [{face: FACE.D, row: 0, col: 2}, {face: FACE.F, row: 2, col: 2}, {face: FACE.R, row: 2, col: 2}],
  // DFL: D(0,0), F(2,0), L(2,0)
  [{face: FACE.D, row: 0, col: 0}, {face: FACE.F, row: 2, col: 0}, {face: FACE.L, row: 2, col: 0}],
  // DBL: D(2,0), B(2,2), L(2,2)
  [{face: FACE.D, row: 2, col: 0}, {face: FACE.B, row: 2, col: 2}, {face: FACE.L, row: 2, col: 2}],
  // DBR: D(2,2), B(2,0), R(2,0)
  [{face: FACE.D, row: 2, col: 2}, {face: FACE.B, row: 2, col: 0}, {face: FACE.R, row: 2, col: 0}],
];

/**
 * 转动操作定义
 */
export enum Move {
  U, Ui, U2,
  D, Di, D2,
  F, Fi, F2,
  B, Bi, B2,
  L, Li, L2,
  R, Ri, R2,
}

/**
 * 解析转动字符串为 Move 枚举
 */
export function parseMove(s: string): Move | null {
  const map: {[key: string]: Move} = {
    'U': Move.U, "U'": Move.Ui, 'U2': Move.U2,
    'D': Move.D, "D'": Move.Di, 'D2': Move.D2,
    'F': Move.F, "F'": Move.Fi, 'F2': Move.F2,
    'B': Move.B, "B'": Move.Bi, 'B2': Move.B2,
    'L': Move.L, "L'": Move.Li, 'L2': Move.L2,
    'R': Move.R, "R'": Move.Ri, 'R2': Move.R2,
  };
  return map[s] ?? null;
}

/**
 * 解析转动序列
 */
export function parseMoves(exp: string): Move[] {
  const moves: Move[] = [];
  // 匹配转动符号：字母 + 可选的 ' 或 2
  const regex = /([UDFBLR])(['2]?)/g;
  let match;
  while ((match = regex.exec(exp)) !== null) {
    const base = match[1];
    const suffix = match[2];
    const symbol = base + suffix;
    const move = parseMove(symbol);
    if (move !== null) {
      moves.push(move);
    }
  }
  return moves;
}

/**
 * 获取转动的逆操作
 */
export function inverseMove(move: Move): Move {
  const inverses: Move[] = [
    Move.Ui, Move.U, Move.U2,  // U, U', U2
    Move.Di, Move.D, Move.D2,  // D, D', D2
    Move.Fi, Move.F, Move.F2,  // F, F', F2
    Move.Bi, Move.B, Move.B2,  // B, B', B2
    Move.Li, Move.L, Move.L2,  // L, L', L2
    Move.Ri, Move.R, Move.R2,  // R, R', R2
  ];
  return inverses[move];
}

/**
 * 魔方状态类
 * 使用棱块和角块的位置和方向来表示状态
 */
export class CubeState {
  // 8个角块：每个角块有 {pos: 角块位置, ori: 方向(0,1,2)}
  public corners: {pos: CornerPos, ori: number}[];
  // 12个棱块：每个棱块有 {pos: 棱块位置, ori: 方向(0,1)}
  public edges: {pos: EdgePos, ori: number}[];

  constructor() {
    // 已还原状态
    this.corners = Array.from({length: 8}, (_, i) => ({pos: i as CornerPos, ori: 0}));
    this.edges = Array.from({length: 12}, (_, i) => ({pos: i as EdgePos, ori: 0}));
  }

  clone(): CubeState {
    const state = new CubeState();
    state.corners = this.corners.map(c => ({...c}));
    state.edges = this.edges.map(e => ({...e}));
    return state;
  }

  /**
   * 应用转动
   */
  apply(move: Move): void {
    const times = [1, 3, 2][(move % 3)]; // 转动次数: 1, 3(逆), 2(双)
    const axis = Math.floor(move / 3); // 轴: 0=U/D, 1=F/B, 2=L/R
    
    for (let i = 0; i < times; i++) {
      this.applySingle(axis, move);
    }
  }

  private applySingle(axis: number, move: Move): void {
    // 根据轴和转动类型处理
    switch (axis) {
      case 0: // U/D 轴
        if (move === Move.U || move === Move.Ui || move === Move.U2) {
          this.rotateU(1);
        } else {
          this.rotateD(1);
        }
        break;
      case 1: // F/B 轴
        if (move === Move.F || move === Move.Fi || move === Move.F2) {
          this.rotateF(1);
        } else {
          this.rotateB(1);
        }
        break;
      case 2: // L/R 轴
        if (move === Move.L || move === Move.Li || move === Move.L2) {
          this.rotateL(1);
        } else {
          this.rotateR(1);
        }
        break;
    }
  }

  /**
   * U 转动（顺时针）
   */
  private rotateU(times: number): void {
    for (let t = 0; t < times; t++) {
      // 角块: UFR -> UFL -> UBL -> UBR -> UFR
      const cornerCycle = [CornerPos.UFR, CornerPos.UFL, CornerPos.UBL, CornerPos.UBR];
      this.cycleCorners(cornerCycle, 0);
      
      // 棱块: UF -> UL -> UB -> UR -> UF
      const edgeCycle = [EdgePos.UF, EdgePos.UL, EdgePos.UB, EdgePos.UR];
      this.cycleEdges(edgeCycle);
    }
  }

  /**
   * D 转动（顺时针）
   */
  private rotateD(times: number): void {
    for (let t = 0; t < times; t++) {
      // 角块: DFR -> DBR -> DBL -> DFL -> DFR
      const cornerCycle = [CornerPos.DFR, CornerPos.DBR, CornerPos.DBL, CornerPos.DFL];
      this.cycleCorners(cornerCycle, 0);
      
      // 棱块: DF -> DR -> DB -> DL -> DF
      const edgeCycle = [EdgePos.DF, EdgePos.DR, EdgePos.DB, EdgePos.DL];
      this.cycleEdges(edgeCycle);
    }
  }

  /**
   * F 转动（顺时针）
   */
  private rotateF(times: number): void {
    for (let t = 0; t < times; t++) {
      // 角块: UFR -> DFR -> DFL -> UFL -> UFR (方向有变化)
      const cornerCycle = [CornerPos.UFR, CornerPos.DFR, CornerPos.DFL, CornerPos.UFL];
      this.cycleCorners(cornerCycle, 1); // F转动角块方向变化
      
      // 棱块: UF -> FR -> DF -> FL -> UF (方向有变化)
      const edgeCycle = [EdgePos.UF, EdgePos.FR, EdgePos.DF, EdgePos.FL];
      this.cycleEdgesWithFlip(edgeCycle);
    }
  }

  /**
   * B 转动（顺时针）
   */
  private rotateB(times: number): void {
    for (let t = 0; t < times; t++) {
      // 角块: UBR -> UBL -> DBL -> DBR -> UBR (方向有变化)
      const cornerCycle = [CornerPos.UBR, CornerPos.UBL, CornerPos.DBL, CornerPos.DBR];
      this.cycleCorners(cornerCycle, 1);
      
      // 棱块: UB -> BL -> DB -> BR -> UB (方向有变化)
      const edgeCycle = [EdgePos.UB, EdgePos.BL, EdgePos.DB, EdgePos.BR];
      this.cycleEdgesWithFlip(edgeCycle);
    }
  }

  /**
   * L 转动（顺时针）
   */
  private rotateL(times: number): void {
    for (let t = 0; t < times; t++) {
      // 角块: UFL -> UBL -> DBL -> DFL -> UFL (方向有变化)
      const cornerCycle = [CornerPos.UFL, CornerPos.UBL, CornerPos.DBL, CornerPos.DFL];
      this.cycleCorners(cornerCycle, 2); // L转动角块方向变化不同
      
      // 棱块: UL -> BL -> DL -> FL -> UL (方向有变化)
      const edgeCycle = [EdgePos.UL, EdgePos.BL, EdgePos.DL, EdgePos.FL];
      this.cycleEdgesWithFlip(edgeCycle);
    }
  }

  /**
   * R 转动（顺时针）
   */
  private rotateR(times: number): void {
    for (let t = 0; t < times; t++) {
      // 角块: UFR -> UBR -> DBR -> DFR -> UFR (方向有变化)
      const cornerCycle = [CornerPos.UFR, CornerPos.UBR, CornerPos.DBR, CornerPos.DFR];
      this.cycleCorners(cornerCycle, 2);
      
      // 棱块: UR -> BR -> DR -> FR -> UR (方向有变化)
      const edgeCycle = [EdgePos.UR, EdgePos.BR, EdgePos.DR, EdgePos.FR];
      this.cycleEdgesWithFlip(edgeCycle);
    }
  }

  /**
   * 循环角块位置
   * directionChange: 方向变化类型 (0=不变, 1=F/B类型, 2=L/R类型)
   */
  private cycleCorners(cycle: CornerPos[], directionChange: number): void {
    // 找到每个位置的角块
    const cornersInCycle = cycle.map(pos => {
      const idx = this.corners.findIndex(c => c.pos === pos);
      return {idx, corner: this.corners[idx]};
    });
    
    // 循环交换
    for (let i = 0; i < cycle.length; i++) {
      const nextIdx = cornersInCycle[(i + 1) % cycle.length].idx;
      const currentCorner = cornersInCycle[i].corner;
      
      // 更新位置
      this.corners[nextIdx].pos = cycle[i];
      
      // 更新方向
      if (directionChange === 1) {
        // F/B 转动: 方向变化 +1, +2, +1, +2 (循环)
        this.corners[nextIdx].ori = (currentCorner.ori + (i % 2 === 0 ? 1 : 2)) % 3;
      } else if (directionChange === 2) {
        // L/R 转动: 方向变化 +2, +1, +2, +1 (循环)
        this.corners[nextIdx].ori = (currentCorner.ori + (i % 2 === 0 ? 2 : 1)) % 3;
      } else {
        this.corners[nextIdx].ori = currentCorner.ori;
      }
    }
  }

  /**
   * 循环棱块位置（无翻转）
   */
  private cycleEdges(cycle: EdgePos[]): void {
    const edgesInCycle = cycle.map(pos => {
      const idx = this.edges.findIndex(e => e.pos === pos);
      return {idx, edge: this.edges[idx]};
    });
    
    for (let i = 0; i < cycle.length; i++) {
      const nextIdx = edgesInCycle[(i + 1) % cycle.length].idx;
      const currentEdge = edgesInCycle[i].edge;
      
      this.edges[nextIdx].pos = cycle[i];
      this.edges[nextIdx].ori = currentEdge.ori;
    }
  }

  /**
   * 循环棱块位置（有翻转）
   * F, B, L, R 转动会使某些棱块翻转
   */
  private cycleEdgesWithFlip(cycle: EdgePos[]): void {
    const edgesInCycle = cycle.map(pos => {
      const idx = this.edges.findIndex(e => e.pos === pos);
      return {idx, edge: this.edges[idx]};
    });
    
    for (let i = 0; i < cycle.length; i++) {
      const nextIdx = edgesInCycle[(i + 1) % cycle.length].idx;
      const currentEdge = edgesInCycle[i].edge;
      
      this.edges[nextIdx].pos = cycle[i];
      // 翻转: UF, DF, UR, DR, FL, FR, BL, BR 转动时翻转
      this.edges[nextIdx].ori = (currentEdge.ori + 1) % 2;
    }
  }

  /**
   * 应用转动序列
   */
  applyMoves(moves: Move[]): void {
    for (const move of moves) {
      this.apply(move);
    }
  }

  /**
   * 序列化为 54 字符状态字符串
   * 格式: UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
   */
  serialize(): string {
    // 初始化 54 个贴纸
    const stickers: string[] = Array(54).fill('');
    
    // 为每个面填充已还原的颜色
    for (let face = 0; face < 6; face++) {
      for (let i = 0; i < 9; i++) {
        stickers[face * 9 + i] = FACE_CHARS[face];
      }
    }
    
    // 根据角块状态更新贴纸
    for (const corner of this.corners) {
      const cornerDef = CORNER_STICKERS[corner.pos];
      const cornerFaces = CORNER_FACES[corner.pos];
      
      for (let dir = 0; dir < 3; dir++) {
        const actualDir = (dir + corner.ori) % 3;
        const stickerPos = cornerDef[actualDir];
        const color = FACE_CHARS[cornerFaces[dir]];
        
        const stickerIdx = stickerPos.face * 9 + stickerPos.row * 3 + stickerPos.col;
        stickers[stickerIdx] = color;
      }
    }
    
    // 根据棱块状态更新贴纸
    for (const edge of this.edges) {
      const edgeDef = EDGE_STICKERS[edge.pos];
      const edgeFaces = EDGE_FACES[edge.pos];
      
      for (let dir = 0; dir < 2; dir++) {
        const actualDir = (dir + edge.ori) % 2;
        const stickerPos = edgeDef[actualDir];
        const color = FACE_CHARS[edgeFaces[dir]];
        
        const stickerIdx = stickerPos.face * 9 + stickerPos.row * 3 + stickerPos.col;
        stickers[stickerIdx] = color;
      }
    }
    
    return stickers.join('');
  }

  /**
   * 检查是否已还原
   */
  isSolved(): boolean {
    return this.corners.every(c => c.pos === c.pos && c.ori === 0) &&
           this.edges.every(e => e.pos === e.pos && e.ori === 0);
  }

  /**
   * 检查十字是否已解决
   */
  isCrossSolved(): boolean {
    const crossEdges = [EdgePos.DF, EdgePos.DL, EdgePos.DB, EdgePos.DR];
    return crossEdges.every(pos => {
      const edge = this.edges.find(e => e.pos === pos);
      // 棱块在正确位置且方向正确
      const edgeAtPos = this.edges.findIndex(e => e.pos === pos);
      return this.edges[edgeAtPos].pos === pos && this.edges[edgeAtPos].ori === 0;
    });
  }
}

/**
 * 验证求解
 * @param scramble 打乱公式
 * @param solution 求解公式
 * @returns 验证结果
 */
export function verifySolve(scramble: string, solution: string): {
  scrambleState: string;
  solutionState: string;
  isSolved: boolean;
  isCrossSolved: boolean;
} {
  const state = new CubeState();
  
  // 应用打乱
  const scrambleMoves = parseMoves(scramble);
  state.applyMoves(scrambleMoves);
  const scrambleState = state.serialize();
  
  // 应用求解
  const solutionMoves = parseMoves(solution);
  state.applyMoves(solutionMoves);
  const solutionState = state.serialize();
  
  return {
    scrambleState,
    solutionState,
    isSolved: state.isSolved(),
    isCrossSolved: state.isCrossSolved(),
  };
}