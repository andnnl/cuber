const assert = require('node:assert/strict');
const { FormulaMoveRecovery } = require('../.tmp/ble/formula-timer-recovery.js');
const { FormulaTimer } = require('../.tmp/ble/formula-timer.js');
const { applyFaceletMove } = require('../.tmp/ble/move-diff.js');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const after = (...moves) => moves.reduce((state, move) => applyFaceletMove(state, move), solved);
const prime = face => face + String.fromCharCode(39);

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0); // GAN Gen3/4 的 FACELETS 固定为 0，并非 MOVE 序号。
  assert.equal(recovery.hasBaseline, false, '无序号状态不能作为断档账本的序号基线');
  const first = recovery.move('R', 67, 100);
  assert.equal(first.status, 'ready', '连接后首次实时转动必须立即进入计时');
  assert.deepEqual(first.moves, [{ move: 'R', at: 100 }]);
  const timer = new FormulaTimer({ now: () => 100, schedule: () => 1, cancel: () => {}, onResult: () => {} });
  timer.beginCase({ id: 'pll:test', category: 'pll', name: '测试', formula: 'R' }, 0);
  for (const item of first.moves) timer.move(item.at);
  assert.equal(timer.startedAt, 100, '公式界面不得一直停留在等待首次实体转动');
}

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0);
  assert.deepEqual(recovery.move(prime('F'), 67, 100).moves.map(item => item.move), [prime('F')]);
  assert.equal(recovery.hasBaseline, true, '首条实时动作应将无序号状态转为可追踪的序号基线');
  const secondSide = recovery.move('B', 69, 120);
  assert.equal(secondSide.status, 'pending', '切层第二侧之前断号时不可跳过缺失动作');
  const result = recovery.state(after(prime('F'), 'U', 'B'), 0);
  assert.equal(result.status, 'recovered');
  assert.deepEqual(result.moves.map(item => item.move), ['U', 'B'], '无序号状态帧仍应补回切层缺失的外层动作');
  assert.deepEqual(result.moves.map(item => item.at), [null, 120]);
}

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0);
  recovery.move(prime('F'), 67, 100);
  assert.equal(recovery.state(solved, 0).status, 'stale', '异步返回的旧整幅状态不得反推一次不存在的逆转动');
  const result = recovery.state(after(prime('F'), 'B'), 0);
  assert.equal(result.status, 'recovered', '无序号状态仍应找回完全未通知的切层末步');
  assert.deepEqual(result.moves.map(item => item.move), ['B']);
  assert.equal(result.tail, true, '末步没有实时通知时必须保留计时不可精确核验标记');
}

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0);
  assert.deepEqual(recovery.move('B', 68, 120).moves.map(item => item.move), ['B']);
  const result = recovery.state(after(prime('F'), 'B'), 0);
  assert.deepEqual(result.moves.map(item => item.move), [prime('F')],
    '第一侧完全未通知时，用整幅状态补回与第二侧可交换的缺失动作');
}

