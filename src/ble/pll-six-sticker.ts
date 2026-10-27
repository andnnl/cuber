import { PLL_SIX_CATALOG } from './pll-six-sticker-catalog';
import CubieCube from '../solver/CubieCube';

export type SixRelation = '同' | '对' | '邻';
export type SixShape = '团' | '眼' | '棒左' | '棒右' | '灯';
export type PllSixDescription = {
  six: string;
  left: SixShape;
  right: SixShape;
  chapter: number;
  colorCount: number;
  relations: SixRelation[][];
  signature: string;
};

const FACE_CENTERS = [4, 13, 22, 31, 40, 49];
const SIX_INDICES = [18, 19, 20, 9, 10, 11];

function validFacelets(facelets: string): boolean {
  if (facelets.length !== 54 || !/^[URFDLB]{54}$/.test(facelets)) return false;
  const centers = FACE_CENTERS.map(i => facelets[i]);
  if (new Set(centers).size !== 6) return false;
  return centers.every(color => facelets.split(color).length === 10);
}

export function extractPllSix(facelets: string): string | null {
  return validFacelets(facelets) ? SIX_INDICES.map(i => facelets[i]).join('') : null;
}

function shape(a: string, b: string, c: string): SixShape {
  if (a === b && b === c) return '团';
  if (a === c) return '眼';
  if (a === b) return '棒左';
  if (b === c) return '棒右';
  return '灯';
}

function chapter(left: SixShape, right: SixShape): number {
  if (left === '团') return 1;
  if (right === '团') return 2;
  if (left === '眼' && right === '眼') return 3;
  if (left === '眼') return 4;
  if (right === '眼') return 5;
  if (left.startsWith('棒') && right.startsWith('棒')) return 6;
  if (left === '灯' && right.startsWith('棒')) return 7;
  if (right === '灯' && left.startsWith('棒')) return 8;
  return 9;
}

export function describePllSix(facelets: string): PllSixDescription | null {
  const six = extractPllSix(facelets);
  if (!six) return null;
  const colors = FACE_CENTERS.map(i => facelets[i]);
  const opposites = new Map([[colors[0], colors[3]], [colors[3], colors[0]],
    [colors[1], colors[4]], [colors[4], colors[1]], [colors[2], colors[5]], [colors[5], colors[2]]]);
  const relations: SixRelation[][] = Array.from({ length: 6 }, (_, i) =>
    Array.from({ length: 6 }, (_, j) => six[i] === six[j] ? '同' : opposites.get(six[i]) === six[j] ? '对' : '邻'));
  const left = shape(six[0], six[1], six[2]);
  const right = shape(six[3], six[4], six[5]);
  let signature = '';
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    signature += relations[i][j] === '同' ? '=' : relations[i][j] === '对' ? '!' : '.';
  }
  return { six, left, right, chapter: chapter(left, right), colorCount: new Set(six).size,
    relations, signature };
}

export function sixSignature(facelets: string): string | null {
  return describePllSix(facelets)?.signature || null;
}

export type PllSixMatch = PllSixDescription & { name: string };
export function matchPllSix(facelets: string): PllSixMatch | null {
  const description = describePllSix(facelets);
  if (!description) return null;
  // 关系签名只描述六格；若其余魔方尚未完成，偶然同签名也不是 PLL 案例。
  for (const base of [0, 27]) for (let i = 0; i < 9; i++) {
    if (facelets[base + i] !== facelets[base + 4]) return null;
  }
  for (const base of [9, 18, 36, 45]) for (let i = 3; i < 9; i++) {
    if (facelets[base + i] !== facelets[base + 4]) return null;
  }
  const cube = new CubieCube();
  if (!cube.deserialize(facelets) || cube.verify()) return null;
  const centers = FACE_CENTERS.map(i => facelets[i]);
  const normalized = [...facelets].map(color => 'URFDLB'[centers.indexOf(color)]).join('');
  if (cube.serialize() !== normalized) return null;
  const name = PLL_SIX_CATALOG[description.signature];
  return name ? { ...description, name } : null;
}

