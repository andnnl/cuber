import CubieCube from "./CubieCube";
import CoordCube from "./CoordCube";
import Util from "./Util";
import * as WasmSolver from "../wasm/WasmSolver";

export default class Solver {
  private static MAX_PRE_MOVES = 20;
  private static TRY_INVERSE = true;
  private static TRY_THREE_AXES = true;
  private static MIN_P1LENGTH_PRE = 7;
  private static MAX_DEPTH2 = 13;

  private valid1: number;
  private cc: CubieCube;
  private move: number[];
  private moveSol: number[] | null;
  private nodeUD: CoordCube[];
  private urfCubieCube: CubieCube[];
  private urfCoordCube: CoordCube[];
  private phase1Cubie: CubieCube[];
  private preMoveCubes: CubieCube[];
  private allowShorter: boolean;
  private preMoves: number[];
  private preMoveLen: number;
  private maxPreMoves: number;
  private sol: number;

  constructor() {
    CubieCube.Init();
    CoordCube.Init();

    this.move = [];
    this.moveSol = [];

    this.nodeUD = [];

    this.valid1 = 0;
    this.allowShorter = false;
    this.cc = new CubieCube();
    this.urfCubieCube = [];
    this.urfCoordCube = [];
    this.phase1Cubie = [];

    this.preMoveCubes = [];
    this.preMoves = [];
    this.preMoveLen = 0;
    this.maxPreMoves = 0;

    for (let i = 0; i < 21; i++) {
      this.nodeUD[i] = new CoordCube();
      this.phase1Cubie[i] = new CubieCube();
    }
    for (let i = 0; i < 6; i++) {
      this.urfCubieCube[i] = new CubieCube();
      this.urfCoordCube[i] = new CoordCube();
    }
    for (let i = 0; i < Solver.MAX_PRE_MOVES; i++) {
      this.preMoveCubes[i + 1] = new CubieCube();
    }
  }

  init(): void {
    CoordCube.Init();
  }

  solve(facelets: string): string {
    const valid = this.cc.deserialize(facelets);
    if (!valid) {
      return "error: invalid cube";
    }
    const verify = this.cc.verify();
    if (verify.length > 0) {
      return "error: " + verify;
    }
    this.sol = 22;
    this.moveSol = null;
    this.initSearch();
    const solution = this.search();
    return solution;
  }

  private conjMask: number;
  private initSearch(): void {
    this.conjMask = (Solver.TRY_INVERSE ? 0 : 0x38) | (Solver.TRY_THREE_AXES ? 0 : 0x36);
    this.maxPreMoves = this.conjMask > 7 ? 0 : Solver.MAX_PRE_MOVES;

    for (let i = 0; i < 6; i++) {
      this.urfCubieCube[i].copy(this.cc);
      this.urfCoordCube[i].setWithPrun(this.urfCubieCube[i], 20);
      this.cc.URFConjugate();
      if (i % 3 == 2) {
        this.cc.inverse();
      }
    }
  }

  private length1 = 0;
  private urfIdx = 0;
  private search(): string {
    for (this.length1 = 0; this.length1 < this.sol; this.length1++) {
      for (this.urfIdx = 0; this.urfIdx < 6; this.urfIdx++) {
        if ((this.conjMask & (1 << this.urfIdx)) != 0) {
          continue;
        }
        if (this.phase1PreMoves(this.maxPreMoves, -30, this.urfCubieCube[this.urfIdx]) == 0) {
          return this.moveSol == null ? "error: no solution for prob" : this.getSolution();
        }
      }
    }
    return this.moveSol == null ? "error: no solution for depth" : this.getSolution();
  }

