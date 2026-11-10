import { BaseOp, pieceName, rotatePositionByOps } from './pieces';

const FACE_POSITIONS: { [face: string]: number } = { U: 16, D: 10, F: 22, B: 4, R: 14, L: 12 };

export function positionFaces(index: number | null): string[] {
  return index === null ? [] : pieceName(index).split('');
}

export function rotateStickerFace(face: string, ops: BaseOp[]): string {
  return face in FACE_POSITIONS ? pieceName(rotatePositionByOps(FACE_POSITIONS[face], ops)) : '';
}

export function selectEdgeSticker(stickers: { color: string; face: string }[], previous = ''): string {
  if (stickers.some(sticker => sticker.color === previous)) return previous;
  for (const face of ['U', 'B', 'F']) {
    const sticker = stickers.find(item => item.face === face);
    if (sticker) return sticker.color;
  }
  return stickers[0]?.color || '';
}

export function stickerVerdict(answer: {
  enabled: boolean; index: number | null; face: string; actualIndex: number; actualFace: string;
}): 'disabled' | 'correct' | 'incorrect' | 'incomplete' {
  if (!answer.enabled) return 'disabled';
  if (answer.index === null || !answer.face) return 'incomplete';
  return answer.index === answer.actualIndex && answer.face === answer.actualFace ? 'correct' : 'incorrect';
}

export function normalizePredictionFormula(input: string): string {
  const formula = input.replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ');
  if (!formula) throw new Error('请输入自定义解法');
  if (!formula.split(' ').every(move => /^[URFDLBMESurfdlb](['2])?$/.test(move))) {
    throw new Error("解法无效：支持 U R F D L B、M E S、双层小写转动及 ' / 2 后缀，请用空格分隔");
  }
  return formula;
}
