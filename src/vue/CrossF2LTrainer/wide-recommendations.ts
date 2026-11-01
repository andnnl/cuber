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

const TOKEN = /^(?:[URFDLB]|[udrflb])(?:2|')?$/;
const INPUT_TOKEN = /^(?:[URFDLB]|[udrflb])(?:2|')?$/;
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
  return (move[0] === move[0].toLowerCase() ? mapped.toLowerCase() : mapped) + move.slice(1);
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
      if (!moves.some((move: string) => /^[udrflb]/.test(move))) throw new Error('候选缺少宽转');
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

/** The cached cubie search can return only candidates whose moved centers make the
 * displayed cross invalid. Start with an actual left-wide turn, normalize the
 * resulting center colors, then solve and verify the sticker-level result. */
export async function recoverWideCross(facelets: string,
  analyze: (normalized: string) => Promise<any>, replay: (state: string, moves: string[]) => string,
): Promise<WideRecommendation[]> {
  const recovered: WideRecommendation[] = [];
  const seen = new Set<string>();
  const perView = new Set<string>();
  for (const first of ['l', "l'", 'l2']) {
    const after = replay(facelets, [first]);
    const centers = [4, 13, 22, 31, 40, 49].map(index => after[index]);
    if (new Set(centers).size !== 6) continue;
    const normalized = Array.from(after, color => 'URFDLB'[centers.indexOf(color)]).join('');
    const result = await analyze(normalized);
    for (const bucket of result.buckets || []) {
      if (!FRONT_MAP[bucket.front]) continue;
      const inverse: { [face: string]: string } = {};
      for (const face of ['F', 'R', 'B', 'L']) {
        inverse[FRONT_MAP[bucket.front][face] || face] = face;
      }
      for (const solution of bucket.solutions || []) {
        if (perView.has(`${first}:${bucket.front}`)) break;
        const physicalMoves = [first, ...solution.moves.map((move: string) => mapWideMove(move, FRONT_MAP[bucket.front]))];
        if (physicalMoves.length > 8 || seen.has(physicalMoves.join(' '))) continue;
        const end = replay(facelets, physicalMoves);
        if (![28, 25, 32, 16, 34, 52, 30, 43].every(index =>
          end[index] === end[Math.floor(index / 9) * 9 + 4])) continue;
        seen.add(physicalMoves.join(' '));
        perView.add(`${first}:${bucket.front}`);
        const moves = [mapWideMove(first, inverse), ...solution.moves];
        recovered.push({ id: `wide:recovered:${bucket.front}:${moves.join(' ')}`,
          front: bucket.front, moves, displayMoves: moves.slice(), physicalMoves,
          route: { score: 0, regrips: 0, steps: [] }, depth: moves.length,
          backTurns: physicalMoves.filter(move => move[0] === 'B').length });
      }
    }
  }
  return recovered;
}
