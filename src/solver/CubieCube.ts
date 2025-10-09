import Util from "./Util";
import CoordCube from "./CoordCube";

/**
 * 魔方立方体类，用于表示魔方的状态和执行基本操作
 * 该类是魔方求解器的核心数据结构，用于表示和操作魔方的角块和边块
 */
export default class CubieCube {
  /**
   * 由S_F2、S_U4和S_LR2生成的16种对称性变换
   * 用于在搜索算法中减少重复计算
   */
  static SymCube: CubieCube[] = [];

  /**
   * 18种基本移动对应的立方体变换
   * 每个元素代表一种基本移动（6个面，每个面3种移动：顺时针、逆时针、180度）
   */
  static MoveCube: CubieCube[] = [];

  /**
   * 移动的对称性映射
   */
  static MoveCubeSym: number[] = [];
  /**
   * 首次移动的对称性映射
   */
  static FirstMoveSym: number[] = [];

  /**
   * 对称性乘法表
   */
  static SymMult: number[][] = [];
  /**
   * 对称性乘法逆元表
   */
  static SymMultInv: number[][] = [];
  /**
   * 对称性移动映射表
   */
  static SymMove: number[][] = [];

  /**
   * 8对称性移动映射
   */
  static Sym8Move: number[] = [];
  /**
   * UD方向的对称性移动映射
   */
  static SymMoveUD: number[][] = [];

  /**
   * 类索引到代表元素的映射数组
   */
  static FlipS2R: number[] = [];  // 翻转状态的类索引到代表元素的映射
  static TwistS2R: number[] = []; // 旋转状态的类索引到代表元素的映射
  static EPermS2R: number[] = []; // 边块排列的类索引到代表元素的映射
  static Perm2CombP: number[] = []; // 排列到组合的映射
  static PermInvEdgeSym: number[] = []; // 边块对称排列的逆
  static MPermInv: number[] = []; // M排列的逆

  /**
   * 注意：边块排列坐标和角块排列坐标具有相同的对称结构
   * 因此它们的类索引到代表元素的映射数组是相同的
   * 当x是原始边块排列坐标时，y*16+k是对称边块排列坐标，y*16+(k^e2c[k])将是
   * 原始角块排列坐标为x的状态的对称角块排列坐标
   */
  // static byte[] e2c = {0, 0, 0, 0, 1, 3, 1, 3, 1, 3, 1, 3, 0, 0, 0, 0};
  static SYM_E2C_MAGIC = 0x00dddd00; // 边块到角块对称变换的魔术数字

  /**
   * 将边块对称索引转换为角块对称索引
   * @param idx 边块对称索引
   * @returns 对应的角块对称索引
   */
  static ESym2CSym(idx: number): number {
    return idx ^ ((CubieCube.SYM_E2C_MAGIC >> ((idx & 0xf) << 1)) & 3);
  }

  /**
   * 原始坐标到对称坐标的映射，仅用于加速初始化
   */
  static FlipR2S: number[] = [];  // 翻转状态的原始坐标到对称坐标的映射
  static TwistR2S: number[] = []; // 旋转状态的原始坐标到对称坐标的映射
  static EPermR2S: number[] = []; // 边块排列的原始坐标到对称坐标的映射

  /**
   * 对称状态数组
   */
  static SymStateTwist: number[] = []; // 旋转状态的对称状态
  static SymStateFlip: number[] = [];  // 翻转状态的对称状态
  static SymStatePerm: number[] = [];  // 排列状态的对称状态

  /**
   * URF（上右前）角块的变换
   */
  static URF1: CubieCube = new CubieCube(2531, 1373, 67026819, 1367);
  static URF2: CubieCube = new CubieCube(2089, 1906, 322752913, 2040);