  private getSolution(): string {
    let ret = "";
    if (!this.moveSol) {
      return ret;
    }
    const urf = this.urfIdx;
    if (urf < 3) {
      for (let s = 0; s < this.moveSol.length; ++s) {
        ret += Util.MOVE2STR[CubieCube.URFMove[urf][this.moveSol[s]]] + " ";
      }
    } else {
      for (let s = this.moveSol.length - 1; s >= 0; --s) {
        ret += Util.MOVE2STR[CubieCube.URFMove[urf][this.moveSol[s]]] + " ";
      }
    }
    return ret;
  }
  private depth1 = 0;

  private phase1PreMoves(maxl: number, lm: number, cc: CubieCube): number {
    this.preMoveLen = this.maxPreMoves - maxl;
    if (this.preMoveLen == 0 || ((0x36fb7 >> lm) & 1) == 0) {
      this.depth1 = this.length1 - this.preMoveLen;
      this.phase1Cubie[0].copy(cc) /* = cc*/;
      this.allowShorter = this.depth1 == Solver.MIN_P1LENGTH_PRE && this.preMoveLen != 0;

      if (
        this.nodeUD[this.depth1 + 1].setWithPrun(cc, this.depth1) &&
        this.phase1(this.nodeUD[this.depth1 + 1], this.depth1, -1) == 0
      ) {
        return 0;
      }
    }

    if (maxl == 0 || this.preMoveLen + Solver.MIN_P1LENGTH_PRE >= this.length1) {
      return 1;
    }

    let skipMoves = 0;
    if (maxl == 1 || this.preMoveLen + 1 + Solver.MIN_P1LENGTH_PRE >= this.length1) {
      //last pre move
      skipMoves |= 0x36fb7; // 11 0110 1111 1011 0111
    }

    lm = ~~(lm / 3) * 3;
    for (let m = 0; m < 18; m++) {
      if (m == lm || m == lm - 9 || m == lm + 9) {
        m += 2;
        continue;
      }
      if ((skipMoves & (1 << m)) != 0) {
        continue;
      }
      CubieCube.CornMult(CubieCube.MoveCube[m], cc, this.preMoveCubes[maxl]);
      CubieCube.EdgeMult(CubieCube.MoveCube[m], cc, this.preMoveCubes[maxl]);
      this.preMoves[this.maxPreMoves - maxl] = m;
      const ret = this.phase1PreMoves(maxl - 1, m, this.preMoveCubes[maxl]);
      if (ret == 0) {
        return 0;
      }
    }
    return 1;
  }

  private phase1(node: CoordCube, maxl: number, lm: number): number {
    if (node.prun == 0 && maxl < 5) {
      if (this.allowShorter || maxl == 0) {
        this.depth1 -= maxl;
        const ret = this.initPhase2Pre();
        this.depth1 += maxl;
        return ret;
      } else {
        return 1;
      }
    }
    for (let axis = 0; axis < 18; axis += 3) {
      if (axis == lm || axis == lm - 9) {
        continue;
      }
      for (let power = 0; power < 3; power++) {
        const m = axis + power;
        const prun = this.nodeUD[maxl].doMovePrun(node, m);
        if (prun > maxl) {
          break;
        } else if (prun == maxl) {
          continue;
        }

        this.move[this.depth1 - maxl] = m;
        this.valid1 = Math.min(this.valid1, this.depth1 - maxl);
        const ret = this.phase1(this.nodeUD[maxl], maxl - 1, axis);
        if (ret == 0) {
          return 0;
        } else if (ret == 2) {
          break;
        }
      }
    }
    return 1;
  }

