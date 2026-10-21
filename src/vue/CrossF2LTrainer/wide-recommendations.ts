import type { GripRoute } from './recommendations';

export interface WideRecommendation {
  id: string;
  front: string;
  moves: string[];
  displayMoves: string[];
  physicalMoves: string[];
  route: GripRoute;
  depth: number;
  backTurns: number;
}

export interface WideResult {
  limited: boolean;
  buckets: { front: string; solutions: WideRecommendation[] }[];
}

const TOKEN = /^(?:[URFDLB](?:2|')?|[ud](?:2|')?)$/;
const INPUT_TOKEN = /^(?:[URFDLB](?:2|')?|u'?)$/;
const FRONT_MAP: { [front: string]: { [face: string]: string } } = {
  F: {}, L: { F: 'L', R: 'F', B: 'R', L: 'B' },
  B: { F: 'B', R: 'L', B: 'F', L: 'R' },
  R: { F: 'R', R: 'B', B: 'L', L: 'F' },
};

/** Map a turn through a face-frame transformation, preserving wide-turn notation. */
export function mapWideMove(move: string, faceMap: { [face: string]: string }): string {
  if (!TOKEN.test(move)) throw new Error(`无效宽转记号：${move}`);
  const face = move[0].toUpperCase();
  const mapped = faceMap[face] || face;
  if (!/^[URFDLB]$/.test(mapped)) throw new Error(`无效面映射：${mapped}`);
  return (move[0] === 'u' || move[0] === 'd' ? mapped.toLowerCase() : mapped) + move.slice(1);
}

/** z2 is a half turn, so suffix direction is unchanged. */
export function wideToPhysicalMove(move: string, whiteBottom: boolean): string {
  if (!whiteBottom) return mapWideMove(move, {});
  return mapWideMove(move, { U: 'D', D: 'U', L: 'R', R: 'L' });
}

export function parseWideRecommendations(facelets: string, input: any): WideResult {
  if (!/^[URFDLB]{54}$/.test(facelets)) throw new Error('面片必须是 54 个合法字符');
  if (!input || typeof input.limited !== 'boolean' || !Array.isArray(input.buckets)
    || input.buckets.length !== 4) throw new Error('无效宽转候选结构');
  const seen = new Set<string>();
  const buckets = input.buckets.map((bucket: any) => {
    const front = bucket?.front;
    if (['F', 'L', 'B', 'R'].indexOf(front) < 0 || seen.has(front)
      || !Array.isArray(bucket.solutions) || bucket.solutions.length > 100) {
      throw new Error('无效宽转候选朝向或数量');
    }
    seen.add(front);
    return { front, solutions: bucket.solutions.map((candidate: any, index: number) => {
      const moves = candidate?.moves;
      if (!Array.isArray(moves) || moves.length < 1 || moves.length > 8
        || !moves.every((move: any) => typeof move === 'string' && INPUT_TOKEN.test(move))) {
        throw new Error('无效宽转候选记号或步数');
      }
      if (!moves.some((move: string) => move[0] === 'u')) throw new Error('候选缺少宽转');
      const route = candidate.route;
      if (!Number.isFinite(route?.score) || !Number.isInteger(route?.regrips)
        || !Array.isArray(route?.steps) || !route.steps.every((step: any) =>
          typeof step?.movement === 'string' && typeof step?.instruction === 'string')
        || !Number.isInteger(candidate.back_turns) || candidate.back_turns < 0) {
        throw new Error('无效宽转候选指法或转背次数');
      }
      return {
        id: `wide:${front}:${index}:${moves.join(' ')}`, front, moves: moves.slice(),
        displayMoves: moves.slice(), physicalMoves: moves.map((move: string) => mapWideMove(move, FRONT_MAP[front])),
        route, depth: moves.length, backTurns: candidate.back_turns,
      };
    }) };
  });
  return { limited: input.limited, buckets };
}
