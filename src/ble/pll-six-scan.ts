import { PllSixMatch, SixRelation } from './pll-six-sticker';
import { PLL_SCAN_TREE, PLL_SCAN_CASES, PllScanNode } from './pll-six-scan-catalog';

export type PllScanStep = { a: number; b: number; relation: SixRelation; order: number; text: string };
export type PllScanPath = { name: string; steps: PllScanStep[] };
export type PllScanStudyCase = PllScanPath & { six: string; auf: string; id: string };

export function scanPllSix(feature: Pick<PllSixMatch, 'name' | 'relations'> | null): PllScanPath | null {
  if (!feature) return null;
  const steps: PllScanStep[] = [];
  let cursor: number | string | null = 0;
  while (typeof cursor === 'number') {
    const node: PllScanNode | undefined = PLL_SCAN_TREE[cursor];
    if (!node || steps.length >= PLL_SCAN_TREE.length) return null;
    const [reference, position] = node;
    const relation = feature.relations[reference - 1]?.[position - 1];
    const answer = ['同', '对', '邻'].indexOf(relation);
    if (answer < 0) return null;
    steps.push({ a: reference, b: position, relation, order: steps.length + 1,
      text: `${reference} 与 ${position} ${relation}色` });
    cursor = node[answer + 2];
  }
  return cursor === feature.name ? { name: cursor, steps } : null;
}

export function pllScanStudyCases(): PllScanStudyCase[] {
  const opposite: Record<string, string> = { F: 'B', B: 'F', R: 'L', L: 'R' };
  return PLL_SCAN_CASES.map(([name, auf, six]) => {
    const relations: SixRelation[][] = [...six].map(first => [...six].map(second =>
      first === second ? '同' : opposite[first] === second ? '对' : '邻'));
    const route = scanPllSix({ name, relations });
    if (!route) throw Error(`精简观察目录不匹配：${name} ${auf}`);
    return { ...route, six, auf, id: `${name}:${auf}` };
  });
}