  private initPhase2Pre(): number {
    for (let i = this.valid1; i < this.depth1; i++) {
      CubieCube.CornMult(this.phase1Cubie[i], CubieCube.MoveCube[this.move[i]], this.phase1Cubie[i + 1]);
      CubieCube.EdgeMult(this.phase1Cubie[i], CubieCube.MoveCube[this.move[i]], this.phase1Cubie[i + 1]);
    }
    this.valid1 = this.depth1;

    let ret = this.initPhase2(this.phase1Cubie[this.depth1]);
    if (ret == 0 || this.preMoveLen == 0 || ret == 2) {
      return ret;
    }

    const m = ~~(this.preMoves[this.preMoveLen - 1] / 3) * 3 + 1;
    CubieCube.CornMult(CubieCube.MoveCube[m], this.phase1Cubie[this.depth1], this.phase1Cubie[this.depth1 + 1]);
    CubieCube.EdgeMult(CubieCube.MoveCube[m], this.phase1Cubie[this.depth1], this.phase1Cubie[this.depth1 + 1]);

    this.preMoves[this.preMoveLen - 1] += 2 - (this.preMoves[this.preMoveLen - 1] % 3) * 2;
    ret = this.initPhase2(this.phase1Cubie[this.depth1 + 1]);
    this.preMoves[this.preMoveLen - 1] += 2 - (this.preMoves[this.preMoveLen - 1] % 3) * 2;
    return ret;
  }

  private initPhase2(phase2Cubie: CubieCube): number {
    let p2corn = phase2Cubie.CPermSym;
    const p2csym = p2corn & 0xf;
    p2corn >>= 4;
    let p2edge = phase2Cubie.EPermSym;
    const p2esym = p2edge & 0xf;
    p2edge >>= 4;
    const p2mid = phase2Cubie.MPerm;
    const p2edgei = CubieCube.GetPermSymInv(p2edge, p2esym, false);
    const p2corni = CubieCube.GetPermSymInv(p2corn, p2csym, true);
    const prun = Math.max(
      CoordCube.GetPruning(CoordCube.MCPermPrun, p2corn * CoordCube.N_MPERM + CoordCube.MPermConj[p2mid][p2csym]),
      CoordCube.GetPruning(
        CoordCube.EPermCCombPPrun,
        p2edge * CoordCube.N_COMB +
        CoordCube.CCombPConj[CubieCube.Perm2CombP[p2corn] & 0xff][CubieCube.SymMultInv[p2esym][p2csym]]
      ),
      CoordCube.GetPruning(
        CoordCube.EPermCCombPPrun,
        (p2edgei >> 4) * CoordCube.N_COMB +
        CoordCube.CCombPConj[CubieCube.Perm2CombP[p2corni >> 4] & 0xff][
        CubieCube.SymMultInv[p2edgei & 0xf][p2corni & 0xf]
        ]
      )
    );
    const maxDep2 = Math.min(Solver.MAX_DEPTH2, this.sol - this.length1);
    if (prun >= maxDep2) {
      return prun > maxDep2 ? 2 : 1;
    }
    let depth2;
    for (depth2 = maxDep2 - 1; depth2 >= prun; depth2--) {
      const ret = this.phase2(p2edge, p2esym, p2corn, p2csym, p2mid, depth2, this.depth1, 10);
      if (ret < 0) {
        break;
      }
      depth2 -= ret;
      this.moveSol = [];
      for (let i = 0; i < this.depth1 + depth2; i++) {
        this.appendSolMove(this.move[i]);
      }
      for (let i = this.preMoveLen - 1; i >= 0; i--) {
        this.appendSolMove(this.preMoves[i]);
      }
      this.sol = this.moveSol.length;
    }
    if (depth2 != maxDep2 - 1) {
      return 0;
    } else {
      return 1;
    }
  }

