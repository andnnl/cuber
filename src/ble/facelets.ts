// 贴纸状态工具: 各品牌协议输出的 54 串 → 项目 serialize 布局换算 + 十字/F2L 槽位判定
//
// 项目 Cube.serialize() 与 Kociemba 标准 facelet 布局完全一致 (URFDLB 六组各 9 字符,
// 见 src/cuber/cube.ts serialize 的遍历顺序, 且 Rust 侧 to_cube_state_string 与之对齐),
// GAN 协议输出的就是 Kociemba 串, 因此换算为恒等; 其他品牌接入时在此处做重排。

import { faceletsToCubie } from "./move-diff";

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

/** F2L 槽位 → (角块 cubie 索引, 棱块 cubie 索引), Kociemba 标准序
 *  角: URF=0 UFL=1 ULB=2 UBR=3 DFR=4 DLF=5 DBL=6 DRB=7
 *  棱: UR=0 UF=1 UL=2 UB=3 DR=4 DF=5 DL=6 DB=7 FR=8 FL=9 BL=10 BR=11 */
const F2L_SLOTS: { [slot: string]: [number, number] } = {
  FR: [4, 8],
  FL: [5, 9],
  BL: [6, 10],
  BR: [7, 11],
};

/**
 * 指定 F2L 槽位 (一对角+棱) 是否归位且朝向正确。
 * 姿态无关 —— cubie 状态以魔方核心为坐标系, 中心恒为 URFDLB。
 */
export function isF2LSlotDone(facelets: string, slot: string): boolean {
  const pair = F2L_SLOTS[slot];
  if (!pair || !facelets || facelets.length !== 54) {
    return false;
  }
  const state = faceletsToCubie(facelets);
  if (!state) {
    return false;
  }
  const [c, e] = pair;
  return state.cp[c] === c && state.co[c] === 0 && state.ep[e] === e && state.eo[e] === 0;
}

/** 已完整还原的 F2L 槽位列表 (FL/FR/BL/BR 的子集, 固定顺序) */
export function f2lSlotsDone(facelets: string): string[] {
  return ["FL", "FR", "BL", "BR"].filter((slot) => isF2LSlotDone(facelets, slot));
}
