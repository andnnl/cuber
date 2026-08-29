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

// serialize 状态串的 z2 字符映射 (U↔D, L↔R, F/B 不变)
// 与整体旋转 z2 (绕 z 轴 180°) 的面共轭一致: 物理 z2 后各面位置的块来自 z2 共轭面,
// 对状态串做此映射可将其变换回标准求解坐标 (中心字符恢复 U R F D L B 标准排列)
const Z2_CHAR: { [key: string]: string } = { U: "D", D: "U", L: "R", R: "L", F: "F", B: "B" };

export function mapZ2Facelets(state: string): string {
  let result = "";
  for (const ch of state) {
    result += Z2_CHAR[ch] || ch;
  }
  return result;
}