  private appendSolMove(move: number): void {
    if (!this.moveSol) {
      return;
    }
    if (this.moveSol.length == 0) {
      this.moveSol.push(move);
      return;
    }
    const axisCur = ~~(move / 3);
    const axisLast = ~~(this.moveSol[this.moveSol.length - 1] / 3);
    if (axisCur == axisLast) {
      const pow = ((move % 3) + (this.moveSol[this.moveSol.length - 1] % 3) + 1) % 4;
      if (pow == 3) {
        this.moveSol.pop();
      } else {
        this.moveSol[this.moveSol.length - 1] = axisCur * 3 + pow;
      }
      return;
    }
    if (
      this.moveSol.length > 1 &&
      axisCur % 3 == axisLast % 3 &&
      axisCur == ~~(this.moveSol[this.moveSol.length - 2] / 3)
    ) {
      const pow = ((move % 3) + (this.moveSol[this.moveSol.length - 2] % 3) + 1) % 4;
      if (pow == 3) {
        this.moveSol[this.moveSol.length - 2] = this.moveSol[this.moveSol.length - 1];
        this.moveSol.pop();
      } else {
        this.moveSol[this.moveSol.length - 2] = axisCur * 3 + pow;
      }
      return;
    }
    this.moveSol.push(move);
  }

  private phase2(
    edge: number,
    esym: number,
    corn: number,
    csym: number,
    mid: number,
    maxl: number,
    depth: number,
    lm: number
  ): number {
    if (edge == 0 && corn == 0 && mid == 0) {
      return maxl;
    }
    const moveMask = Util.CKMV2BIT[lm];
    for (let m = 0; m < 10; m++) {
      if (((moveMask >> m) & 1) != 0) {
        m += (0x42 >> m) & 3;
        continue;
      }
      const midx = CoordCube.MPermMove[mid][m];
      let cornx = CoordCube.CPermMove[corn][CubieCube.SymMoveUD[csym][m]];
      const csymx = CubieCube.SymMult[cornx & 0xf][csym];
      cornx >>= 4;
      let edgex = CoordCube.EPermMove[edge][CubieCube.SymMoveUD[esym][m]];
      const esymx = CubieCube.SymMult[edgex & 0xf][esym];
      edgex >>= 4;
      const edgei = CubieCube.GetPermSymInv(edgex, esymx, false);
      const corni = CubieCube.GetPermSymInv(cornx, csymx, true);
      let prun = CoordCube.GetPruning(
        CoordCube.EPermCCombPPrun,
        (edgei >> 4) * CoordCube.N_COMB +
        CoordCube.CCombPConj[CubieCube.Perm2CombP[corni >> 4] & 0xff][CubieCube.SymMultInv[edgei & 0xf][corni & 0xf]]
      );
      if (prun > maxl + 1) {
        break;
      } else if (prun >= maxl) {
        m += (0x42 >> m) & 3 & (maxl - prun);
        continue;
      }
      prun = Math.max(
        CoordCube.GetPruning(
          CoordCube.EPermCCombPPrun,
          edgex * CoordCube.N_COMB +
          CoordCube.CCombPConj[CubieCube.Perm2CombP[cornx] & 0xff][CubieCube.SymMultInv[esymx][csymx]]
        ),
        CoordCube.GetPruning(CoordCube.MCPermPrun, cornx * CoordCube.N_MPERM + CoordCube.MPermConj[midx][csymx])
      );
      if (prun >= maxl) {
        m += (0x42 >> m) & 3 & (maxl - prun);
        continue;
      }
      const ret = this.phase2(edgex, esymx, cornx, csymx, midx, maxl - 1, depth + 1, m);
      if (ret >= 0) {
        this.move[depth] = Util.UD2STD[m];
        return ret;
      }
    }
    return -1;
  }