// 只校验原图明确给出的等号、对／邻和色数；未给出的关系不推断。
export function studyCellsForSix(cells: string[], feature: Pick<PllSixDescription, 'relations'>): string[] {
  return cells.map(cell => {
    if (!cell.startsWith('六格 ')) return cell;
    const variant = cell.split('｜').find(part => {
      const text = part.replace(/^六格 [URFDLB]{6}：/, '');
      const pattern = /([1-6](?:、[1-6])*)\s*↔\s*([1-6](?:、[1-6])*)：(对|邻)/g;
      let pair: RegExpExecArray | null;
      let found = false;
      while ((pair = pattern.exec(text)) !== null) {
        found = true;
        const [, left, right, expected] = pair;
        if (!left.split('、').every(a => right.split('、').every(b =>
          feature.relations[Number(a) - 1][Number(b) - 1] === expected))) return false;
      }
      return found;
    });
    return variant ? variant.replace(/^六格 [URFDLB]{6}：/, '') : '当前六格无对应朝向描述';
  });
}

export function studyRowDifferences(feature: Pick<PllSixDescription, 'six' | 'colorCount' | 'relations'>,
  cells: string[]): string[] {
  cells = studyCellsForSix(cells, feature);
  const text = cells.join('；');
  const differences: string[] = [];
  if (text.includes('当前六格无对应朝向描述')) differences.push('当前六格无对应朝向描述');
  const relation = (a: string, b: string) => feature.relations[Number(a) - 1][Number(b) - 1];
  for (const chain of text.match(/[1-6](?:＝[1-6])+/g) || []) {
    const [first, ...rest] = chain.split('＝');
    for (const second of rest) if (relation(first, second) !== '同') differences.push(`${first} 与 ${second} 并非同色`);
  }
  const pairPattern = /([1-6](?:、[1-6])*)\s*↔\s*([1-6](?:、[1-6])*)：(对|邻)/g;
  let match: RegExpExecArray | null;
  while ((match = pairPattern.exec(text)) !== null) {
    for (const a of match[1].split('、')) for (const b of match[2].split('、')) {
      const actual = relation(a, b);
      if (actual !== match[3]) differences.push(`${a} 与 ${b}：原图${match[3]}色，实际${actual}色`);
    }
  }
  if (text.includes('一组同色、一组对色') &&
    [relation('2', '4'), relation('3', '5')].sort().join('') !== '同对') differences.push('两组同／对色不符');
  const count = Number(cells[cells.length - 1]?.match(/^[2-4]/)?.[0]);
  if (count && !cells[cells.length - 1].includes('除去') && count !== feature.colorCount)
    differences.push(`色数：原图${count}色，实际${feature.colorCount}色`);
  const subsetPattern = /除去\s*([1-6])、([1-6])\s*剩余([三四])色/g;
  while ((match = subsetPattern.exec(text)) !== null) {
    const first = Number(match[1]) - 1, second = Number(match[2]) - 1;
    const colors = [...feature.six].filter((_, i) => i !== first && i !== second);
    if (new Set(colors).size !== (match[3] === '三' ? 3 : 4)) differences.push(`原图${match[0]}不符`);
  }
  return differences;
}

const PAIRS: Array<[number, number]> = [];
for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) PAIRS.push([i, j]);

// 先按肉眼可见的左／右形态分组，只推荐能排除同形态其他 PLL 的关系。
export function distinguishingRelations(feature: PllSixMatch): string[] {
  const shapeCode = (code: string): string => [0, 1, 5, 12, 13, 14].map(i => code[i]).join('');
  const sameShape = shapeCode(feature.signature);
  let competitors = Object.keys(PLL_SIX_CATALOG).filter(code =>
    PLL_SIX_CATALOG[code] !== feature.name && shapeCode(code) === sameShape);
  const remaining = PAIRS.map((_, i) => i);
  const hints: string[] = [];
  while (competitors.length > 0 && remaining.length > 0) {
    remaining.sort((a, b) =>
      competitors.filter(code => code[b] !== feature.signature[b]).length -
      competitors.filter(code => code[a] !== feature.signature[a]).length);
    const index = remaining.shift()!;
    if (competitors.every(code => code[index] === feature.signature[index])) break;
    const [a, b] = PAIRS[index];
    hints.push(`${a + 1} 与 ${b + 1} ${feature.relations[a][b]}色`);
    competitors = competitors.filter(code => code[index] === feature.signature[index]);
  }
  return hints;
}
