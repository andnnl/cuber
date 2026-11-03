const assert = require('node:assert/strict');
globalThis.requestAnimationFrame = () => 0;
const { isFormulaGoal, recentMedian, FormulaTimer } = require('../.tmp/ble/formula-timer.js');
const { displayPhysicalMove, advanceDisplayedCube } = require('../.tmp/ble/formula-timer-follow.js');
const Cube = require('../.tmp/cuber/cube.js').default;
const fs = require('node:fs');
const path = require('node:path');

const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const ollDone = 'UUUUUUUUURRFRRRRRRFFRFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const incomplete = 'RUUUUUUUURURRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const sample = { id: 'f2l:01', category: 'f2l', name: 'F2L-01', formula: 'R U R\'', initialFacelets: incomplete };

assert.equal(isFormulaGoal('f2l', solved), true);
assert.equal(isFormulaGoal('pll', solved), true);
assert.equal(isFormulaGoal('oll', solved), true);
assert.equal(isFormulaGoal('oll', ollDone), true);
const scrambled = moves => { const cube = new Cube(3); cube.twister.setup(moves); return cube.serialize(); };
assert.equal(isFormulaGoal('f2l', scrambled('U')), true, '顶层 AUF 不影响已完成的十字与四组槽位');
assert.equal(isFormulaGoal('f2l', scrambled('z2 U')), true, 'z2 后依当前底面和侧面中心判断前两层');
assert.equal(isFormulaGoal('f2l', scrambled("R U R'")), false, '十字仍在而 F2L 槽位未归位不能结算');
assert.equal(isFormulaGoal('f2l', scrambled('F')), false, '底层十字未完成不能结算');
assert.equal(isFormulaGoal('f2l', 'U'.repeat(54)), false, '无效中心配色不能结算');
assert.equal(isFormulaGoal('pll', scrambled('U')), false, 'PLL 保持六面还原判定');
assert.equal(isFormulaGoal('oll', scrambled('U')), true, 'OLL 只需顶层同色及下两层完成');
assert.equal(isFormulaGoal('oll', incomplete), false);
assert.equal(isFormulaGoal('pll', 'U'.repeat(54)), false);

