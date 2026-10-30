const assert = require('node:assert/strict');
const { isFormulaGoal, recentMedian, FormulaTimer } = require('../.tmp/ble/formula-timer.js');

const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const ollDone = 'UUUUUUUUURRFRRRRRRFFRFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const incomplete = 'RUUUUUUUURURRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const sample = { id: 'f2l:01', category: 'f2l', name: 'F2L-01', formula: 'R U R\'', initialFacelets: incomplete };

assert.equal(isFormulaGoal('f2l', solved), true);
assert.equal(isFormulaGoal('pll', solved), true);
assert.equal(isFormulaGoal('oll', solved), true);
assert.equal(isFormulaGoal('oll', ollDone), true);
assert.equal(isFormulaGoal('f2l', ollDone), false);
assert.equal(isFormulaGoal('oll', incomplete), false);
assert.equal(isFormulaGoal('pll', 'U'.repeat(54)), false);

const records = [1000, 8000, 1100, 1200, 1300, 9000].map((durationMs, i) => ({
  ...sample, at: i, durationMs, result: 'success',
}));
records.push({ ...sample, at: 7, durationMs: 500, result: 'idle-failure' });
assert.equal(recentMedian(records, 'f2l', 'f2l:01'), 1300);
assert.equal(recentMedian(records, 'oll', 'f2l:01'), null);

let now = 0;
let serial = 0;
let nextJob = 0;
const jobs = new Map();
const outcomes = [];
let requestCount = 0;
const clock = {
  now: () => now,
  schedule: (fn, ms) => { const id = ++nextJob; jobs.set(id, { fn, at: now + ms }); return id; },
  cancel: id => jobs.delete(id),
  requestFacelets: () => { requestCount++; return Promise.resolve(); },
  onResult: result => outcomes.push(result),
};
async function advance(ms) {
  now += ms;
  for (const [id, job] of [...jobs]) if (job.at <= now) { jobs.delete(id); job.fn(); }
  await Promise.resolve();
  await Promise.resolve();
}

(async () => {
  const timer = new FormulaTimer(clock);
  timer.beginCase(sample);
  await advance(2000);
  assert.equal(outcomes.length, 0, '首转前不超时');
  timer.facelets(incomplete, now, 0);
  timer.move(now, ++serial);
  await advance(900);
  assert.equal(outcomes.length, 0);
  timer.move(now, ++serial);
  await advance(900);
  assert.equal(outcomes.length, 0, '后续转动重置停转时间');
  timer.facelets(solved, now, serial);
  assert.equal(outcomes[0].result, 'success');
  assert.equal(outcomes[0].durationMs, 1800);
  await advance(2000);
  assert.equal(outcomes.length, 1, '结算后不能二次结算');

  timer.beginCase(sample);
  timer.move(now, ++serial);
  timer.facelets(incomplete, now + 1, serial);
  await advance(1000);
  assert.equal(requestCount, 1, '停转边界先请求实体状态');
  await advance(200);
  assert.equal(outcomes[1].result, 'idle-failure');

  timer.beginCase(sample);
  timer.move(now, ++serial);
  timer.interrupt(now + 50);
  assert.equal(outcomes[2].result, 'interrupted');
  await advance(1500);
  assert.equal(outcomes.length, 3);

  timer.beginCase(sample);
  assert.equal(timer.move(now, serial, true), false, '历史恢复转动不能起表');
  assert.equal(timer.move(now, serial), false, '上一题的旧序号不能起表');
  timer.move(now, ++serial);
  assert.equal(timer.facelets(solved, now + 10, serial - 1), false, '旧状态不能结算');
  timer.cancel();
  await advance(1500);
  assert.equal(outcomes.length, 3, '取消轮次不记成绩');
  timer.dispose();
  console.log('公式训练完成条件、慢公式与蓝牙超时：通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