  /**
   * URF角块的移动表
   * 定义了不同旋转方向下角块的位置变化
   */
  static URFMove = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    [6, 7, 8, 0, 1, 2, 3, 4, 5, 15, 16, 17, 9, 10, 11, 12, 13, 14],
    [3, 4, 5, 6, 7, 8, 0, 1, 2, 12, 13, 14, 15, 16, 17, 9, 10, 11],
    [2, 1, 0, 5, 4, 3, 8, 7, 6, 11, 10, 9, 14, 13, 12, 17, 16, 15],
    [8, 7, 6, 2, 1, 0, 5, 4, 3, 17, 16, 15, 11, 10, 9, 14, 13, 12],
    [5, 4, 3, 8, 7, 6, 2, 1, 0, 14, 13, 12, 17, 16, 15, 11, 10, 9],
  ];

  /**
   * 初始化18种基本移动对应的立方体变换
   * 每种移动包括顺时针、逆时针和180度旋转三种情况
   * 该方法预计算所有可能的基本移动，以加速后续的魔方操作
   */
  static InitMove(): void {
    const result: CubieCube[] = [];
    // 初始化6个面的180度旋转（索引0,3,6,9,12,15）
    result[0] = new CubieCube(15120, 0, 119750400, 0);  // U面180度
    result[3] = new CubieCube(21021, 1494, 323403417, 0);  // D面180度
    result[6] = new CubieCube(8064, 1236, 29441808, 550);  // F面180度
    result[9] = new CubieCube(9, 0, 5880, 0);  // B面180度
    result[12] = new CubieCube(1230, 412, 2949660, 0);  // R面180度
    result[15] = new CubieCube(224, 137, 328552, 137);  // L面180度

    // 计算每个面的顺时针和逆时针旋转（索引1,2,4,5,...等）
    // a每次递增3，对应6个面
    for (let a = 0; a < 18; a += 3) {
      // p=0: 顺时针旋转 (a+1)
      // p=1: 逆时针旋转 (a+2)
      for (let p = 0; p < 2; p++) {
        result[a + p + 1] = new CubieCube();
        // 通过组合180度旋转和前一次旋转来计算顺时针和逆时针旋转
        CubieCube.EdgeMult(result[a + p], result[a], result[a + p + 1]);
        CubieCube.CornMult(result[a + p], result[a], result[a + p + 1]);
      }
    }
    // 将计算结果赋值给MoveCube静态属性
    CubieCube.MoveCube = result;
  }

  /**
   * 初始化16种对称性变换及相关的对称表
   * 对称性包括由S_F2（前后面翻转）、S_U4（顶面旋转）和S_LR2（左右面翻转）生成的所有组合
   * 这些对称性用于在搜索算法中减少重复计算
   */
  static InitSym(): void {
    let c = new CubieCube();  // 当前立方体状态
    let d = new CubieCube();  // 临时立方体状态，用于存储变换结果

    // 定义三种基本对称性变换
    const f2 = new CubieCube(28783, 0, 259268407, 0);  // 前后面翻转
    const u4 = new CubieCube(15138, 0, 119765538, 7);  // 顶面旋转
    const lr2 = new CubieCube(5167, 0, 83473207, 0);  // 左右面翻转

    // 配置lr2的角块属性
    for (let i = 0; i < 8; i++) {
      lr2.ca[i] |= 3 << 3;
    }

    // 生成16种对称性变换
    for (let i = 0; i < 16; i++) {
      CubieCube.SymCube[i] = new CubieCube();
      CubieCube.SymCube[i].copy(c);  // 保存当前对称性

      // 应用u4变换（顶面旋转）
      CubieCube.CornMultFull(c, u4, d);
      CubieCube.EdgeMult(c, u4, d);
      [c, d] = [d, c];  // 交换c和d，准备下一次变换

      // 每4次迭代后应用lr2变换（左右面翻转）
      if (i % 4 == 3) {
        CubieCube.CornMultFull(c, lr2, d);
        CubieCube.EdgeMult(c, lr2, d);
        [c, d] = [d, c];
      }

      // 每8次迭代后应用f2变换（前后面翻转）
      if (i % 8 == 7) {
        CubieCube.CornMultFull(c, f2, d);
        CubieCube.EdgeMult(c, f2, d);
        [c, d] = [d, c];
      }
    }

    // 初始化对称性乘法表和逆表
    for (let i = 0; i < 16; i++) {
      CubieCube.SymMult[i] = [];
      CubieCube.SymMultInv[i] = [];
      CubieCube.SymMove[i] = [];  // 对称性移动映射表
      CubieCube.SymMoveUD[i] = [];  // UD方向对称性移动映射表
    }

    // 填充对称性乘法表和逆表
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        // 使用位运算计算对称性乘法
        CubieCube.SymMult[i][j] = i ^ j ^ ((0x14ab4 >> j) & (i << 1) & 2);
        // 记录逆元
        CubieCube.SymMultInv[CubieCube.SymMult[i][j]][j] = i;
      }
    }

    // 计算对称性移动映射
    for (let s = 0; s < 16; s++) {
      for (let j = 0; j < 18; j++) {
        // 计算共轭移动
        CubieCube.CornConjugate(CubieCube.MoveCube[j], CubieCube.SymMultInv[0][s], c);

        // 查找匹配的移动
        outloop: for (let m = 0; m < 18; m++) {
          for (let t = 0; t < 8; t++) {
            if (CubieCube.MoveCube[m].ca[t] != c.ca[t]) {
              continue outloop;
            }
          }
          // 找到匹配的移动
          CubieCube.SymMove[s][j] = m;
          CubieCube.SymMoveUD[s][Util.STD2UD[j]] = Util.STD2UD[m];
          break;
        }

        // 填充8对称性移动映射
        if (s % 2 == 0) {
          CubieCube.Sym8Move[(j << 3) | (s >> 1)] = CubieCube.SymMove[s][j];
        }
      }
    }
  }

  /**
   * 初始化对称状态映射表
   * 该方法将原始坐标映射到对称坐标，减少搜索空间
   * @param N_RAW 原始状态的总数
   * @param Sym2Raw 对称索引到原始索引的映射数组
   * @param Raw2Sym 原始索引到对称索引的映射数组
   * @param SymState 对称状态数组，记录每个对称类的对称性质
   * @param coord 坐标类型：0=翻转(Flip)，1=旋转(Twist)，2=边块排列(EPerm)
   * @returns 对称类的数量
   */
  static InitSym2Raw(N_RAW: number, Sym2Raw: number[], Raw2Sym: number[], SymState: number[], coord: number): number {
    const c = new CubieCube();
    const d = new CubieCube();
    let count = 0, idx = 0;
    const symInc = coord >= 2 ? 1 : 2;  // 排列坐标步长为1，方向坐标步长为2
    const isEdge = coord != 1;  // 是否为边块坐标

    // 遍历所有原始状态
    for (let i = 0; i < N_RAW; i++) {
      if (Raw2Sym[i] != undefined) {
        continue;  // 跳过已处理的状态
      }

      // 设置当前立方体的指定坐标
      switch (coord) {
        case 0:
          c.Flip = i;  // 翻转坐标
          break;
        case 1:
          c.Twist = i;  // 旋转坐标
          break;
        case 2:
          c.EPerm = i;  // 边块排列坐标
          break;
      }

      // 应用所有相关对称性变换
      for (let s = 0; s < 16; s += symInc) {
        if (isEdge) {
          CubieCube.EdgeConjugate(c, s, d);  // 边块共轭变换
        } else {
          CubieCube.CornConjugate(c, s, d);  // 角块共轭变换
        }

        // 获取变换后的坐标
        switch (coord) {
          case 0:
            idx = d.Flip;
            break;
          case 1:
            idx = d.Twist;
            break;
          case 2:
            idx = d.EPerm;
            break;
        }

        // 如果变换后回到原始状态，记录对称性质
        if (idx == i) {
          SymState[count] |= 1 << (s / symInc);
        }

        // 记录原始索引到对称索引的映射
        Raw2Sym[idx] = ((count << 4) | s) / symInc;
      }

      // 记录对称索引到原始索引的映射，并增加计数
      Sym2Raw[count++] = i;
    }

    return count;  // 返回对称类的数量
  }

  /**
   * 初始化翻转状态(Flip)的对称映射表
   * 调用InitSym2Raw方法生成翻转状态的对称类和映射关系
   */
  static InitFlipSym2Raw(): void {
    CubieCube.InitSym2Raw(CoordCube.N_FLIP, CubieCube.FlipS2R, CubieCube.FlipR2S, CubieCube.SymStateFlip, 0);
  }

  /**
   * 初始化旋转状态(Twist)的对称映射表
   * 调用InitSym2Raw方法生成旋转状态的对称类和映射关系
   */
  static InitTwistSym2Raw(): void {
    CubieCube.InitSym2Raw(CoordCube.N_TWIST, CubieCube.TwistS2R, CubieCube.TwistR2S, CubieCube.SymStateTwist, 1);
  }

  /**
   * 初始化排列状态(EPerm)的对称映射表
   * 调用InitSym2Raw方法生成边块排列的对称类和映射关系
   * 同时初始化排列到组合的映射、排列逆对称等辅助表
   */
  static InitPermSym2Raw(): void {
    CubieCube.InitSym2Raw(CoordCube.N_PERM, CubieCube.EPermS2R, CubieCube.EPermR2S, CubieCube.SymStatePerm, 2);
    const cc = new CubieCube();

    // 初始化排列到组合的映射和排列逆对称表
    for (let i = 0; i < CoordCube.N_PERM_SYM; i++) {
      cc.EPerm = CubieCube.EPermS2R[i];  // 设置边块排列
      CubieCube.Perm2CombP[i] = Util.GetComb(cc.ea, 0, true);  // 计算组合值
      cc.inverse();  // 计算逆排列
      CubieCube.PermInvEdgeSym[i] = cc.EPermSym;  // 记录逆排列的对称索引
    }

    // 初始化M排列的逆表
    for (let i = 0; i < CoordCube.N_MPERM; i++) {
      cc.MPerm = i;  // 设置M排列
      cc.inverse();  // 计算逆排列
      CubieCube.MPermInv[i] = cc.MPerm;  // 记录逆排列
    }
  }

  /**
   * 初始化CubieCube类的静态成员
   * 该方法应该在使用CubieCube类之前被调用
   * 初始化临时对象、移动表和对称表
   */
  static Init(): void {
    CubieCube.temps = new CubieCube();  // 初始化临时对象
    CubieCube.InitMove();  // 初始化移动表
    CubieCube.InitSym();  // 初始化对称表
  }

  /**
   * prod = a * b, Corner Only.
   */
  /**
   * 执行角块乘法操作：prod = a * b
   * 该方法只处理角块部分的变换
   * @param a 第一个立方体变换
   * @param b 第二个立方体变换
   * @param prod 结果立方体变换
   */
  static CornMult(a: CubieCube, b: CubieCube, prod: CubieCube): void {
    for (let corn = 0; corn < 8; corn++) {
      // 获取b变换后的角块位置
      const bCornPos = b.ca[corn] & 7;
      // 获取a在该位置的角块方向
      const oriA = a.ca[bCornPos] >> 3;
      // 获取b的角块方向
      const oriB = b.ca[corn] >> 3;
      // 计算结果角块的位置和方向
      prod.ca[corn] = (a.ca[bCornPos] & 7) | ((oriA + oriB) % 3 << 3);
    }
  }

  /**
   * prod = a * b, Corner Only. With mirrored cases considered
   */
  /**
   * 执行角块乘法操作（考虑镜像情况）：prod = a * b
   * 该方法处理角块部分的变换，并考虑镜像对称性
   * @param a 第一个立方体变换
   * @param b 第二个立方体变换
   * @param prod 结果立方体变换
   */
  static CornMultFull(a: CubieCube, b: CubieCube, prod: CubieCube): void {
    for (let corn = 0; corn < 8; corn++) {
      // 获取b变换后的角块位置
      const bCornPos = b.ca[corn] & 7;
      // 获取a在该位置的角块方向
      const oriA = a.ca[bCornPos] >> 3;
      // 获取b的角块方向
      const oriB = b.ca[corn] >> 3;

      // 计算考虑镜像的方向
      let ori = oriA + (oriA < 3 ? oriB : 6 - oriB);
      // 调整方向值并考虑镜像标志
      ori = (ori % 3) + (oriA < 3 == oriB < 3 ? 0 : 3);

      // 设置结果角块的位置和方向
      prod.ca[corn] = (a.ca[bCornPos] & 7) | (ori << 3);
    }
  }

  /**
   * prod = a * b, Edge Only.
   */
  /**
   * 执行边块乘法操作：prod = a * b
   * 该方法只处理边块部分的变换
   * @param a 第一个立方体变换
   * @param b 第二个立方体变换
   * @param prod 结果立方体变换
   */
  static EdgeMult(a: CubieCube, b: CubieCube, prod: CubieCube): void {
    for (let ed = 0; ed < 12; ed++) {
      // 获取b变换后的边块位置（右移1位去掉方向位）
      const bEdgePos = b.ea[ed] >> 1;
      // 获取a在该位置的边块信息
      const aEdgeInfo = a.ea[bEdgePos];
      // 获取b的边块方向（最低位）
      const bEdgeOri = b.ea[ed] & 1;
      // 计算结果边块信息：位置由a决定，方向由a和b共同决定（异或操作）
      prod.ea[ed] = aEdgeInfo ^ bEdgeOri;
    }
  }

  /**
   * b = S_idx^-1 * a * S_idx, Corner Only.
   */
  static CornConjugate(a: CubieCube, idx: number, b: CubieCube): void {
    const sinv: CubieCube = CubieCube.SymCube[CubieCube.SymMultInv[0][idx]];
    const s = CubieCube.SymCube[idx];
    for (let corn = 0; corn < 8; corn++) {
      const oriA = sinv.ca[a.ca[s.ca[corn] & 7] & 7] >> 3;
      const oriB = a.ca[s.ca[corn] & 7] >> 3;
      const ori = oriA < 3 ? oriB : (3 - oriB) % 3;
      b.ca[corn] = (sinv.ca[a.ca[s.ca[corn] & 7] & 7] & 7) | (ori << 3);
    }
  }

  /**
   * b = S_idx^-1 * a * S_idx, Edge Only.
   */
  static EdgeConjugate(a: CubieCube, idx: number, b: CubieCube): void {
    const sinv = CubieCube.SymCube[CubieCube.SymMultInv[0][idx]];
    const s = CubieCube.SymCube[idx];
    for (let ed = 0; ed < 12; ed++) {
      b.ea[ed] = sinv.ea[a.ea[s.ea[ed] >> 1] >> 1] ^ (a.ea[s.ea[ed] >> 1] & 1) ^ (s.ea[ed] & 1);
    }
  }

  /**
   * 获取排列的对称逆
   * @param idx 排列索引
   * @param sym 对称索引
   * @param corner 是否为角块排列
   * @returns 对称逆排列的索引
   */
  static GetPermSymInv(idx: number, sym: number, corner: boolean): number {
    let idxi = CubieCube.PermInvEdgeSym[idx];  // 获取边块排列的逆
    if (corner) {
      idxi = CubieCube.ESym2CSym(idxi);  // 转换为角块排列的逆
    }
    // 计算对称乘法并返回结果
    return (idxi & 0xfff0) | CubieCube.SymMult[idxi & 0xf][sym];
  }

  /**
   * 获取要跳过的移动
   * 根据对称状态确定哪些移动可以跳过，以减少搜索空间
   * @param ssym 对称状态
   * @returns 表示要跳过的移动的位掩码
   */
  static GetSkipMoves(ssym: number): number {
    let ret = 0;
    // 遍历对称状态的每一位
    for (let i = 1; (ssym >>= 1) != 0; i++) {
      if ((ssym & 1) == 1) {
        // 如果该位为1，则添加对应的跳过移动
        ret |= CubieCube.FirstMoveSym[i];
      }
    }
    return ret;
  }

  ca: number[] = [0, 1, 2, 3, 4, 5, 6, 7];
  ea: number[] = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
  static temps: CubieCube;

  /**
   * 构造函数，初始化魔方状态
   * @param cperm 角块排列坐标
   * @param twist 角块旋转坐标
   * @param eperm 边块排列坐标
   * @param flip 边块翻转坐标
   */
  constructor(cperm = 0, twist = 0, eperm = 0, flip = 0) {
    this.CPerm = cperm;  // 设置角块排列
    this.Twist = twist;  // 设置角块旋转
    Util.SetNPermFull(this.ea, eperm, 12, true);  // 设置边块排列
    this.Flip = flip;  // 设置边块翻转
  }

  /**
   * 复制另一个CubieCube对象的状态
   * @param c 要复制的CubieCube对象
   */
  copy(c: CubieCube): void {
    for (let edge = 0; edge < 12; edge++) {
      this.ea[edge] = c.ea[edge];  // 复制边块状态
    }
    for (let corn = 0; corn < 8; corn++) {
      this.ca[corn] = c.ca[corn];  // 复制角块状态
    }
  }

  /**
   * 计算魔方状态的逆状态
   * 将当前状态转换为其逆变换
   */
  inverse(): void {
    // 计算边块的逆
    for (let edge = 0; edge < 12; edge++) {
      // 获取边块位置（右移1位去掉方向位）
      const edgePos = this.ea[edge] >> 1;
      // 获取边块方向（最低位）
      const edgeOri = this.ea[edge] & 1;
      // 设置逆状态的边块信息
      CubieCube.temps.ea[edgePos] = (edge << 1) | edgeOri;
    }

    // 计算角块的逆
    for (let corn = 0; corn < 8; corn++) {
      // 获取角块位置（低3位）
      const cornPos = this.ca[corn] & 0x7;
      // 获取角块方向（高3位）
      const cornOri = this.ca[corn] >> 3;
      // 计算逆方向（6 - 方向，如果方向 >=3 则取 3 - (方向 % 3)
      const invOri = (0x20 >> cornOri) & 0x18;
      // 设置逆状态的角块信息
      CubieCube.temps.ca[cornPos] = corn | invOri;
    }

    // 复制逆状态到当前对象
    this.copy(CubieCube.temps);
  }

  /**
   * this = S_urf^-1 * this * S_urf.
   */
  /**
   * 执行URF（上右前）角块的共轭变换
   * 变换公式：this = S_urf^-1 * this * S_urf
   * 用于魔方求解算法中的状态转换
   */
  URFConjugate(): void {
    // 角块共轭变换
    CubieCube.CornMult(CubieCube.URF2, this, CubieCube.temps);
    CubieCube.CornMult(CubieCube.temps, CubieCube.URF1, this);

    // 边块共轭变换
    CubieCube.EdgeMult(CubieCube.URF2, this, CubieCube.temps);
    CubieCube.EdgeMult(CubieCube.temps, CubieCube.URF1, this);
  }

  // ********************************************* Get and set coordinates *********************************************
  // XSym : Symmetry Coordnate of X. MUST be called after initialization of ClassIndexToRepresentantArrays.

  // ++++++++++++++++++++ Phase 1 Coordnates ++++++++++++++++++++
  // Flip : Orientation of 12 Edges. Raw[0, 2048) Sym[0, 336 * 8)
  // Twist : Orientation of 8 Corners. Raw[0, 2187) Sym[0, 324 * 8)
  // UDSlice : Positions of the 4 UDSlice edges, the order is ignored. [0, 495)

  /**
   * 获取边块翻转状态坐标
   * 边块翻转状态表示12个边块的方向（0或1）
   * @returns 边块翻转状态的原始坐标（0-2047）
   */
  get Flip(): number {
    let idx = 0;
    // 遍历前11个边块的方向位（最低位）
    for (let i = 0; i < 11; i++) {
      idx = (idx << 1) | (this.ea[i] & 1);
    }
    return idx;
  }

  /**
   * 设置边块翻转状态坐标
   * @param idx 边块翻转状态的原始坐标（0-2047）
   */
  set Flip(idx: number) {
    let parity = 0;
    let val = 0;
    // 从高位到低位设置前11个边块的方向
    for (let i = 10; i >= 0; i--, idx >>= 1) {
      parity ^= val = idx & 1;
      this.ea[i] = (this.ea[i] & ~1) | val;
    }
    // 第12个边块的方向由前11个的奇偶性决定
    this.ea[11] = (this.ea[11] & ~1) | parity;
  }

  /**
   * 获取边块翻转状态的对称坐标
   * @returns 边块翻转状态的对称坐标
   */
  get FlipSym(): number {
    return CubieCube.FlipR2S[this.Flip];
  }

  /**
   * 获取角块旋转状态坐标
   * 角块旋转状态表示8个角块的旋转方向（0-2）
   * @returns 角块旋转状态的原始坐标（0-2186）
   */
  get Twist(): number {
    let idx = 0;
    // 遍历前7个角块的旋转方向（高3位）
    for (let i = 0; i < 7; i++) {
      idx += (idx << 1) + (this.ca[i] >> 3);
    }
    return idx;
  }

  /**
   * 设置角块旋转状态坐标
   * @param idx 角块旋转状态的原始坐标（0-2186）
   */
  set Twist(idx) {
    let twst = 15;  // 初始总旋转度为15（5*3）
    let val = 0;
    // 从高位到低位设置前7个角块的旋转方向
    for (let i = 6; i >= 0; i--, idx = ~~(idx / 3)) {
      twst -= val = idx % 3;
      this.ca[i] = (this.ca[i] & 0x7) | (val << 3);
    }
    // 第8个角块的旋转方向由总旋转度的奇偶性决定
    this.ca[7] = (this.ca[7] & 0x7) | (twst % 3 << 3);
  }

  /**
   * 获取角块旋转状态的对称坐标
   * @returns 角块旋转状态的对称坐标
   */
  get TwistSym(): number {
    return CubieCube.TwistR2S[this.Twist];
  }

  /**
   * 获取UD切片边块的位置坐标
   * UD切片边块指的是位于上层面和下层面之间的4个边块
   * @returns UD切片边块的位置坐标（0-494）
   */
  get UDSlice(): number {
    return 494 - Util.GetComb(this.ea, 8, true);
  }

  /**
   * 设置UD切片边块的位置坐标
   * @param idx UD切片边块的位置坐标（0-494）
   */
  set UDSlice(idx) {
    Util.SetComb(this.ea, 494 - idx, 8, true);
  }

  // ++++++++++++++++++++ Phase 2 Coordnates ++++++++++++++++++++
  // EPerm : Permutations of 8 UD Edges. Raw[0, 40320) Sym[0, 2187 * 16)
  // Cperm : Permutations of 8 Corners. Raw[0, 40320) Sym[0, 2187 * 16)
  // MPerm : Permutations of 4 UDSlice Edges. [0, 24)

  /**
   * 获取角块排列坐标
   * 角块排列表示8个角块的位置排列
   * @returns 角块排列的原始坐标（0-40319）
   */
  get CPerm(): number {
    return Util.GetNPerm(this.ca, 8, false);
  }

  /**
   * 设置角块排列坐标
   * @param idx 角块排列的原始坐标（0-40319）
   */
  set CPerm(idx) {
    Util.SetNPerm(this.ca, idx, 8, false);
  }

  /**
   * 获取角块排列的对称坐标
   * @returns 角块排列的对称坐标
   */
  get CPermSym(): number {
    return CubieCube.ESym2CSym(CubieCube.EPermR2S[this.CPerm]);
  }

  /**
   * 获取边块排列坐标
   * 边块排列表示8个UD边块的位置排列
   * @returns 边块排列的原始坐标（0-40319）
   */
  get EPerm(): number {
    return Util.GetNPerm(this.ea, 8, true);
  }

  /**
   * 设置边块排列坐标
   * @param idx 边块排列的原始坐标（0-40319）
   */
  set EPerm(idx) {
    Util.SetNPerm(this.ea, idx, 8, true);
  }

  /**
   * 获取边块排列的对称坐标
   * @returns 边块排列的对称坐标
   */
  get EPermSym(): number {
    return CubieCube.EPermR2S[this.EPerm];
  }

  /**
   * 获取M层边块排列坐标
   * M层边块指的是4个UD切片边块
   * @returns M层边块排列的坐标（0-23）
   */
  get MPerm(): number {
    return Util.GetNPermFull(this.ea, 12, true) % 24;
  }

  /**
   * 设置M层边块排列坐标
   * @param idx M层边块排列的坐标（0-23）
   */
  set MPerm(idx) {
    Util.SetNPermFull(this.ea, idx, 12, true);
  }

  /**
   * 获取角块组合坐标
   * 角块组合表示8个角块的组合状态
   * @returns 角块组合的坐标
   */
  get CComb(): number {
    return Util.GetComb(this.ca, 0, false);
  }

  /**
   * 设置角块组合坐标
   * @param idx 角块组合的坐标
   */
  set CComb(idx) {
    Util.SetComb(this.ca, idx, 0, false);
  }

  /**
   * 验证魔方状态的有效性
   * 检查边块和角块是否完整、方向是否正确、奇偶性是否匹配
   * @returns 空字符串表示有效状态，否则返回错误信息
   */
  verify(): string {
    let sum = 0;
    let mask = 0;

    // 检查边块
    for (let e = 0; e < 12; e++) {
      mask |= 1 << (this.ea[e] >> 1);  // 记录边块位置
      sum ^= this.ea[e] & 1;  // 计算边块方向的异或和
    }
    if (mask != 0xfff) {
      return "missing edges";  // 边块不完整
    }
    if (sum != 0) {
      return "fliped edges";  // 边块方向和不为0，无效
    }

    // 检查角块
    mask = 0;
    sum = 0;
    for (let c = 0; c < 8; c++) {
      mask |= 1 << (this.ca[c] & 7);  // 记录角块位置
      sum += this.ca[c] >> 3;  // 计算角块方向和
    }
    if (mask != 0xff) {
      return "missing corners";  // 角块不完整
    }
    if (sum % 3 != 0) {
      return "twisted corner";  // 角块方向和不是3的倍数，无效
    }

    // 检查奇偶性
    if ((Util.GetNParity(Util.GetNPermFull(this.ea, 12, true), 12) ^ Util.GetNParity(this.CPerm, 8)) != 0) {
      return "parity error";  // 边块和角块的奇偶性不匹配
    }

    return "";  // 状态有效
  }

  /**
   * 将魔方状态序列化为字符串表示
   * 该字符串包含54个字符，每个字符代表魔方的一个面块
   * @returns 魔方状态的字符串表示
   */
  serialize(): string {
    const ts = "URFDLB";  // 面的缩写：上(Up), 右(Right), 前(Front), 下(Down), 左(Left), 后(Back)
    const f = [];  // 存储面块信息的数组

    // 初始化所有面块为中心面颜色
    for (let i = 0; i < 54; i++) {
      f[i] = ts[~~(i / 9)];  // 根据位置确定中心面
    }

    // 填充角块信息
    for (let c = 0; c < 8; c++) {
      const j = this.ca[c] & 0x7;  // 角块的原始索引
      const ori = this.ca[c] >> 3;  // 角块的方向

      // 更新角块对应的三个面块
      for (let n = 0; n < 3; n++) {
        // 计算旋转后的面块索引
        const faceletIndex = Util.CornerFacelet[c][(n + ori) % 3];
        // 计算原始角块的面颜色
        const faceColor = ts[~~(Util.CornerFacelet[j][n] / 9)];
        // 更新面块数组
        f[faceletIndex] = faceColor;
      }
    }

    // 填充边块信息
    for (let e = 0; e < 12; e++) {
      const j = this.ea[e] >> 1;  // 边块的原始索引
      const ori = this.ea[e] & 1;  // 边块的方向

      // 更新边块对应的两个面块
      for (let n = 0; n < 2; n++) {
        // 计算旋转后的面块索引
        const faceletIndex = Util.EdgeFacelet[e][(n + ori) % 2];
        // 计算原始边块的面颜色
        const faceColor = ts[~~(Util.EdgeFacelet[j][n] / 9)];
        // 更新面块数组
        f[faceletIndex] = faceColor;
      }
    }

    return f.join("");  // 连接数组元素形成字符串
  }

  /**
   * 将字符串表示的魔方状态反序列化为CubieCube对象
   * @param facelet 54个字符的字符串，表示魔方的面块状态
   * @returns 是否成功反序列化
   */
  deserialize(facelet: string): boolean {
    let count = 0;
    const f = [];
    // 提取中心面颜色（用于颜色映射）
    const centers = facelet[4] + facelet[13] + facelet[22] + facelet[31] + facelet[40] + facelet[49];
    // 将面块颜色映射到中心面索引
    for (let i = 0; i < 54; ++i) {
      f[i] = centers.indexOf(facelet[i]);
      if (f[i] == -1) {
        return false;
      }
      count += 1 << (f[i] << 2);
    }
    if (count != 0x999999) {
      return false;
    }
    let col1, col2, i, j, ori;
    for (i = 0; i < 8; ++i) {
      for (ori = 0; ori < 3; ++ori) if (f[Util.CornerFacelet[i][ori]] == 0 || f[Util.CornerFacelet[i][ori]] == 3) break;
      col1 = f[Util.CornerFacelet[i][(ori + 1) % 3]];
      col2 = f[Util.CornerFacelet[i][(ori + 2) % 3]];
      for (j = 0; j < 8; ++j) {
        if (col1 == ~~(Util.CornerFacelet[j][1] / 9) && col2 == ~~(Util.CornerFacelet[j][2] / 9)) {
          this.ca[i] = j | (ori % 3 << 3);
          break;
        }
      }
    }
    for (i = 0; i < 12; ++i) {
      for (j = 0; j < 12; ++j) {
        if (
          f[Util.EdgeFacelet[i][0]] == ~~(Util.EdgeFacelet[j][0] / 9) &&
          f[Util.EdgeFacelet[i][1]] == ~~(Util.EdgeFacelet[j][1] / 9)
        ) {
          this.ea[i] = j << 1;
          break;
        }
        if (
          f[Util.EdgeFacelet[i][0]] == ~~(Util.EdgeFacelet[j][1] / 9) &&
          f[Util.EdgeFacelet[i][1]] == ~~(Util.EdgeFacelet[j][0] / 9)
        ) {
          this.ea[i] = (j << 1) | 1;
          break;
        }
      }
    }
    return true;
  }

  /**
   * 以二维平面方式打印魔方状态
   * @param facelet 魔方状态字符串（可选），如果不提供则使用当前状态
   */
  printCube(facelet?: string): void {
    // 如果没有提供facelet参数，则序列化当前状态
    const state = facelet || this.serialize();
    
    // 颜色映射（上黄下白配色方案 - 标准日本配色）
    const colorMap: { [key: string]: string } = {
      'U': '黄', // Up - 黄色
      'R': '橙', // Right - 橙色
      'F': '绿', // Front - 绿色
      'D': '白', // Down - 白色
      'L': '红', // Left - 红色
      'B': '蓝'  // Back - 蓝色
    };
    
    // 打印魔方的二维展开图
    console.log("魔方状态 (二维展开图):");
    console.log("      +---+---+---+");
    
    // 打印顶面 (U)
    for (let i = 0; i < 3; i++) {
      let row = "      | ";
      for (let j = 0; j < 3; j++) {
        const faceColor = state[i * 3 + j];
        row += colorMap[faceColor] + " | ";
      }
      console.log(row);
      console.log("      +---+---+---+");
    }
    
    console.log("");
    
    // 打印中间四面 (L, F, R, B)
    for (let i = 0; i < 3; i++) {
      let row = "";
      // 左面 (L)
      row += "| ";
      for (let j = 0; j < 3; j++) {
        const faceColor = state[36 + i * 3 + j]; // 左面索引从36开始
        row += colorMap[faceColor] + " | ";
      }
      row += "  ";
      
      // 前面 (F)
      for (let j = 0; j < 3; j++) {
        const faceColor = state[18 + i * 3 + j]; // 前面索引从18开始
        row += "| ";
        row += colorMap[faceColor] + " | ";
      }
      row += "  ";
      
      // 右面 (R)
      for (let j = 0; j < 3; j++) {
        const faceColor = state[9 + i * 3 + j]; // 右面索引从9开始
        row += "| ";
        row += colorMap[faceColor] + " | ";
      }
      row += "  ";
      
      // 后面 (B)
      for (let j = 0; j < 3; j++) {
        const faceColor = state[45 + i * 3 + j]; // 后面索引从45开始
        row += "| ";
        row += colorMap[faceColor] + " | ";
      }
      
      console.log(row);
      
      // 打印分隔线
      let separator = "";
      for (let k = 0; k < 4; k++) {
        separator += "+---+---+---+  ";
      }
      console.log(separator);
    }
    
    console.log("");
    
    // 打印底面 (D)
    console.log("      +---+---+---+");
    for (let i = 0; i < 3; i++) {
      let row = "      | ";
      for (let j = 0; j < 3; j++) {
        const faceColor = state[27 + i * 3 + j]; // 底面索引从27开始
        row += colorMap[faceColor] + " | ";
      }
      console.log(row);
      console.log("      +---+---+---+");
    }
    
    console.log("\n图例:");
    console.log("U: 顶面(黄)  R: 右面(橙)  F: 前面(绿)  D: 底面(白)  L: 左面(红)  B: 后面(蓝)\n");
  }
}