const records = [1000, 8000, 1100, 1200, 1300, 9000].map((durationMs, i) => ({
  ...sample, at: i, durationMs, reactionMs: 30000, result: 'success',
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
  assert.equal(timer.presentedAt, 0, '题面显示时开始反应计时');
  assert.equal(timer.startedAt, null, '首转前拧公式计时尚未开始');
  assert.equal(outcomes.length, 0, '首转前不超时');
  assert.equal(timer.move(now, serial, true), false, '历史恢复不结束反应计时');
  timer.move(now, ++serial);
  assert.equal(timer.reactionMs, 2000, '首个有效转动结束反应计时');
  assert.equal(timer.moveCount, 1, '首个实时转动计一步');
  assert.equal(timer.move(now, serial), false, '重复序号不能重复计步');
  assert.equal(timer.move(now, serial, true), false, '历史恢复不能计步');
  await advance(900);
  assert.equal(outcomes.length, 0);
  timer.move(now, ++serial);
  await advance(900);
  assert.equal(outcomes.length, 0, '后续转动重置停转时间');
  timer.completeDisplayed(timer.lastMoveAt);
  assert.equal(outcomes[0].result, 'success');
  assert.equal(outcomes[0].durationMs, 900, '屏幕完成即以本步作为完成时间');
  assert.equal(outcomes[0].reactionMs, 2000);
  assert.equal(outcomes[0].moveCount, 2, '成功记录两条实际接收的转动');
  await advance(2000);
  assert.equal(outcomes.length, 1, '结算后不能二次结算');

  timer.beginCase(sample);
  assert.equal(timer.reactionMs, null, '新题清空上一题反应时间');
  assert.equal(timer.moveCount, 0, '新题清空上一题计步');
  timer.move(now, ++serial);
  assert.equal(timer.reactionMs, 0);
  await advance(1999);
  assert.equal(outcomes.length, 1, '停转 2 秒前不结算');
  await advance(1);
  assert.equal(requestCount, 0, '屏幕计时不需要请求实体状态');
  assert.equal(outcomes[1].result, 'idle-failure');
  assert.equal(outcomes[1].reactionMs, 0);
  assert.equal(outcomes[1].moveCount, 1, '失败记录保留实际转动步数');

  timer.beginCase(sample);
  timer.move(now, ++serial);
  timer.interrupt(now + 50);
  assert.equal(outcomes[2].result, 'interrupted');
  assert.equal(outcomes[2].reactionMs, 0);
  await advance(1500);
  assert.equal(outcomes.length, 3);

  timer.beginCase(sample);
  assert.equal(timer.move(now, serial, true), false, '历史恢复转动不能起表');
  assert.equal(timer.move(now, serial), false, '上一题的旧序号不能起表');
  timer.move(now, ++serial);
  timer.cancel();
  await advance(1500);
  assert.equal(outcomes.length, 3, '取消轮次不记成绩');
  timer.dispose();

  const cube = new Cube(3);
  cube.twister.setup('z2 y');
  const rotated = cube.serialize();
  const physicalFace = rotated[13];
  assert.equal(displayPhysicalMove(`${physicalFace}'`, rotated), "R'", '按当前中心姿态映射实体层');
  cube.twister.setup('z2');
  assert.equal(displayPhysicalMove('R', cube.serialize()), 'L', '白底题面映射实体 R 到画面 L');
  assert.equal(displayPhysicalMove('u2', cube.serialize()), 'd2', '宽转保留转动后缀');
  assert.equal(displayPhysicalMove('R', cube.serialize().slice(0, 20)), null, '状态不完整时不猜测视角');

  const wrap = new FormulaTimer(clock);
  wrap.beginCase(sample);
  assert.equal(wrap.move(now, 254), true);
  assert.equal(wrap.move(now, 255), true);
  assert.equal(wrap.move(now, 0), true, '8 位序号回绕到 0 仍须接受');
  assert.equal(wrap.move(now, 1), true, '回绕后仍可继续转动');
  assert.equal(wrap.move(now, 255), false, '回绕后的旧事件不能重放');
  wrap.resetSerial();
  wrap.beginCase(sample);
  assert.equal(wrap.move(now, 200), true, '重新连接后可接受新设备的任意起始序号');
  wrap.dispose();

  // 屏幕未完成时，严格在最后一步后 2 秒结算，不请求实体状态。
  const stalledRecords = [];
  const stalled = new FormulaTimer({ ...clock, requestFacelets: () => new Promise(() => {}),
    onResult: record => stalledRecords.push(record) });
  stalled.beginCase({ ...sample, category: 'pll' }, now);
  stalled.move(now, 210);
  assert.equal(stalled.elapsedAt(now + 2500), 2000, '停转时间显示也须冻结在 2 秒边界');
  await advance(2000);
  assert.equal(stalledRecords.length, 1, '屏幕未完成须严格在 2 秒边界结束');
  assert.equal(stalledRecords[0].result, 'idle-failure');
  assert.equal(stalledRecords[0].durationMs, 2000, '停转时间定格在最后转动后 2 秒');
  assert.equal(stalledRecords.length, 1);
  stalled.dispose();

  const heldRecords = [];
  const held = new FormulaTimer({ ...clock, onResult: record => heldRecords.push(record) });
  held.beginCase(sample, now);
  held.move(now, 211);
  held.holdForVerification();
  await advance(2000);
  assert.equal(heldRecords.length, 0, '实体状态核验期间不能抢先结算失败');
  held.releaseVerification();
  assert.equal(heldRecords.length, 1, '核验结束后才允许处理已到期的停转');
  held.dispose();

  // 屏幕已完成即可停表，无需等待实体魔方的状态帧。
  const displayedRecords = [];
  const displayed = new FormulaTimer({ ...clock, requestFacelets: () => new Promise(() => {}),
    onResult: record => displayedRecords.push(record) });
  displayed.beginCase({ ...sample, category: 'pll' }, now - 500);
  assert.equal(displayed.completeDisplayed(now), false, '尚未有有效转动不能结算');
  const displayCube = new Cube(3);
  displayCube.twister.setup('z2 R');
  const mapped = advanceDisplayedCube(displayCube, "L'");
  assert.equal(mapped, "R'");
  const rotatedSolved = new Cube(3);
  rotatedSolved.twister.setup('z2');
  assert.equal(displayCube.serialize(), rotatedSolved.serialize(), '白底坐标映射后屏幕归位');
  assert.equal(isFormulaGoal('pll', displayCube.serialize()), true, 'PLL 屏幕六面还原即达成目标');
  displayed.move(now, 212);
  assert.equal(displayed.completeDisplayed(now), true, '不提供实体状态也以屏幕完成时间立即结算');
  assert.equal(displayedRecords[0].durationMs, 0);
  assert.equal(displayedRecords[0].reactionMs, 500);
  assert.equal(displayed.move(now + 10, 213), false, '旧题完成后的动作不应继续记入旧题');

  const rapid = new Cube(3);
  rapid.twister.setup('z2 y R U');
  const rapidMoves = [];
  for (const physicalMove of ['F', "U'", 'R', 'B2', 'D']) {
    rapidMoves.push(advanceDisplayedCube(rapid, physicalMove));
    const expected = new Cube(3);
    expected.twister.setup(`z2 y R U ${rapidMoves.join(' ')}`);
    assert.equal(rapid.serialize(), expected.serialize(), '连续转动的逻辑题面不得落后于动画队列');
  }

  const queued = new Cube(3);
  queued.twister.push('R U');
  assert(queued.twister.length > 0, '测试需真实积压动画');
  queued.twister.discardPending();
  assert.equal(queued.twister.length, 0, '下一题前清空排队的旧动作');
  queued.twister.setup('F');
  const fresh = new Cube(3);
  fresh.twister.setup('F');
  assert.equal(queued.serialize(), fresh.serialize(), '新题不带旧题步骤');

  const view = fs.readFileSync(path.join(__dirname, '../src/vue/FormulaTimer/index.ts'), 'utf8');
  assert.match(view, /event\.type === 'facelets'/, '公式计时必须接收实体状态核验帧');
  assert.match(view, /this\.recovery\.state\(/, '漏步必须使用实体状态账本唯一核验');
  assert.match(view, /this\.session\.requestFacelets\(\)/, '末步漏通知时主动请求完整状态');
  assert.match(view, /advanceDisplayedCube\(this\.displayCube, physicalMove\)/,
    '公式计时视图必须以无动画逻辑题面映射实时转动');
  assert.match(view, /this\.training\.completeDisplayed\(last\.at \?\? Date\.now\(\)\)/,
    '公式计时视图必须在整批动作完成后按末步时间结算');
  assert.match(view, /isFormulaGoal\(this\.current\.category, this\.world\.cube\.serialize\(\)\)/,
    '动画结束后可见魔方已经还原时，也应立即结算而不是超时报失败');
  assert.match(view, /this\.world\.cube\.twister\.discardPending\(\)/,
    '下一题必须清理上一题积压的动画');
  assert.doesNotMatch(view, /this\.training\.facelets\(/,
    '实体状态不得直接覆盖随机题面');
  const html = fs.readFileSync(path.join(__dirname, '../src/vue/FormulaTimer/index.html'), 'utf8');
  assert.match(html, /F2L 十字和前两层完成；PLL 六面还原/, '界面说明应反映 F2L 新完成条件');
  console.log('公式训练完成条件、慢公式与蓝牙超时：通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
