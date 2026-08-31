// 块类型识别与命名工具
// 位置索引编码: index = z * order * order + y * order + x
// 坐标取值: 3 阶时 x/y/z ∈ {-1, 0, 1}

export type PieceType = "corner" | "edge" | "center";

export interface PieceCoords {
  x: number;
  y: number;
  z: number;
}

export function coordsOf(index: number, order: number = 3): PieceCoords {
  const half = (order - 1) / 2;
  return {
    x: (index % order) - half,
    y: Math.floor((index % (order * order)) / order) - half,
    z: Math.floor(index / (order * order)) - half,
  };
}

// 角块: 三轴坐标均非零; 棱块: 恰好两轴非零; 中心块: 仅一轴非零
export function pieceTypeOf(index: number, order: number = 3): PieceType {
  const { x, y, z } = coordsOf(index, order);
  const sum = Math.abs(x) + Math.abs(y) + Math.abs(z);
  if (sum === 3) {
    return "corner";
  }
  if (sum === 2) {
    return "edge";
  }
  return "center";
}

// 块的标准命名（以其初始/还原位置命名）: 先 U/D, 再 F/B, 最后 R/L
// 例如 (1,1,1) -> "UFR", (1,-1,1) -> "DFR", (1,0,1) -> "FR"
export function pieceName(index: number, order: number = 3): string {
  const { x, y, z } = coordsOf(index, order);
  let name = "";
  if (y > 0) {
    name += "U";
  } else if (y < 0) {
    name += "D";
  }
  if (z > 0) {
    name += "F";
  } else if (z < 0) {
    name += "B";
  }
  if (x > 0) {
    name += "R";
  } else if (x < 0) {
    name += "L";
  }
  return name;
}

// 位置索引旋转映射: 绕 axis 轴旋转 times 次 90° 后该位置的新索引
// 与 group.rotate 的 rotateOnWorldAxis(axis, angle) 同向 (右手系, 逆时针为正)
// axis 取 "x" / "y" / "z" (兼容 "z'" 写法, 仅取首字符)
export function rotatePositionIndex(index: number, axis: string, times: number, order: number = 3): number {
  const quarter = ((times % 4) + 4) % 4; // 规格化到 0~3
  if (quarter === 0) {
    return index;
  }
  let { x, y, z } = coordsOf(index, order);
  for (let i = 0; i < quarter; i++) {
    // 每次 +90°: Rx: (y,z)->(-z,y); Ry: (x,z)->(z,-x); Rz: (x,y)->(-y,x)
    if (axis[0] === "x") {
      const ny = -z;
      z = y;
      y = ny;
    } else if (axis[0] === "y") {
      const nx = z;
      z = -x;
      x = nx;
    } else {
      const nx = -y;
      y = x;
      x = nx;
    }
  }
  const half = (order - 1) / 2;
  return (z + half) * order * order + (y + half) * order + (x + half);
}

// 基准视角操作序列: 每项表示整体绕 axis 轴转 times 个 90° (z2 与 y 不对易, 须用序列表达复合姿态)
export interface BaseOp {
  axis: "y" | "z";
  times: number;
}

// 按视角操作序列映射位置: 沿序列顺序链式外包 rotatePositionIndex
export function rotatePositionByOps(index: number, ops: BaseOp[], order: number = 3): number {
  let result = index;
  for (const op of ops) {
    result = rotatePositionIndex(result, op.axis, op.times, order);
  }
  return result;
}

// 六个面中心的标准坐标 (3 阶时仅一轴非零)
const FACE_COORDS: { [ch: string]: PieceCoords } = {
  U: { x: 0, y: 1, z: 0 },
  D: { x: 0, y: -1, z: 0 },
  L: { x: -1, y: 0, z: 0 },
  R: { x: 1, y: 0, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  B: { x: 0, y: 0, z: -1 },
};

// 位置索引所在面的字符 (仅对中心/面方向有效)
function faceCharOfIndex(index: number, order: number = 3): string {
  const { x, y, z } = coordsOf(index, order);
  if (y > 0) {
    return "U";
  }
  if (y < 0) {
    return "D";
  }
  if (z > 0) {
    return "F";
  }
  if (z < 0) {
    return "B";
  }
  if (x > 0) {
    return "R";
  }
  return "L";
}

// 基准视角操作序列的层名字符映射 (泛化版)。
// 基准姿态 = 视角操作序列 baseOps 的复合 (z2 按钮 / y·y' 按钮按时间顺序累积)。
// ops 为按钮/twist 语义 (正 times 绕负轴), 故姿态位置映射 R 按序取 -times 复合:
// R(p) = R_{axis_k}(-t_k)(...R_{axis_1}(-t_1)(p))。
// 字符映射: C[f] = faceCharAt(R(centerOf(f)))。
// mapBaseOpsFacelets 把姿态 serialize 串的字符按 C 改名回标准求解坐标 (中心恢复 URFDLB):
// serialize 按位置读块, S_pose[i] = S_std[R⁻¹(i)], 逐字符按 C 改名后 S_map = C∘S_std∘C⁻¹,
// 中心位 (C 的不动点) 恢复 URFDLB。
// 播放无需字符转换: 引擎层 twist 为位置语义 (按当前位置收集块), 基准姿态下按世界层直接
// 执行姿态系面名解法, 与「逆放→C⁻¹ 改名执行→重放」净效果数学等价 (见 CrossF2LTrainer play 注释)。
export function baseOpsFaceCharMap(ops: BaseOp[], order: number = 3): { [ch: string]: string } {
  const pose = ops.map((op) => ({ axis: op.axis, times: -op.times }));
  const map: { [ch: string]: string } = {};
  const half = (order - 1) / 2;
  for (const f of Object.keys(FACE_COORDS)) {
    const c = FACE_COORDS[f];
    const center = (c.z + half) * order * order + (c.y + half) * order + (c.x + half);
    map[f] = faceCharOfIndex(rotatePositionByOps(center, pose, order), order);
  }
  return map;
}

// 按映射表整体替换状态串字符, 把姿态串变换回标准求解坐标 (中心恢复 URFDLB)。
export function mapBaseOpsFacelets(state: string, ops: BaseOp[], order: number = 3): string {
  const map = baseOpsFaceCharMap(ops, order);
  let result = "";
  for (const ch of state) {
    result += map[ch] || ch;
  }
  return result;
}
