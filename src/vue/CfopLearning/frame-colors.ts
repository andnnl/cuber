// Rust 在末尾 z2 后用观察坐标重标记贴纸；3D 场景仍显示实体贴纸颜色。
// 两次转换互为逆操作，因此也可用于把实体颜色转回追踪使用的求解坐标。
export function relabelZ2Colors(facelets: string): string {
  const opposite: {[color: string]: string} = {U:'D', D:'U', R:'L', L:'R', F:'F', B:'B'};
  return facelets.replace(/[URFDLB]/g, color => opposite[color]);
}

export function hasInitialZ2(input: string): boolean {
  return /(?:^|\s)z2$/.test(input.trim());
}
