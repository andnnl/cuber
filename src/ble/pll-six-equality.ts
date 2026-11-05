import { PllSixMatch, SixRelation } from './pll-six-sticker';
import { PLL_SCAN_CASES } from './pll-six-scan-catalog';

type EqualityCase = { name: string; auf: string; six: string };
type EqualityFinal = { a: number; b: number; answers: Record<string, string> };
export type PllEqualityGroup = {
  pattern: string; leftShape: string; names: string[]; six: string; cases: EqualityCase[]; final: EqualityFinal | null;
};
export type PllEqualityPlan = {
  name: string; pattern: string; leftShape: string;
  groups: Array<{ label: string; positions: number[] }>;
  rightSteps: Array<{ position: number; text: string }>;
  sameSegments: Array<{ a: number; b: number; relation: SixRelation; label: string }>;
  final: { a: number; b: number; relation: SixRelation } | null;
};

function colorPattern(six: string): string {
  const colors: string[] = [];
  return [...six].map(color => {
    if (colors.indexOf(color) < 0) colors.push(color);
    return String.fromCharCode(65 + colors.indexOf(color));
  }).join('');
}

function leftShape(pattern: string): string {
  const [first, middle, last] = pattern;
  if (first === middle && middle === last) return '团';
  if (first === last) return '眼';
  if (first === middle) return '棒左';
  if (middle === last) return '棒右';
  return '灯';
}

function caseRelation(sample: EqualityCase, reference: number, position: number): SixRelation {
  const first = sample.six[reference - 1], second = sample.six[position - 1];
  const opposite: Record<string, string> = { F: 'B', B: 'F', R: 'L', L: 'R' };
  return first === second ? '同' : opposite[first] === second ? '对' : '邻';
}

function buildGroups(): PllEqualityGroup[] {
  const patterns = new Map<string, EqualityCase[]>();
  for (const [name, auf, six] of PLL_SCAN_CASES) {
    const pattern = colorPattern(six);
    if (!patterns.has(pattern)) patterns.set(pattern, []);
    patterns.get(pattern)!.push({name, auf, six});
  }
  return [...patterns].map(([pattern, cases]) => {
    const names = [...new Set(cases.map(sample => sample.name))].sort();
    let final: EqualityFinal | null = null;
    if (names.length > 1) {
      for (const reference of [5,4,3,2,1]) {
        const answers: Record<string, string> = {};
        let valid = true;
        for (const sample of cases) {
          const relation = caseRelation(sample, reference, 6);
          if (relation === '同' || (answers[relation] && answers[relation] !== sample.name)) { valid = false; break; }
          answers[relation] = sample.name;
        }
        if (valid && Object.keys(answers).length === 2) { final = {a:reference, b:6, answers}; break; }
      }
      if (!final) throw Error(`同色分组存在未消除冲突：${pattern}`);
    }
    return {pattern, names, cases, final, six:cases[0].six, leftShape:leftShape(pattern)};
  }).sort((first, second) => first.pattern.localeCompare(second.pattern));
}

const STUDY_GROUPS = buildGroups();
export function pllEqualityStudyGroups(): PllEqualityGroup[] { return STUDY_GROUPS; }

export function pllEqualityPlan(feature: Pick<PllSixMatch, 'name' | 'relations'> | null): PllEqualityPlan | null {
  if (!feature || feature.relations.length !== 6) return null;
  const letters: string[] = [];
  let nextGroup = 0;
  for (let position = 0; position < 6; position++) {
    const earlier = letters.findIndex((label, reference) => feature.relations[reference]?.[position] === '同');
    letters.push(earlier >= 0 ? letters[earlier] : String.fromCharCode(65 + nextGroup++));
  }
  const pattern = letters.join('');
  const group = STUDY_GROUPS.find(item => item.pattern === pattern);
  if (!group) return null;
  for (let position = 0; position < 6; position++) for (let reference = 0; reference < 6; reference++) {
    const relation = feature.relations[reference]?.[position];
    if (['同','对','邻'].indexOf(relation) < 0 || relation !== feature.relations[position]?.[reference] ||
      (relation === '同') !== (letters[position] === letters[reference])) return null;
  }
  const relation = group.final ? feature.relations[group.final.a - 1][group.final.b - 1] : null;
  const name = group.final ? group.final.answers[relation!] : group.names[0];
  if (name !== feature.name) return null;
  const groups = [...new Set(letters)].map(label => ({label,
    positions:letters.map((letter, index) => letter === label ? index + 1 : 0).filter(position => position > 0)}));
  const sameSegments = groups.reduce<PllEqualityPlan['sameSegments']>((segments,item) => segments.concat(
    item.positions.slice(1).map((position, index) =>
      ({a:item.positions[index], b:position, relation:'同' as SixRelation, label:`${item.label} 组同色` }))), []);
  const rightSteps = [4,5,6].map(position => {
    const label = letters[position - 1];
    const earlier = letters.slice(0,position - 1).map((letter,index) => letter === label ? index + 1 : 0).filter(reference => reference > 0);
    return {position, text:earlier.length ? `第 ${position} 格与第 ${earlier.join('、')} 格同色，归 ${label} 组`
      : `第 ${position} 格与前面各组均不同色，新记 ${label} 组`};
  });
  return {name, pattern, leftShape:group.leftShape, groups, sameSegments, rightSteps,
    final:group.final ? {a:group.final.a, b:group.final.b, relation:relation!} : null};
}
