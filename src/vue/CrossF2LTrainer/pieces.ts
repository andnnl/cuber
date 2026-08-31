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

// serialize 状态串的整体旋转字符映射。
// 白底方案基准姿态 = z2 (applyOrientation) 复合 baseTurn 次 y 轴 90° (rotateY 按钮)。
// 注意 y 与 z2 不可交换, 复合旋转的共轭面置换随 baseTurn 变化 (y 一次: F→L→B→R→F),
// 字符映射 = 该复合置换, 可把姿态状态串变换回标准求解坐标 (中心字符恢复标准排列)。
// 字符替换与位置转可交换, 故求解得到的解法按物理面名直接执行即可, 无需再转换。
const Z2_CHAR: { [key: string]: string } = { U: "D", D: "U", L: "R", R: "L", F: "F", B: "B" };
// 物理 y twist(+1) (绕负 y 轴 90°, 即「y」按钮一次) 的面置换: F→L, L→B, B→R, R→F (U/D 不动)
const Y1_CHAR: { [key: string]: string } = { U: "U", D: "D", F: "L", L: "B", B: "R", R: "F" };

// 按 z2 复合 y^baseTurn 的共轭置换映射状态串 (baseTurn 任意整数, 内部规格化)
export function mapBaseTurnFacelets(state: string, baseTurn: number): string {
  let map = Z2_CHAR;
  const n = ((baseTurn % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    const next: { [key: string]: string } = {};
    for (const ch of Object.keys(Y1_CHAR)) {
      next[ch] = Y1_CHAR[map[ch]]; // C_{k+1} = Y1 ∘ C_k
    }
    map = next;
  }
  let result = "";
  for (const ch of state) {
    result += map[ch] || ch;
  }
  return result;
}
