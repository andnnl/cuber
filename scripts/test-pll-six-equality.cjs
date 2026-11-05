const assert = require('node:assert/strict');
globalThis.requestAnimationFrame = () => 0;
const { pllEqualityPlan, pllEqualityStudyGroups } = require('../.tmp/ble/pll-six-equality');
const { enumerateCases } = require('./pll6-scan-analysis.cjs');
const { groupedEquality } = require('./pll6-equality-first.cjs');
const { matchPllSix } = require('../.tmp/ble/pll-six-sticker');
const Cube = require('../.tmp/cuber/cube').default;
const groups = pllEqualityStudyGroups();
const oracle = groupedEquality();
assert.equal(groups.length,54);
assert.equal(groups.reduce((sum,group) => sum + group.cases.length,0),84);
assert.equal(groups.filter(group => group.final).length,12);
assert.equal(groups.filter(group => !group.final).reduce((sum,group) => sum + group.cases.length,0),56);
assert.equal(pllEqualityPlan(null),null);
for (const group of groups) {
  const expected = oracle.find(item => item.pattern === group.pattern);
  assert.deepEqual(group.names,expected.names);
  assert.deepEqual(group.final && [group.final.a,group.final.b],expected.question && [expected.question.a,expected.question.b]);
  if (group.final) assert.deepEqual(group.final.answers,Object.fromEntries(expected.rules.map(rule => [rule.answer,rule.names[0]])));
}
for (const sample of enumerateCases()) for (const rotation of ['', 'z2']) for (const preAuf of ['', 'U', 'U2', "U'"]) {
  const cube = new Cube(3);
  cube.twister.setup([rotation,preAuf,sample.scramble].filter(Boolean).join(' '));
  const feature = matchPllSix(cube.serialize());
  const plan = pllEqualityPlan(feature);
  assert.equal(plan?.name,sample.name);
  assert.equal(plan.pattern.length,6);
  assert.equal(plan.rightSteps.length,3);
  assert.ok(plan.sameSegments.every(segment => segment.relation === '同'));
  assert.equal(plan.groups.flatMap(group => group.positions).length,6);
  if (plan.final) {
    assert.equal(plan.final.b,6);
    assert.ok(['对','邻'].includes(plan.final.relation));
  }
  assert.equal(pllEqualityPlan({...feature,name:'错误标签'}),null);
}
console.log('同色分组运行时：54 模式、84 朝向、56 直接识别、28 最后消歧、672 变体：通过');
