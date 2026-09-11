// 贴纸状态工具: 各品牌协议输出的 54 串 → 项目 serialize 布局换算 + 十字判定
//
// 项目 Cube.serialize() 与 Kociemba 标准 facelet 布局完全一致 (URFDLB 六组各 9 字符,
// 见 src/cuber/cube.ts serialize 的遍历顺序, 且 Rust 侧 to_cube_state_string 与之对齐),
// GAN 协议输出的就是 Kociemba 串, 因此换算为恒等; 其他品牌接入时在此处做重排。

/** 复原态 (即各面中心色): U上 R右 F前 D下 L左 B后 */
export const SOLVED_FACELETS = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

/**
 * 品牌串 → 项目布局串。
 * GAN 输出即 Kociemba 布局, 直接校验后返回; 非法返回 null (触发 resync)。
 */
export function brandFaceletsToState(raw: string): string | null {
  if (!raw || raw.length !== 54) {
    return null;
  }
  for (let i = 0; i < 54; i++) {
    if ("URFDLB".indexOf(raw[i]) < 0) {
      return null;
    }
  }
  // 中心块必须仍在各自面 (智能魔方以核心为坐标框架, 中心恒定)
  const centers = [4, 13, 22, 31, 40, 49];
  for (let i = 0; i < 6; i++) {
    if (raw[centers[i]] !== SOLVED_FACELETS[centers[i]]) {
      return null;
    }
  }
  return raw;
}

/** 十字 4 条棱的贴纸位置: DF/DR/DB/DL (D 面贴纸 + 侧面贴纸) */
const CROSS_EDGES: [number, number][] = [
  [28, 25], // DF: D2 + F8
  [32, 16], // DR: D6 + R6
  [34, 52], // DB: D8 + B8
  [30, 43], // DL: D4 + L4
];

/**
 * 判定十字是否完成 (纯状态判定):
 * D 面 4 条棱的 D 面贴纸 = 'D', 侧面贴纸 = 相邻面中心色。
 * 姿态无关 —— 智能魔方状态以核心为坐标系, 中心恒为 URFDLB。
 */
export function isCrossDone(facelets: string): boolean {
  if (!facelets || facelets.length !== 54) {
    return false;
  }
  return CROSS_EDGES.every(([dIdx, sideIdx]) => {
    const side = SOLVED_FACELETS[sideIdx]; // 侧贴纸应在的面字母
    return facelets[dIdx] === "D" && facelets[sideIdx] === side;
  });
}