  /**
   * Solves the cross (bottom face edges) of the cube using WASM solver
   * @param facelets The cube state as a string of facelets
   * @param maxSolutions Maximum number of solutions to return (default: 5)
   * @param maxDepth Maximum number of moves per solution (default: 8)
   * @returns Array of solution strings, each solution is a space-separated list of moves
   */
  async solveCross(facelets: string, maxSolutions: number = 5, maxDepth: number = 8): Promise<string[]> {
    const valid = this.cc.deserialize(facelets);
    if (!valid) {
      return ["error: invalid cube"];
    }
    const verify = this.cc.verify();
    if (verify.length > 0) {
      return ["error: " + verify];
    }

    console.log("[底层十字求解] 初始魔方状态: " + facelets);

    // 检查初始状态是否已经完成十字
    if (this.isCrossSolved(this.cc)) {
      console.log("[底层十字求解] 初始状态已完成底层十字");
      return ['']; // 空解法
    }

    // 尝试使用 WASM 求解器
    try {
      if (WasmSolver.isWasmLoaded() && WasmSolver.isTableLoaded()) {
        console.log("[底层十字求解] 使用 WASM 求解器");
        
        // 将魔方状态转换为打乱公式
        // const scramble = this.cubeToScramble(this.cc);
        // console.log("[底层十字求解] 转换后的打乱公式: " + scramble);
        
        // 使用 WASM 求解器求解
        const solutions = await WasmSolver.solveMulti(facelets, maxSolutions);
        console.log(`[底层十字求解] WASM 求解完成，找到 ${solutions.length} 个解法`);
        
        return solutions;
      } else {
        console.log("[底层十字求解] WASM 求解器未就绪，使用原始求解器");
        return this.solveCrossFallback(facelets, maxSolutions, maxDepth);
      }
    } catch (error) {
      console.error("[底层十字求解] WASM 求解失败，使用原始求解器:", error);
      return this.solveCrossFallback(facelets, maxSolutions, maxDepth);
    }
  }

  /**
   * 将 CubieCube 状态转换为打乱公式
   * @param cube CubieCube 对象
   * @returns 打乱公式字符串
   */
  private cubeToScramble(cube: CubieCube): string {
    // 由于 WASM 求解器需要打乱公式，而我们有的是魔方状态
    // 我们需要使用原始求解器生成一个解法，然后反向这个解法
    // 但这会导致性能问题
    
    // 更好的方法是：直接使用原始求解器
    // 因为 WASM 求解器的优势在于速度，但我们需要先有打乱公式
    // 而在实际应用中，我们通常是从打乱公式开始的
    
    // 暂时返回空字符串，让调用者使用原始求解器
    return "";
  }

