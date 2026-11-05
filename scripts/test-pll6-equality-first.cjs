const assert = require('node:assert/strict');
globalThis.requestAnimationFrame = () => 0;
const { enumerateCases } = require('./pll6-scan-analysis.cjs');
const { equalityFirstTree, followEqualityTree, equalityQuestions, analyzeEqualityFirst, groupedEquality,
  equalityPattern } = require('./pll6-equality-first.cjs');
const cases = enumerateCases();
const questions = equalityQuestions();
assert.equal(questions.filter(question => question.kind === 'same').length, 15);
assert.equal(equalityFirstTree(cases, 4), null, '21 个 PLL 无法用四个二元问题区分');
const tiny = [cases[0], cases.find(sample => sample.name !== cases[0].name)];
const tinyTree = equalityFirstTree(tiny, 2);
assert.ok(tinyTree);
for (const sample of tiny) assert.equal(followEqualityTree(tinyTree, sample).target, sample.name);
assert.equal(equalityFirstTree([cases[0], {...cases[0], name:'冲突', id:'conflict'}], 12), null);
function oracle(samples, remaining, cursor = 2, first = true) {
  if (new Set(samples.map(sample => sample.name)).size === 1) return 0;
  if (!remaining) return Infinity;
  let best = Infinity;
  for (const question of questions.filter(question => question.b >= cursor)) {
    const relation = sample => sample.relations[question.a - 1][question.b - 1];
    const same = samples.filter(sample => relation(sample) === '同');
    const different = samples.filter(sample => relation(sample) !== '同');
    if (same.length && different.length) best = Math.min(best, samples.length +
      oracle(same, remaining - 1, question.b, false) + oracle(different, remaining - 1, question.b, false));
    if (!first && !same.length) {
      const opposite = samples.filter(sample => relation(sample) === '对');
      const adjacent = samples.filter(sample => relation(sample) === '邻');
      if (opposite.length && adjacent.length && [opposite,adjacent].every(subset => new Set(subset.map(sample => sample.name)).size === 1))
        best = Math.min(best, samples.length);
    }
  }
  return best;
}
for (const subset of [cases.slice(0,8), [cases[0],cases[16],cases[30],cases[54]]]) {
  for (const budget of [0,1,2,3,4])
    assert.equal(equalityFirstTree(subset,budget)?.total ?? Infinity, oracle(subset,budget), '小样本独立穷举校验');
}
const results = analyzeEqualityFirst(cases);
const groups = groupedEquality(cases);
assert.equal(groups.length, 54);
assert.equal(groups.filter(group => group.question).length, 12);
assert.ok(groups.filter(group => group.question).every(group => group.question.b === 6 && [2,4,5].includes(group.question.a)),
  '最后邻色判断统一为第六格，对比记住的第 2/4/5 格');
for (const result of results) {
  assert.ok(result.attempts.slice(0,-1).every(attempt => !attempt.feasible));
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.routes.reduce((sum,route) => sum + route.steps.length, 0), result.total);
  for (const route of result.routes) {
    const last = route.steps.length - 1;
    assert.notEqual(route.steps[0].kind, 'neighbor');
    let neighborPhase = false;
    route.steps.forEach((step,index) => {
      if (step.kind === 'neighbor') {
        neighborPhase = true;
        if (!result.neighborSuffix) assert.equal(index,last);
        assert.ok(step.answer === '邻' || step.answer === '对');
      } else assert.equal(neighborPhase, false);
      if (result.monotonic && index) assert.ok(step.b >= route.steps[index - 1].b);
    });
  }
}
const Cube = require('../.tmp/cuber/cube').default;
const { describePllSix } = require('../.tmp/ble/pll-six-sticker');
for (const sample of cases) for (const rotation of ['', 'z2']) for (const preAuf of ['', 'U', 'U2', "U'"]) {
  const cube = new Cube(3);
  cube.twister.setup([rotation,preAuf,sample.scramble].filter(Boolean).join(' '));
  const feature = describePllSix(cube.serialize());
  for (const result of results) assert.equal(followEqualityTree(result.tree, feature).target, sample.name);
  const group = groups.find(group => group.pattern === equalityPattern(feature));
  if (!group.question) assert.deepEqual(group.names, [sample.name]);
  else {
    const relation = feature.relations[group.question.a - 1][group.question.b - 1];
    assert.deepEqual(group.rules.find(rule => rule.answer === relation).names, [sample.name]);
  }
}
console.log('同色优先限深搜索、小样本独立穷举、54 同色模式及 12 冲突消歧、672 变体：通过');
