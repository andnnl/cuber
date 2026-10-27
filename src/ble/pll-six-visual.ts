import { PllSixMatch, SixRelation, studyCellsForSix } from './pll-six-sticker';

export type PllVisualSegment = { a: number; b: number; relation: SixRelation; label?: string };
export type PllVisualClue = {
  kind: 'shape' | 'same' | 'relation' | 'count' | 'confirm';
  order: number;
  stickers: number[];
  segments: PllVisualSegment[];
  text: string;
};

type MinimalRow = { shape: string; same: string; conditions: string[] };
let cachedSource = '';
let cachedRows = new Map<string, MinimalRow>();

function rowsFromDocument(source: string): Map<string, MinimalRow> {
  if (cachedSource === source) return cachedRows;
  const rows = new Map<string, MinimalRow>();
  const pattern = /^\| (\d:[^|]+) \| ([^|]+) \| (?:(.*?) \| )?([^|]+) \|$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const [, key, shape, same = '', description] = match;
    const conditions = description.trim() === '—' ? []
      : description.split('；').map((value: string) => value.replace(/`/g, '').trim());
    rows.set(key, { shape: shape.trim(), same: same.trim(), conditions });
  }
  cachedSource = source;
  cachedRows = rows;
  return rows;
}

function relationClue(feature: PllSixMatch, description: string, order: number): PllVisualClue | null {
  const segments: PllVisualSegment[] = [];
  let text = '';
  const add = (a: number, b: number, relation: SixRelation): void => {
    if (feature.relations[a - 1][b - 1] !== relation) return;
    segments.push({ a, b, relation });
  };
  let parts: RegExpExecArray | null;
  if ((parts = /^([1-6])＝([1-6])$/.exec(description))) {
    add(Number(parts[1]), Number(parts[2]), '同');
    text = '两格同色';
  } else if ((parts = /^([1-6])≠([1-6])$/.exec(description))) {
    const a = Number(parts[1]), b = Number(parts[2]);
    const relation = feature.relations[a - 1][b - 1];
    if (relation === '同') return null;
    segments.push({ a, b, relation, label: '不同色' });
    text = '两格不同色';
  } else if ((parts = /^([1-6])↔([1-6])(?:、([1-6]))?(对|邻)$/.exec(description))) {
    for (const b of [parts[2], parts[3]].filter(Boolean)) add(Number(parts[1]), Number(b), parts[4] as SixRelation);
    text = parts[3] ? `该格与同色组${parts[4]}色` : `两格${parts[4]}色`;
  } else if (description === '2↔4 与 3↔5 一组同色、一组对色') {
    for (const [a, b] of [[2, 4], [3, 5]]) {
      const relation = feature.relations[a - 1][b - 1];
      if (relation === '同' || relation === '对') add(a, b, relation);
    }
    if (segments.length !== 2 || segments[0].relation === segments[1].relation) return null;
    text = '两组关系一组同色、一组对色';
  } else return null;
  if (segments.length !== (description.includes('、') && !description.includes('一组') ? 2
    : description.includes('一组') ? 2 : 1)) return null;
  return { kind: 'relation', order, segments,
    stickers: [...new Set(segments.reduce((all, segment) => [...all, segment.a, segment.b], [] as number[]))],
    text };
}

export function buildPllVisualClues(feature: PllSixMatch | null, document: string, originalCells: string[] = []): PllVisualClue[] {
  if (!feature) return [];
  const key = `${feature.chapter}:${feature.name}${feature.name === 'Z' ? `:${feature.colorCount}` : ''}`;
  const row = rowsFromDocument(document).get(key);
  if (!row || row.shape !== `${feature.left}/${feature.right}`) return [];
  const clues: PllVisualClue[] = [{ kind: 'shape', order: 1, stickers: [1, 2, 3, 4, 5, 6], segments: [],
    text: `左${feature.left}、右${feature.right}` }];
  const alternating = row.same.startsWith('随 U 朝向互换：');
  const branches = (alternating ? row.same.slice('随 U 朝向互换：'.length) : row.same).split(' / ');
  const choices = branches.map(branch => {
    const groups: number[][] = [];
    const groupPattern = /[1-6](?:＝[1-6])+/g;
    let groupMatch: RegExpExecArray | null;
    while ((groupMatch = groupPattern.exec(branch)) !== null) groups.push(groupMatch[0].split('＝').map(Number));
    return groups;
  });
  const matching = choices.filter(groups => groups.every(group => group.slice(1)
    .every(n => feature.relations[group[0] - 1][n - 1] === '同')));
  if (matching.length !== 1) return [];
  const activeGroups = matching[0];
  if (activeGroups.length) {
    const segments = activeGroups.reduce((pairs, group) => {
      for (let i = 1; i < group.length; i++) pairs.push({ a: group[i - 1], b: group[i], relation: '同' });
      return pairs;
    }, [] as PllVisualSegment[]);
    clues.push({ kind: 'same', order: clues.length + 1,
      stickers: [...new Set(activeGroups.reduce((all, group) => all.concat(group), [] as number[]))], segments,
      text: `同色格：${activeGroups.map(group => group.join('＝')).join('、')}` });
  }
  for (const description of row.conditions) {
    const count = /^六格([234])色$/.exec(description);
    const partial = /^除去([1-6])、([1-6])后([34])色$/.exec(description);
    if (count || partial) {
      const stickers = partial ? [1, 2, 3, 4, 5, 6].filter(n => n !== Number(partial[1]) && n !== Number(partial[2]))
        : [1, 2, 3, 4, 5, 6];
      if (new Set(stickers.map(n => feature.six[n - 1])).size !== Number((count || partial)![count ? 1 : 3])) return [];
      clues.push({ kind: 'count', order: clues.length + 1, stickers, segments: [],
        text: partial ? `其余四格 ${partial[3]} 色` : `六格 ${count![1]} 色` });
    } else {
      const clue = relationClue(feature, description, clues.length + 1);
      if (!clue) return [];
      clues.push(clue);
    }
  }
  // 色数虽能唯一判别，但教学时还需展示原图可直接观察的关系。
  if (clues.length === 2 && clues[1].kind === 'count' && originalCells.length) {
    const original = studyCellsForSix(originalCells, feature).join('；');
    const seen = new Set<string>();
    const append = (a: number, b: number, relation: SixRelation, text: string): void => {
      if (feature.relations[a - 1][b - 1] !== relation || (relation === '同' && (a <= 3) === (b <= 3))) return;
      const key = `${Math.min(a, b)}-${Math.max(a, b)}:${relation}`;
      if (seen.has(key)) return;
      seen.add(key);
      clues.push({ kind: 'confirm', order: 0, stickers: [a, b],
        segments: [{ a, b, relation }], text });
    };
    const equals = /[1-6](?:＝[1-6])+/g;
    let match: RegExpExecArray | null;
    while ((match = equals.exec(original)) !== null) {
      const [first, ...others] = match[0].split('＝').map(Number);
      for (const other of others) append(first, other, '同', `${first}＝${other}`);
    }
    const pairs = /([1-6](?:、[1-6])*)\s*↔\s*([1-6](?:、[1-6])*)：(对|邻)/g;
    while ((match = pairs.exec(original)) !== null) {
      for (const a of match[1].split('、')) for (const b of match[2].split('、'))
        append(Number(a), Number(b), match[3] as SixRelation, `${a}↔${b}${match[3]}`);
    }
  }
  return clues;
}