  /**
   * 原始的底层十字求解器（作为 WASM 求解器的后备）
   * @param facelets The cube state as a string of facelets
   * @param maxSolutions Maximum number of solutions to return (default: 5)
   * @param maxDepth Maximum number of moves per solution (default: 8)
   * @returns Array of solution strings, each solution is a space-separated list of moves
   */
  private solveCrossFallback(facelets: string, maxSolutions: number = 5, maxDepth: number = 8): string[] {
    const valid = this.cc.deserialize(facelets);
    if (!valid) {
      return ["error: invalid cube"];
    }
    const verify = this.cc.verify();
    if (verify.length > 0) {
      return ["error: " + verify];
    }

    // 打印初始魔方状态
    console.log("[底层十字求解] 初始魔方状态: " + facelets);

    const solutions: string[] = [];
    // 使用更高效的Set存储已访问状态
    const visited = new Set<string>();
    const initialCube = new CubieCube();
    initialCube.copy(this.cc);
    const initialKey = this.getCrossKey(initialCube);
    visited.add(initialKey);

    // 检查初始状态是否已经完成十字
    if (this.isCrossSolved(initialCube)) {
      console.log("[底层十字求解] 初始状态已完成底层十字");
      solutions.push(''); // 空解法
      return solutions;
    }

    // 限制最大深度为8
    maxDepth = Math.min(maxDepth, 8);
    const maxIterations = 1000000; // 降低迭代上限以提高响应速度

    // 使用队列实现广度优先搜索
    const queue: { cube: CubieCube, moves: number[], depth: number }[] = [];
    queue.push({ cube: initialCube, moves: [], depth: 0 });

    let iterations = 0;
    while (queue.length > 0 && solutions.length < maxSolutions && iterations < maxIterations) {
      iterations++;
      const { cube, moves, depth } = queue.shift()!;

      // 增加日志输出频率，每1000次迭代输出一次
      if (iterations % 1000 === 0) {
        console.log(`[底层十字求解] 迭代次数: ${iterations}, 当前深度: ${depth}, 已找到解法数: ${solutions.length}`);
      }

      // 检查是否完成十字
      if (this.isCrossSolved(cube)) {
        let solution = "";
        for (const move of moves) {
          // 修复：使用正确的MOVE2STR映射
          if (move >= 0 && move < Util.MOVE2STR.length) {
            solution += Util.MOVE2STR[move].trim() + " ";
          }
        }
        solutions.push(solution.trim());
        console.log(`[底层十字求解] 找到解法: ${solution.trim()}, 当前深度: ${depth}`);
        console.log(`[底层十字求解] 解法步骤数组: [${moves.join(', ')}]`);
        
        // 验证解法是否正确
        if (solution.trim() !== '') {
          this.verifySolution(facelets, solution.trim());
        }
        
        // 找到解后继续搜索同层的其他解
        continue;
      }

      // 如果达到最大深度则剪枝
      if (depth >= maxDepth) {
        continue;
      }

      // 尝试所有可能的移动
      for (let m = 0; m < 18; m++) {
        // 跳过与上一步相同轴的移动以减少冗余
        if (moves.length > 0) {
          const lastAxis = Math.floor(moves[moves.length - 1] / 3);
          const currentAxis = Math.floor(m / 3);
          if (lastAxis === currentAxis) {
            continue;
          }
          // 还要跳过与上两步相同的轴（避免冗余）
          if (moves.length > 1) {
            const secondLastAxis = Math.floor(moves[moves.length - 2] / 3);
            if (secondLastAxis === currentAxis) {
              continue;
            }
          }
        }

        const newCube = new CubieCube();
        // 执行移动 - 修复：正确应用移动
        CubieCube.CornMult(cube, CubieCube.MoveCube[m], newCube);
        CubieCube.EdgeMult(cube, CubieCube.MoveCube[m], newCube);
        
        // 使用更高效的键值生成方法
        const newCubeKey = this.getCrossKey(newCube);

        // 检查是否已访问过
        if (!visited.has(newCubeKey)) {
          visited.add(newCubeKey);
          // 将新状态加入队列
          queue.push({ cube: newCube, moves: [...moves, m], depth: depth + 1 });
        }
      }
    }

    console.log(`[底层十字求解] 搜索完成, 总迭代次数: ${iterations}, 找到解法数: ${solutions.length}`);
    return solutions;
  }

  /**
   * 生成用于比较的十字状态键值，只考虑底层十字相关块的位置和方向
   * 这样可以大大减少状态空间，提高搜索效率
   */
  private getCrossKey(cube: CubieCube): string {
    // 只关注底层四个边块的位置和方向
    let key = "";
    
    // 检查四个底面边块的位置和方向
    // 使用ea数组，每个元素包含位置和方向信息
    // 位置信息：右移1位得到位置，方向信息：最低位表示方向
    const crossEdges = [4, 5, 6, 7]; // 底面边块的索引 (DF, DL, DB, DR)
    for (const edge of crossEdges) {
      const edgeInfo = cube.ea[edge];
      const position = edgeInfo >> 1;  // 获取位置
      const orientation = edgeInfo & 1;  // 获取方向
      key += position + "," + orientation + ";";
    }
    
    return key;
  }

