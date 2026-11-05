const assert = require('node:assert/strict');
const {enumerateCases, followTree, relationKey} = require('./pll6-scan-analysis.cjs');
const {boundedTree, optimizeAnalysis} = require('./pll6-scan-optimize.cjs');
const report = optimizeAnalysis();
for (const result of report.strategies) {
  assert.ok(result.tree);
  assert.equal(result.failures.length, 0);
  assert.ok(result.attempts.slice(0,-1).every(attempt => !attempt.feasible), '更低的最坏次数必须已检验不可行');
  for (const sample of report.cases) {
    const route = followTree(result.tree,sample);
    assert.equal(route.target,sample.name);
    assert.ok(route.path.every((step,index) => !index || step.b >= route.path[index - 1].b));
    assert.ok(route.path.length <= result.worst);
  }
}
const optimized = report.strategies.find(result => result.mode === 'adaptive');
assert.ok(optimized.worst <= report.baseline.worst);
assert.ok(optimized.total <= report.baseline.total);
const conservative = report.strategies.find(result => result.mode === 'no-regression');
assert.ok(conservative);
assert.equal(conservative.worsened.length, 0, '保守精简不能让任何案例比原来更长');
assert.ok(conservative.total <= report.baseline.total);
const samples = enumerateCases().slice(0,5);
const queries = [{a:1,b:2},{a:1,b:3},{a:2,b:3},{a:2,b:4},{a:3,b:5}];
function oracle(members,cursor,budget) {
  if (new Set(members.map(sample => sample.name)).size === 1) return 0;
  if (!budget) return Infinity;
  let best = Infinity;
  for (const query of queries) {
    if (query.b < cursor) continue;
    const groups = new Map();
    for (const sample of members) {
      const answer = relationKey(sample,[query]);
      if (!groups.has(answer)) groups.set(answer,[]);
      groups.get(answer).push(sample);
    }
    if (groups.size < 2) continue;
    const total = members.length + [...groups.values()].reduce((sum,subset) => sum + oracle(subset,query.b,budget-1),0);
    best = Math.min(best,total);
  }
  return best;
}
for (const subset of [samples,[report.cases[0],report.cases[4],report.cases[16],report.cases[60]]]) {
  for (const budget of [0,1,2,3]) {
    const expected = oracle(subset,2,budget);
    const tree = boundedTree(subset,queries,budget);
    assert.equal(tree?.total ?? Infinity, expected, '限深最小总比较数必须与小样本独立穷举一致');
  }
}
assert.equal(boundedTree([samples[0],{...samples[0],id:'conflict',name:'冲突'}],queries,5),null);
const Cube = require('../.tmp/cuber/cube').default;
const {describePllSix} = require('../.tmp/ble/pll-six-sticker');
for (const sample of report.cases) {
  for (const rotation of ['', 'z2']) for (const preAuf of ['', 'U', 'U2', "U'"]) {
    const cube = new Cube(3);
    cube.twister.setup([rotation,preAuf,sample.scramble].filter(Boolean).join(' '));
    const variation = describePllSix(cube.serialize());
    for (const result of report.strategies)
      assert.equal(followTree(result.tree,variation).target,sample.name, `${result.mode} ${sample.id} ${rotation} ${preAuf}`);
  }
}
console.log('单向路径限深穷举、平均比较数优化、小样本独立对照与 84 例分类：通过');
