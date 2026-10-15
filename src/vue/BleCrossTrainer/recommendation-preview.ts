import { baseOpsFaceCharMap, BaseOp } from "../CrossF2LTrainer/pieces";

// 固定基准：白顶、黄底、绿前。贴纸配色设置不会改变中心块的身份。
const CENTER_COLORS: { [face: string]: string } = {
  U: "白", D: "黄", F: "绿", R: "红", B: "蓝", L: "橙",
};

/** 搜索快照视角中的正面字母，反查打乱前对应的中心块颜色。 */
export function recommendationFrontColor(front: string, viewOps: BaseOp[]): string {
  const screenFaces = baseOpsFaceCharMap(viewOps);
  const originalFace = Object.keys(CENTER_COLORS).find(face => screenFaces[face] === front);
  return originalFace ? CENTER_COLORS[originalFace] : "";
}

/** group.twist 语义下，将当前屏幕中的指定正面转到 F 所需的 y 四分之一转数。 */
export function recommendationFrontTurn(front: string): number {
  return { F: 0, R: 1, B: 2, L: -1 }[front] || 0;
}
