const assert = require('node:assert/strict');
const fs = require('node:fs');
const { extractPllSix, describePllSix, sixSignature, matchPllSix,
  distinguishingRelations, studyRowDifferences } = require('../.tmp/ble/pll-six-sticker.js');
const { PLL_SIX_CATALOG } = require('../.tmp/ble/pll-six-sticker-catalog.js');
const { buildPllVisualClues } = require('../.tmp/ble/pll-six-visual.js');

const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
assert.equal(extractPllSix(solved), 'FFFRRR');
assert.equal(describePllSix(solved).chapter, 1);
assert.equal(describePllSix(solved).left, '团');
assert.equal(describePllSix(solved).right, '团');
assert.equal(describePllSix(solved).colorCount, 2);
assert.equal(describePllSix(solved).relations[0][1], '同');
assert.equal(describePllSix(solved).relations[0][3], '邻');
assert.equal(sixSignature(solved), sixSignature(solved.replace(/[FRBL]/g,
  color => ({F: 'B', B: 'F', R: 'L', L: 'R'})[color])));
assert.equal(extractPllSix(''), null);
assert.equal(describePllSix('U'.repeat(54)), null);
assert.equal(matchPllSix(solved), null, '非 PLL 案例不得借用已知答案');
const fCase = 'UUUUUUUUUBRFRRRRRRFBRFFFFFFDDDDDDDDDLLLLLLLLLRFBBBBBBB';
assert.equal(matchPllSix(fCase).name, 'F');
assert.equal(matchPllSix(fCase).chapter, 9);
assert.equal(matchPllSix(fCase).six, 'FBRBRF');
const notPll = [...fCase];
[notPll[0], notPll[27]] = [notPll[27], notPll[0]];
assert.equal(matchPllSix(notPll.join('')), null, '六格相同但底层或顶面未完成时不可误判 PLL');
for (const [a, b] of [[36, 45], [9, 18]]) {
  const impossible = [...fCase];
  [impossible[a], impossible[b]] = [impossible[b], impossible[a]];
  assert.equal(matchPllSix(impossible.join('')), null, `交换 ${a}/${b} 后不再是合法 PLL`);
}
const observed = six => ({ six, colorCount: new Set(six).size, relations: [...six].map(a => [...six].map(b =>
  a === b ? '同' : ({ F: 'B', B: 'F', R: 'L', L: 'R' })[a] === b ? '对' : '邻')) });
const guide = fs.readFileSync('docs/pll-six-sticker-observation.md', 'utf8');
const minimalGuide = fs.readFileSync('docs/pll6-minimal-observation-features.md', 'utf8');
const guideRow = (shape, name) => guide.split('\n').find(line => line.startsWith(`| ${shape} | ${name} |`))
  ?.split('|').slice(1, -1).map(cell => cell.trim());
const fClues = buildPllVisualClues(matchPllSix(fCase), minimalGuide, guideRow('F', '1＝6'));
assert.equal(fClues[1].kind, 'same');
assert.equal(fClues[1].text, '同色格：1＝6、2＝4、3＝5');
assert.deepEqual(fClues[1].segments, [
  { a: 1, b: 6, relation: '同' }, { a: 2, b: 4, relation: '同' }, { a: 3, b: 5, relation: '同' }
]);
assert.deepEqual(fClues.filter(clue => clue.kind === 'relation').map(clue => clue.segments[0]),
  [{ a: 1, b: 6, relation: '同' }, { a: 2, b: 4, relation: '同' },
    { a: 3, b: 5, relation: '同' }], 'F 应直接以三组同色关系判断');
assert.deepEqual(studyRowDifferences(observed('RFBLRL'), guideRow('右眼左灯', 'Gd')), []);
assert.match(guideRow('右眼左灯', 'Gd').at(-1), /^4$/);
for (const six of ['FFRBBF', 'BBFRRB'])
  assert.deepEqual(studyRowDifferences(observed(six), guideRow('左棒左、右棒左', 'Ja')), [], `${six} 的 Ja 朝向应有自己的描述`);
for (const six of ['RRBLLR', 'BBLFFB', 'LLFRRL'])
  assert.deepEqual(studyRowDifferences(observed(six), guideRow('左棒左、右棒左', 'Ja')), [], `${six} 的前置 y 朝向不应误报`);
for (const six of ['LFFRLL', 'RLLFRR'])
  assert.deepEqual(studyRowDifferences(observed(six), guideRow('左棒右、右棒右', 'Jb')), [], `${six} 的 Jb 朝向应有自己的描述`);
for (const six of ['FRRBFF', 'RBBLRR', 'BLLFBB'])
  assert.deepEqual(studyRowDifferences(observed(six), guideRow('左棒右、右棒右', 'Jb')), [], `${six} 的前置 y 朝向不应误报`);