  /**
   * 验证解法是否正确
   * @param initialFacelets 初始魔方状态
   * @param solution 解法步骤
   */
  private verifySolution(initialFacelets: string, solution: string): void {
    // 创建一个临时的魔方来验证解法
    const cube = new CubieCube();
    cube.deserialize(initialFacelets);
    
    // 将解法字符串转换为移动数组
    const moves = solution.split(' ').filter(move => move.length > 0);
    console.log(`[解法验证] 初始状态: ${initialFacelets}`);
    
    // 应用每个移动
    for (const moveStr of moves) {
      let moveIndex = -1;
      for (let i = 0; i < Util.MOVE2STR.length; i++) {
        // 需要处理空格问题，MOVE2STR中的元素可能有空格
        const cleanMove = Util.MOVE2STR[i].trim();
        if (cleanMove === moveStr) {
          moveIndex = i;
          break;
        }
      }
      
      if (moveIndex !== -1) {
        const newCube = new CubieCube();
        // 修复：正确应用移动
        CubieCube.CornMult(cube, CubieCube.MoveCube[moveIndex], newCube);
        CubieCube.EdgeMult(cube, CubieCube.MoveCube[moveIndex], newCube);
        cube.copy(newCube);
      } else {
        console.log(`[解法验证] 无法找到移动 ${moveStr} 的索引`);
      }
    }
    
    const finalState = cube.serialize();
    console.log(`[解法验证] 应用解法后的状态: ${finalState}`);
    
    // 检查是否完成底层十字
    if (this.isCrossSolved(cube)) {
      console.log(`[解法验证] 解法正确，已完成底层十字`);
    } else {
      console.log(`[解法验证] 解法错误，未完成底层十字`);
      // 以二维平面方式打印最终状态
      cube.printCube(finalState);
    }
  }

  /**
   * 占位方法：求解第一组F2L
   * @param facelets 魔方状态字符串
   * @returns 解法步骤数组
   */
  solveF2L(facelets: string = ''): string[] {
    return ['error: 方法未实现'];
  }

  /**
   * 占位方法：求解OLL
   * @param facelets 魔方状态字符串
   * @returns 解法步骤数组
   */
  solveOLL(facelets: string = ''): string[] {
    return ['error: 方法未实现'];
  }

  /**
   * 占位方法：求解PLL
   * @param facelets 魔方状态字符串
   * @returns 解法步骤数组
   */
  solvePLL(facelets: string = ''): string[] {
    return ['error: 方法未实现'];
  }

