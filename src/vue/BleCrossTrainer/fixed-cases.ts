/** 独立案例库；不依赖当前 BLE 实体状态或训练轮次。 */
const ORDINARY = `R' F'
F R2
R' L
F B
F R'
D2 B'
U2 B2
D2 F2
F' R' F'
U' F R2
R2 F R2
F L R'
F' L R'
U2 F B2
R2 B' F2
R' F B
U' F R'
D' R' F'
D' F' R' F'
U' R' B' R'
R' U' F R2
F' U F' L
U' R2 F
F2 D' R2
R2 D F2
R' F L
R B' F2
R B' L F'
R'F L' B
R2 D R F'
L' B R' F2
U2 R' F B'
R' F' D L2 F'
R' U2 B' R' F
F D2 L2 F' R
B2 U2 R' F
R' D F' L
R' B' R' F
D2 R' L F B' U L2`;

const AWKWARD = `x U' R U x' R2
x U L D R U x'
L R B F D2 L R
x R D' L' U' F' R' U2 x'
M2 U2 M2
z' U' R U R' U' z
x U2 D2 z U2 D2 x'
z U2 D2 R2 x U2 D2
R2 U' x L2 U2 F' R2 x'
L R U2 y' r' U x R' F
x R' U R' z2 R' U R' x'
F U B L' R' F D' R'`;

export interface FixedCase {
  id: string;
  group: '普通情况' | '麻烦情况';
  formula: string;
  moves: string[];
  inverse: string;
  scoreable: boolean;
}

// 不允许引擎宽松解析器静默忽略未知记号。空格不是必须的（如 R'F）。
export function parseFixedFormula(text: string): string[] {
  const normalized = text.trim().replace(/[‘＇’]/g, "'");
  const tokens = normalized.match(/[URFDLBxyzMESrufdlb](?:2|')?/g) || [];
  if (tokens.join('') !== normalized.replace(/\s+/g, '')) {
    throw new Error(`不支持的公式：${text}`);
  }
  return tokens;
}

export function invertFixedMoves(moves: string[]): string[] {
  return moves.slice().reverse().map(move => move.endsWith('2') ? move :
    move.endsWith("'") ? move.slice(0, -1) : move + "'");
}

export const FIXED_CASES: FixedCase[] = ([
  ['普通情况', ORDINARY], ['麻烦情况', AWKWARD],
] as const).reduce((all: FixedCase[], [group, source]) => {
  source.split('\n').forEach((line, index) => {
    const moves = parseFixedFormula(line);
    all.push({ id: `${group === '普通情况' ? 'ordinary' : 'awkward'}-${index + 1}`,
      group, moves, formula: moves.join(' '), inverse: invertFixedMoves(moves).join(' '),
      scoreable: moves.every(move => /^[URFDLB]/.test(move)) });
  });
  return all;
}, []);

export function fixedMoveHint(move: string): string {
  const kind = move[0];
  const name: { [key: string]: string } = {
    U: '上层', R: '右层', F: '前层', D: '下层', L: '左层', B: '后层',
    x: '整颗绕左右轴', y: '整颗绕上下轴', z: '整颗绕前后轴',
    M: '左右中层', E: '上下中层', S: '前后中层',
    r: '右侧双层', u: '上侧双层', f: '前侧双层',
    d: '下侧双层', l: '左侧双层', b: '后侧双层',
  };
  const turn = move.endsWith('2') ? '转 180°' : move.endsWith("'") ? '逆向转 90°' : '顺向转 90°';
  return `${move}：${name[kind]}${turn}；保持另一只手稳定魔方`;
}