assert.ok(studyRowDifferences(observed('FFRBBF'), ['左棒左、右棒左', 'Ja', '1＝2，4＝5', '3 ↔ 1、2：对；6 ↔ 4、5：邻', '3']).some(x => x.includes('对')));
assert.ok(studyRowDifferences(observed('LFFRLL'), ['左棒右、右棒右', 'Jb', '2＝3，5＝6', '1 ↔ 2、3：对；4 ↔ 5、6：邻', '3']).some(x => x.includes('对')));
assert.deepEqual(studyRowDifferences(observed('FFRBBF'), ['左棒左、右棒左', 'Ja', '1＝2，4＝5', '3 ↔ 1、2：邻；6 ↔ 4、5：对', '3']), []);

const clueFeature = (six, name, chapter, left, right) =>
  ({ ...observed(six), name, chapter, left, right, signature: '' });
const ja = buildPllVisualClues(clueFeature('FFRBBF', 'Ja', 6, '棒左', '棒左'), minimalGuide);
assert.equal(ja[0].kind, 'shape');
assert.equal(ja[1].text, '同色格：1＝2＝6、4＝5');
assert.deepEqual(ja[1].segments, [
  { a: 1, b: 2, relation: '同' }, { a: 2, b: 6, relation: '同' }, { a: 4, b: 5, relation: '同' }
]);
assert.deepEqual(ja.slice(2).map(clue => [clue.kind, clue.segments[0]]),
  [['relation', { a: 1, b: 6, relation: '同' }]]);
assert.deepEqual(ja[2].stickers, [1, 6]);
const grouped = buildPllVisualClues(clueFeature('FFRBBF', 'Ja', 6, '棒左', '棒左'), minimalGuide);
assert.equal(grouped.length, 3, '同色格与判别条件都要保留');
const eFeature = clueFeature('LFRBRF', 'E', 9, '灯', '灯');
const eClues = buildPllVisualClues(eFeature, minimalGuide);
assert.equal(eClues[1].text, '同色格：2＝6、3＝5');
assert.deepEqual(eClues[1].segments, [{ a: 2, b: 6, relation: '同' }, { a: 3, b: 5, relation: '同' }]);
assert.equal(buildPllVisualClues(clueFeature('BRFRBL', 'E', 9, '灯', '灯'), minimalGuide)[1].text, '同色格：1＝5、2＝4');
assert.equal(eClues.length, 2, 'E 的左右双灯及同色格应足以判别，不再展示辅助条件');
const ua = buildPllVisualClues(clueFeature('BBBLFL', 'Ua', 1, '团', '眼'), minimalGuide);
assert.equal(ua[2].segments.length, 2, '成组条件需连接两个关系端点');
const ab = buildPllVisualClues(clueFeature('BRLFBB', 'Ab', 7, '灯', '棒右'), minimalGuide);
assert.deepEqual(ab.at(-1).stickers, [2, 3]);
const gc = buildPllVisualClues(clueFeature('LFLFBR', 'Gc', 4, '眼', '灯'), minimalGuide);
const rb = buildPllVisualClues(clueFeature('FRFRFB', 'Rb', 4, '眼', '灯'), minimalGuide);
assert.equal(gc[0].text, '左眼、右灯');
assert.equal(buildPllVisualClues(clueFeature('RFBLRL', 'Gd', 5, '灯', '眼'), minimalGuide)[0].text,
  '左灯、右眼');
assert.deepEqual(gc[3].segments.map(segment => [segment.a, segment.b, segment.relation]), [[1, 5, '邻']]);
assert.deepEqual(rb[3].segments.map(segment => [segment.a, segment.b, segment.relation]), [[1, 5, '同']]);
assert.deepEqual(buildPllVisualClues(null, minimalGuide), []);

const codes = Object.keys(PLL_SIX_CATALOG);
assert.equal(codes.length, 71);
assert.ok(codes.every(code => code.length === 15 && /^[=.!]+$/.test(code)));
const pairs = [];
for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) pairs.push([a, b]);
const shapeCode = code => [0, 1, 5, 12, 13, 14].map(i => code[i]).join('');
for (const signature of codes) {
  const relations = Array.from({ length: 6 }, () => Array(6));
  pairs.forEach(([a, b], i) => { relations[a - 1][b - 1] = { '=': '同', '!': '对', '.': '邻' }[signature[i]]; });
  const name = PLL_SIX_CATALOG[signature];
  const hints = distinguishingRelations({ signature, name, relations });
  assert.ok(hints.length <= 15);
  const chosen = hints.map(hint => {
    const match = /^(\d) 与 (\d) (同|对|邻)色$/.exec(hint);
    assert.ok(match, hint);
    return pairs.findIndex(([a, b]) => a === Number(match[1]) && b === Number(match[2]));
  });
  for (const other of codes) if (PLL_SIX_CATALOG[other] !== name && shapeCode(other) === shapeCode(signature)) {
    assert.ok(chosen.some(i => other[i] !== signature[i]), `${name} 的提示未排除 ${PLL_SIX_CATALOG[other]}`);
  }
}

console.log('PLL 六格提取、关系和分类：通过');