  /**
   * Checks if the cross (bottom face edges) is solved
   * @param cube The current cube state
   * @param crossFace The face where the cross should be (default: 'D' for down face)
   * @returns True if cross is solved, false otherwise
   */
  private isCrossSolved(cube: CubieCube, crossFace: string = 'D'): boolean {
    // 确认十字面的中心块颜色
    const faceIndices: { [key: string]: number } = { 'U': 0, 'R': 1, 'F': 2, 'D': 3, 'L': 4, 'B': 5 };
    const crossFaceIndex = faceIndices[crossFace] || 3; // 默认D面
    const centerPosition = crossFaceIndex * 9 + 4;
    const facelets = cube.serialize();
    const crossFaceCenter = facelets[centerPosition];

    if (!crossFaceCenter) {
      // console.error(`[十字判断] 无效的十字面: ${crossFace}`);
      return false;
    }

    // 打印当前魔方状态和中心块颜色
    // console.log(`[十字判断] 十字面: ${crossFace}, 中心块位置: ${centerPosition}, 中心块颜色: ${crossFaceCenter}`);
    // 以二维平面方式打印魔方
    //cube.printCube(facelets);
    // 根据十字面确定需要检查的边缘块
    let crossEdges: number[];
    switch (crossFace) {
      case 'D': // 底面
        crossEdges = [4, 5, 6, 7]; // DF, DL, DB, DR edges
        break;
      case 'U': // 顶面
        crossEdges = [0, 1, 2, 3]; // UF, UL, UB, UR edges
        break;
      case 'F': // 前面
        crossEdges = [0, 4, 8, 11]; // UF, DF, FR, FL edges
        break;
      case 'B': // 后面
        crossEdges = [2, 6, 9, 10]; // UB, DB, BR, BL edges
        break;
      case 'R': // 右面
        crossEdges = [1, 5, 9, 11]; // UR, DR, BR, FR edges
        break;
      case 'L': // 左面
        crossEdges = [3, 7, 8, 10]; // UL, DL, FL, BL edges
        break;
      default:
        crossEdges = [4, 5, 6, 7]; // 默认底面
        break;
    }

    // console.log(`[十字判断] 需要检查的边缘块: ${crossEdges.join(', ')}`);

    for (const edge of crossEdges) {
      // 获取边缘块的位置和方向
      const edgeVal = cube.ea[edge];
      const edgePos = edgeVal >> 1; // 右移一位获取位置
      const edgeOri = edgeVal & 1; // 取最低位获取方向

      // 打印当前边缘块的信息
      // console.log(`[十字判断] 边缘块 ${edge}: 位置=${edgePos}, 方向=${edgeOri}`);

      // 检查边缘块是否在正确的位置（对于底层十字，边缘块应该在底层）
      // 对于底层十字，我们检查的是边缘块是否在底层的正确位置
      const isOnBottomLayer = edgePos >= 4 && edgePos <= 7;
      if (!isOnBottomLayer) {
        // console.log(`[十字判断] 边缘块 ${edge} 不在底层 (位置: ${edgePos})`);
        return false;
      }

      // 检查边缘块的方向是否正确
      if (edgeOri !== 0) {
        // console.log(`[十字判断] 边缘块 ${edge} 方向不正确 (方向: ${edgeOri})`);
        return false;
      }

      // 检查边缘块的颜色是否与十字面中心块颜色匹配
      // 获取边缘块的两个面色彩位置
      const edgeFacelets = Util.EdgeFacelet[edgePos]; // 使用edgePos而不是edge
      let crossFaceletPos = -1;
      let adjacentFaceletPos = -1;
      // 找到属于十字面的面色彩位置和相邻面的面色彩位置
      for (const pos of edgeFacelets) {
        const faceIndex = Math.floor(pos / 9);
        if (faceIndex === crossFaceIndex) {
          crossFaceletPos = pos;
        } else {
          adjacentFaceletPos = pos;
        }
      }

      if (crossFaceletPos === -1 || adjacentFaceletPos === -1) {
        // console.log(`[十字判断] 边缘块 ${edge} 面块位置不完整`);
        return false; // 边缘块面块位置不完整
      }

      const edgeCrossColor = facelets[crossFaceletPos];
      // console.log(`[十字判断] 边缘块 ${edge} 的十字面颜色: ${edgeCrossColor}, 期望颜色: ${crossFaceCenter}`);
      if (edgeCrossColor !== crossFaceCenter) {
        // console.log(`[十字判断] 边缘块 ${edge} 十字面颜色不匹配 (实际: ${edgeCrossColor}, 期望: ${crossFaceCenter})`);
        return false;
      }

      // 检查边缘块的相邻面颜色是否与对应中心块颜色匹配
      const adjacentFaceIndex = Math.floor(adjacentFaceletPos / 9);
      const adjacentCenterPos = adjacentFaceIndex * 9 + 4;
      const adjacentFaceCenter = facelets[adjacentCenterPos];
      const edgeAdjacentColor = facelets[adjacentFaceletPos];
      // console.log(`[十字判断] 边缘块 ${edge} 的相邻面颜色: ${edgeAdjacentColor}, 对应中心块颜色: ${adjacentFaceCenter}`);
      if (edgeAdjacentColor !== adjacentFaceCenter) {
        // console.log(`[十字判断] 边缘块 ${edge} 相邻面颜色不匹配 (实际: ${edgeAdjacentColor}, 期望: ${adjacentFaceCenter})`);
        return false;
      }
    }
    console.log(`[十字判断] 当前魔方状态: ${facelets}`);
    console.log(`[十字判断] 底层十字已完成`);
    // 以二维平面方式打印魔方
    cube.printCube(facelets);
    return true;
  }
}
