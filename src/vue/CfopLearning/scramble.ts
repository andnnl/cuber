/** Keep the 3D setup grammar aligned with the CFOP WASM input grammar. */
export function normalizeCfopScramble(input: string): string {
  const text = input.trim().replace(/\s+/g, ' ');
  if (/^[URFDLB]{54}$/.test(text)) {
    if (['U', 'R', 'F', 'D', 'L', 'B'].every(color => text.split(color).length === 10)) return text;
    throw new Error('打乱公式无效：54 位状态需每种颜色各 9 个');
  }
  const moves = text.split(' ');
  if (!text || !moves.every((move, index) =>
    /^[URFDLB](?:2|')?$/.test(move) || move === 'z2' && index === moves.length - 1 && index > 0)) {
    throw new Error('打乱公式无效：请输入六面转动（如 R U2 F\'），末尾可加 z2');
  }
  return text;
}
