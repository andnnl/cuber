const assert = require('node:assert/strict');
const {enumerateCases, auditConflicts, queriesForAnchors, buildAnalysis, followTree,
  relationKey, buildTree} = require('./pll6-scan-analysis.cjs');
const cases = enumerateCases();
assert.equal(cases.length, 84);
assert.equal(new Set(cases.map(sample => sample.name)).size, 21);
for (const name of new Set(cases.map(sample => sample.name))) {
  assert.equal(cases.filter(sample => sample.name === name).length, 4);
}
const full = auditConflicts(cases, queriesForAnchors([1,2,3]));
assert.equal(full.groups.length, 71);
assert.equal(full.conflicts.length, 0);
assert.ok(auditConflicts(cases, queriesForAnchors([])).conflicts.length > 0,
  '只看左右局部形态必须检出跨 PLL 冲突');
for (const anchors of [[], [1], [2], [3], [1,2], [1,3]]) {
  assert.ok(auditConflicts(cases, queriesForAnchors(anchors)).conflicts.length > 0);
}
assert.equal(auditConflicts(cases, queriesForAnchors([2,3])).conflicts.length, 0);
const injected = [...cases, {...cases[0], id:'conflicting-label', name:'错误标签'}];
assert.ok(auditConflicts(injected, queriesForAnchors([2,3])).conflicts.some(group =>
  group.names.includes('错误标签') && group.names.includes(cases[0].name)));
const ambiguous = buildTree([cases[0], {...cases[0], name:'冲突'}], queriesForAnchors([2,3]), 'name');
assert.equal(ambiguous.kind, 'conflict', '不能在冲突叶子猜测答案');
const analysis = buildAnalysis(cases);
assert.equal(analysis.classes.length, 10);
assert.equal(analysis.fullEqualityAudit.queries.length, 15, '必须检查全部 15 对位置');
for (let reference = 1; reference <= 6; reference++) for (let position = reference + 1; position <= 6; position++) {
  assert.equal(analysis.fullEqualityAudit.queries.filter(query => query.a === reference && query.b === position &&
    query.equalityOnly).length, 1, `${reference}–${position} 同色判断必须且只能出现一次`);
}
assert.equal(analysis.fullEqualityAudit.samples.length, 84);
assert.ok(analysis.fullEqualityAudit.conflicts.length > 0, '不能误称所有同色关系足以识别全部 PLL');
for (const detail of analysis.fullEqualityAudit.samples) {
  const sample = cases.find(item => item.id === detail.id);
  assert.deepEqual(detail.groups.flat().sort((first,second) => first-second), [1,2,3,4,5,6]);
  assert.equal(detail.positions.length, 6);
  for (const position of detail.positions) {
    const earlier = Array.from({length:position.position - 1}, (_,index) => index + 1);
    assert.deepEqual(position.sameAs, earlier.filter(reference => sample.six[reference - 1] === sample.six[position.position - 1]));
    assert.deepEqual(position.differentFrom, earlier.filter(reference => sample.six[reference - 1] !== sample.six[position.position - 1]));
  }
}
for (const group of analysis.fullEqualityAudit.conflicts) {
  assert.ok(group.supplement.length > 0);
  assert.equal(group.remainingConflicts, 0, '剩余同色冲突必须明确补充对/邻判别');
  for (const id of group.ids) {
    const sample = cases.find(item => item.id === id);
    const matching = group.rules.filter(rule => rule.key === relationKey(sample,group.supplement));
    assert.equal(matching.length, 1);
    assert.deepEqual(matching[0].names, [sample.name], `${id} 的补充条件必须明确判出真实标签`);
  }
}
assert.equal(analysis.equalitySupplement.audit.conflicts.length, 0,
  '局部完整关系加 2–4、3–5 是否同色应覆盖全部案例');
assert.equal(analysis.equalitySupplement.minimum.length, 2, '穷举确认至少需要两对固定同色比较');
assert.equal(auditConflicts(cases, [...queriesForAnchors([]),
  {a:2,b:4,equalityOnly:true}, {a:3,b:5,equalityOnly:true}]).conflicts.length, 0,
  '补充两项同色关系后，连 3–4 边界关系也可省略');
assert.equal(analysis.equalitySupplement.groups.length, 10);
for (const group of analysis.equalitySupplement.groups) {
  assert.ok(group.minimum.length >= 1 && group.minimum.length <= 2);
  assert.equal(group.remainingConflicts, 0);
}
const {PLL_SIX_CATALOG} = require('../.tmp/ble/pll-six-sticker-catalog');
for (const sample of cases) {
  assert.equal(PLL_SIX_CATALOG[sample.signature], sample.name, '公式生成的独立标签与既有完整目录一致');
  const left = followTree(analysis.leftTree, sample);
  const group = analysis.classes.find(item => item.key === left.target);
  assert.ok(group);
  assert.equal(group.queries.length, 12, '右侧应包含 9 个跨面关系与 3 个面内关系');
  for (const reference of [1,2,3]) for (const position of [4,5,6]) {
    assert.ok(group.queries.some(query => query.a === reference && query.b === position),
      `缺少 ${reference}–${position} 颜色比较`);
  }
  const right = followTree(group.tree, sample);
  assert.equal(right.target, sample.name, sample.id);
  const path = [...left.path, ...right.path];
  assert.ok(path.every((entry, index) => !index || entry.b >= path[index - 1].b),
    `${sample.id} 观察顺序回头了`);
  assert.ok(right.path.every(entry => entry.a >= 1 && entry.a < entry.b && entry.b >= 4),
    '右侧只比较当前格与前面已读的格子');
  assert.ok(new Set(path.map(entry => `${entry.a}-${entry.b}`)).size === path.length);
}
for (const anchors of [[1], [2], [3], [1,2], [1,3], [2,3]]) {
  const audit = analysis.anchorAudits.find(item => item.anchors.join() === anchors.join());
  assert.ok(audit);
}
const Cube = require('../.tmp/cuber/cube').default;
const {describePllSix} = require('../.tmp/ble/pll-six-sticker');
const colorCycle = {F:'R', R:'B', B:'L', L:'F'};
let extended = 0;
for (const sample of cases) {
  const renamed = {...sample, six:[...sample.six].map(color => colorCycle[color]).join('')};
  renamed.relations = [...renamed.six].map(first => [...renamed.six].map(second =>
    first === second ? '同' : {F:'B',B:'F',R:'L',L:'R'}[first] === second ? '对' : '邻'));
  assert.equal(relationKey(renamed, queriesForAnchors([2,3])), relationKey(sample, queriesForAnchors([2,3])),
    '改变绝对颜色不能改变关系判别');
  for (const rotation of ['', 'z2']) for (const preAuf of ['', 'U', 'U2', "U'"]) {
    const cube = new Cube(3);
    cube.twister.setup([rotation, preAuf, sample.scramble].filter(Boolean).join(' '));
    const variation = describePllSix(cube.serialize());
    const left = followTree(analysis.leftTree, variation);
    const group = analysis.classes.find(item => item.key === left.target);
    assert.ok(group, `${sample.id} 前置 ${rotation} ${preAuf} 左侧类别缺失`);
    assert.equal(followTree(group.tree, variation).target, sample.name,
      `${sample.id} 前置 ${rotation} ${preAuf} 判别错误`);
    extended++;
  }
}
assert.equal(extended, 672);
assert.equal(followTree({kind:'question',a:1,b:2,branches:{}}, cases[0]).target, null,
  '未覆盖的分支不能猜测标签');
console.log('PLL 84 例穷举、71 签名、双锚点、单向判别与冲突注入：通过');