{
  // 执行页面真正的播放方法：补回首步后计时器已中断，后续实时侧仍必须进入 3D 动画。
  const source = fs.readFileSync(path.join(__dirname, '../src/vue/FormulaTimer/index.ts'), 'utf8');
  const method = source.match(/  private playRecoveredMoves\([\s\S]*?(?=  private playPhysicalMove\()/)?.[0];
  assert.ok(method, '找不到公式计时的补步播放方法');
  const js = ts.transpileModule(`class RecoveryPlaybackHarness {\n${method}\n}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const Harness = new Function('isFormulaGoal', `${js}\nreturn RecoveryPlaybackHarness`)(() => true);
  const displayed = [];
  const harness = new Harness();
  harness.training = { startedAt: null, move: () => false };
  harness.playPhysicalMove = move => displayed.push(move);
  harness.current = null;
  harness.playRecoveredMoves([{ move: prime('F'), at: null }, { move: 'B', at: 120 }], false);
  assert.deepEqual(displayed, [prime('F'), 'B'], '计时中断后不能丢弃同批已核验的第二侧动画');

  let interrupted = 0;
  let completed = 0;
  const verification = new Harness();
  verification.training = { startedAt: 100, lastMoveAt: 120, move: () => true,
    interrupt: () => { interrupted++; }, completeDisplayed: () => { completed++; } };
  verification.current = { category: 'pll' };
  verification.displayCube = { serialize: () => solved };
  const playback = [];
  verification.playPhysicalMove = (move, at, instant) => playback.push({ move, instant });
  verification.playRecoveredMoves([{ move: 'U', at: null }, { move: 'B', at: 120 }], true);
  assert.equal(interrupted, 1, '中间缺失动作没有时间戳时必须中断本轮有效成绩');
  assert.equal(completed, 0, '不得把缺失中间步的成绩结算为成功');
  assert.deepEqual(playback, [{ move: 'U', instant: true }, { move: 'B', instant: false }],
    '推断出的缺失步只校正画面，不播放伪造的逐步动画');

  const next = new Harness();
  let nextCalls = 0;
  let timedCalls = 0;
  next.training = { startedAt: null, move: () => { timedCalls++; }, completeDisplayed: () => { timedCalls++; } };
  next.current = { category: 'pll' };
  next.unscoredRound = false;
  next.displayCube = { serialize: () => solved };
  next.playPhysicalMove = () => {};
  next.scheduleUnscoredNext = () => { nextCalls++; };
  next.playRecoveredMoves([{ move: 'U', at: null }], false);
  next.playRecoveredMoves([{ move: 'R', at: 130 }], true);
  assert.equal(timedCalls, 0, '起始时间未知的轮次后续不得重新开始有效计时');
  assert.equal(next.unscoredRound, true, '保留本轮已无可靠起始时间的信息');
  const loopMethod = source.match(/  private loop\(\): void \{[\s\S]*?(?=  resize\()/)?.[0];
  assert.ok(loopMethod);
  const LoopHarness = new Function('isFormulaGoal', 'requestAnimationFrame', 'unmaskedFormulaFacelets',
    `${ts.transpileModule(`class LoopHarness {\n${loopMethod}\n}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText}\nreturn LoopHarness`)(() => true, () => 1, cube => cube.serialize());
  const checking = new LoopHarness();
  checking.active = true;
  checking.statsOpen = true;
  checking.current = next.current;
  checking.unscoredRound = next.unscoredRound;
  checking.awaitingState = false;
  checking.world = { cube: { serialize: () => solved } };
  checking.training = { startedAt: null };
  checking.recovery = { needsState: false };
  checking.verifyJob = null;
  checking.scheduleUnscoredNext = next.scheduleUnscoredNext;
  checking.loop();
  assert.equal(nextCalls, 1, '非计时轮次 3D 画面完成时仍应安排下一题');
}

{
  const source = fs.readFileSync(path.join(__dirname, '../src/vue/FormulaTimer/index.ts'), 'utf8');
  const method = source.match(/  handlePhysicalEvent\([\s\S]*?(?=  private playRecoveredMoves\()/)?.[0];
  assert.ok(method, '找不到公式计时的实体事件入口');
  const js = ts.transpileModule(`class FirstMoveHarness {\n${method}\n}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const Harness = new Function(`${js}\nreturn FirstMoveHarness`)();
  const harness = new Harness();
  harness.active = true;
  harness.replayRecord = null;
  harness.statsOpen = false;
  harness.training = { startedAt: null, interrupt: () => {} };
  harness.recovery = { move: () => ({ status: 'ready', moves: [{ move: 'U', at: null }] }) };
  harness.playRecoveredMoves = () => {};
  let retryIncomplete = 0;
  harness.scheduleUnscoredNext = completed => { if (completed === false) retryIncomplete++; };
  harness.handlePhysicalEvent({ type: 'move', move: 'U', recovered: true }, true);
  assert.equal(retryIncomplete, 1, '首步时间不明且题面未还原时也应自动重试下一题');
}

{
  const source = fs.readFileSync(path.join(__dirname, '../src/vue/FormulaTimer/index.ts'), 'utf8');
  const failMethod = source.match(/  private failVerification\([\s\S]*?(?=  private scheduleUnscoredNext\()/)?.[0];
  const advanceMethod = source.match(/  private scheduleUnscoredNext\([\s\S]*?(?=  private scheduleVerification\()/)?.[0];
  assert.ok(failMethod && advanceMethod, '缺少核验失败自动重试或无计分完成切题方法');
  const callbacks = [];
  const FakeWindow = { setTimeout: callback => { callbacks.push(callback); return callbacks.length; } };
  const js = ts.transpileModule(`class RetryHarness {\n${failMethod}\n${advanceMethod}\n}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const RetryHarness = new Function('window', `${js}\nreturn RetryHarness`)(FakeWindow);
  const retry = new RetryHarness();
  const original = { category: 'pll' };
  retry.current = original;
  retry.active = true;
  retry.nextJob = null;
  retry.training = { lastMoveAt: 200, interrupt: () => {} };
  retry.recovery = { start: () => {} };
  retry.clearVerification = () => {};
  retry.clearNextJob = () => { retry.nextJob = null; };
  let resets = 0;
  retry.resetCase = () => { assert.equal(retry.current, original); resets++; };
  retry.failVerification('无法核验');
  assert.equal(resets, 0, '核验失败时先让用户看见提示');
  callbacks.shift()();
  assert.equal(resets, 1, '核验失败后自动复位当前题，而非停在失效状态');
  assert.match(retry.feedback, /自动重置同题/);
  retry.settings = { nextMode: 'random' };
  retry.nextCase = () => { resets++; };
  retry.scheduleUnscoredNext();
  assert.equal(retry.nextJob !== null, true);
  callbacks.shift()();
  assert.equal(resets, 2, '不计分完成仍遵守随机下一题配置');
  retry.scheduleUnscoredNext(false);
  assert.match(retry.feedback, /准备重试下一题/, '未还原而首步时间丢失时给出自动重试提示');
  callbacks.shift()();
  assert.equal(resets, 3, '未还原时也按随机下一题设置自动切题');
}

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 40);
  assert.deepEqual(recovery.move(prime('F'), 41, 100).moves.map(m => m.move), [prime('F')]);
  assert.deepEqual(recovery.move('B', 43, 120).moves, [], '断档后缓存后续实时动作');
  assert.equal(recovery.state(after(prime('F')), 41).status, 'stale', '迟到的旧状态帧不能误报补步失败');
  const result = recovery.state(after(prime('F'), 'U', 'B'), 43);
  assert.equal(result.status, 'recovered');
  assert.deepEqual(result.moves.map(m => m.move), ['U', 'B'], '补步应插在后续动作之前');
  assert.equal(result.tail, false, '有实时末步可以精确计时');
  assert.deepEqual(recovery.state(after(prime('F'), 'U', 'B'), 43).moves, [], '重复状态不重复回放');
}

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 40);
  recovery.move(prime('F'), 41, 100);
  const result = recovery.state(after(prime('F'), 'B'), 42);
  assert.equal(result.status, 'recovered');
  assert.deepEqual(result.moves.map(m => m.move), ['B']);
  assert.equal(result.tail, true, '末步全丢，无法知道实际发生时间');
  assert.equal(result.moves[0].at, null);
}

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 40);
  recovery.move(prime('F'), 41, 100);
  recovery.move('B', 43, 120);
  assert.deepEqual(recovery.move('U', 42, 110, true).moves.map(m => m.move), ['U', 'B'],
    '明确缺口的历史 MOVE 可补回，且后续动作只播放一次');
  assert.deepEqual(recovery.move('U', 42, 110, true).moves, [], '历史事件不能重复回放');
  recovery.start(solved, 60);
  assert.deepEqual(recovery.move('R', 43, 130, true).moves, [], '跨轮旧补步无效');
  assert.deepEqual(recovery.move('R', 61, 140).moves.map(m => m.move), ['R']);
}

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 254);
  assert.deepEqual(recovery.move('F', 255, 100).moves.map(m => m.move), ['F']);
  assert.deepEqual(recovery.move('U', 0, 110).moves.map(m => m.move), ['U'], '8 位序号回绕');
  assert.deepEqual(recovery.move('F', 255, 120).moves, [], '旧序号不重复回放');
}

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 40);
  const result = recovery.state(after('F', 'B'), 42);
  assert.equal(result.status, 'recovered', '相对两侧可交换的漏步属于同一等价序列');
  assert.equal(after(...result.moves.map(item => item.move)), after('F', 'B'));
  assert.ok(result.moves.every(item => item.at === null), '等价恢复仍不能伪造时间');
}

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0);
  for (const [index, move] of ['R', 'U', 'F', 'L', 'B'].entries())
    assert.equal(recovery.move(move, 71 + index, 100 + index).status, 'ready');
  assert.equal(recovery.state(solved, 0).status, 'stale',
    '无序号设备高速连续转动后迟到的旧状态不能误判为不可核验');
}

{
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0);
  recovery.move('R', 71, 100);
  recovery.move(prime('R'), 72, 200);
  assert.equal(recovery.state(solved, 0).status, 'ready',
    '当前状态恰与旧状态一致时不得把核验应答错当迟到旧帧');
}

console.log('公式计时蓝牙断档补步账本：通过');
