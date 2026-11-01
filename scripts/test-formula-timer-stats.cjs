const assert = require('node:assert/strict');
const { summarizeFormulaRecords } = require('../.tmp/ble/formula-timer-stats.js');

const base = { formula: 'R U', initialFacelets: 'U'.repeat(54) };
const rec = (id, at, result, durationMs, reactionMs, category = 'pll') =>
  ({ ...base, id, name: id, category, at, result, durationMs, ...(reactionMs === null ? {} : { reactionMs }) });
const records = [
  rec('A', 9, 'success', 4000, 6000), rec('B', 8, 'success', 1000, 1000),
  rec('A', 7, 'idle-failure', 2000, 5000), rec('A', 6, 'success', 5000, 7000),
  rec('A', 5, 'success', 6000, null), rec('A', 4, 'idle-failure', 2000, 4000),
  rec('A', 3, 'idle-failure', 2000, 4000), rec('B', 2, 'success', 1000, 1000),
  rec('A', 1, 'interrupted', 2000, 4000), rec('A', 10, 'success', 2000, 1000, 'oll'),
];
const original = records.map(record => record.at);
const perFormula = summarizeFormulaRecords(records, 'pll', 'per-formula', 6, 3);
const a = perFormula.formulas.find(row => row.id === 'A');
assert.equal(a.attemptCount, 6);
assert.equal(a.successCount, 3);
assert.equal(a.successRate, 0.5);
assert.equal(a.meanDurationMs, 5000);
assert.equal(a.reactionCount, 2);
assert.equal(a.meanReactionMs, 6500);
assert.deepEqual(a.labels, ['duration', 'failure']);
assert.equal(perFormula.overview.recordCount, 8);
assert.equal(perFormula.overview.durationCount, 5);
assert.deepEqual(records.map(record => record.at), original, '不改变原记录顺序');

const recent = summarizeFormulaRecords(records, 'pll', 'category', 3, 3);
assert.equal(recent.overview.recordCount, 3);
assert.equal(recent.formulas.find(row => row.id === 'A').attemptCount, 2);
assert.equal(recent.formulas.find(row => row.id === 'B').attemptCount, 1);
assert.equal(recent.formulas.find(row => row.id === 'A').points.length, 2);
assert.equal(recent.formulas.find(row => row.id === 'A').labels.includes('duration'), false);
assert.equal(recent.formulas.find(row => row.id === 'A').points[0].durationMs, null, '失败不画速度');

const reactions = [rec('fast', 1, 'success', 1000, 1000), rec('fast', 2, 'success', 1000, 1000),
  rec('fast', 3, 'success', 1000, 1000), rec('slow', 4, 'success', 3000, 3100),
  rec('slow', 5, 'success', 3000, 3100), rec('slow', 6, 'success', 3000, 3100)];
const reactionResult = summarizeFormulaRecords(reactions, 'pll', 'per-formula', 10, 3);
assert(reactionResult.formulas.find(row => row.id === 'slow').labels.includes('reaction'));
assert.equal(reactionResult.formulas.find(row => row.id === 'slow').labels.includes('duration'), false,
  '等于拧动阈值不贴标签');
assert.deepEqual(summarizeFormulaRecords([], 'pll', 'category', 20, 3).overview,
  { recordCount: 0, attemptCount: 0, successCount: 0, successRate: null,
    durationCount: 0, meanDurationMs: null, reactionCount: 0, meanReactionMs: null });
console.log('公式统计取样、均值和标签：通过');
