const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { FormulaMoveRecovery } = require('../.tmp/ble/formula-timer-recovery.js');
const { applyFaceletMove } = require('../.tmp/ble/move-diff.js');

const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const after = (...moves) => moves.reduce((state, move) => applyFaceletMove(state, move), solved);
let failures = 0;
function test(name, callback) {
  try { callback(); console.log(`✓ ${name}`); }
  catch (error) { failures++; console.error(`✗ ${name}: ${error.message}`); }
}

const pairs = [['R', "L'"], ['F', "B'"], ['U', "D'"]];
for (const pair of pairs) {
  const sequence = [pair[0], pair[0], pair[1], pair[1]];
  for (const missing of [[0], [1], [2], [3], [0, 2]]) {
    test(`${sequence.join(' ')} 缺 ${missing.map(index => index + 1).join('/')} 条仍恢复全部动作`, () => {
      const recovery = new FormulaMoveRecovery();
      recovery.start(solved, 40);
      const delivered = [];
      sequence.forEach((move, index) => {
        if (!missing.includes(index)) delivered.push(...recovery.move(move, 41 + index, 100 + index).moves);
      });
      const result = recovery.state(after(...sequence), 44);
      assert.equal(result.status, 'recovered');
      delivered.push(...result.moves);
      assert.equal(delivered.length, 4);
      assert.equal(after(...delivered.map(item => item.move)), after(...sequence));
      assert.equal(delivered.filter(item => item.at === null).length, missing.length);
      assert.equal(recovery.needsState, false);
      assert.equal(recovery.state(after(...sequence), 44).moves.length, 0);
    });
  }
  test(`${sequence.join(' ')} 同侧两步全失且方向不明时仍拒绝猜测`, () => {
    const recovery = new FormulaMoveRecovery();
    recovery.start(solved, 40);
    sequence.slice(2).forEach((move, index) => recovery.move(move, 43 + index, 100 + index));
    assert.equal(after(pair[0], pair[0]), after(pair[0] + "'", pair[0] + "'"));
    assert.equal(recovery.state(after(...sequence), 44).status, 'uncertain');
  });
  test(`${pair.join(' ')} 两侧漏报按可交换等价恢复`, () => {
    const recovery = new FormulaMoveRecovery();
    recovery.start(solved, 40);
    const result = recovery.state(after(...pair), 42);
    assert.equal(result.status, 'recovered');
    assert.equal(after(...result.moves.map(item => item.move)), after(...pair));
    assert.equal(result.moves.length, 2);
    assert(result.moves.every(item => item.at === null));
    assert.equal(result.tail, true);
  });
}

test('已知长窗口只搜索两条未知步，覆盖序号回绕', () => {
  const recovery = new FormulaMoveRecovery();
  const sequence = ['R', 'U', 'F', 'L', 'D', 'B', 'R', 'U', 'F', 'L', 'D', 'B'];
  recovery.start(solved, 250);
  sequence.slice(1).forEach((move, index) => recovery.move(move, (252 + index) & 255, 100 + index));
  const result = recovery.state(after(...sequence), 6);
  assert.equal(result.status, 'recovered');
  assert.deepEqual(result.moves.map(item => item.move), sequence);
});

test('不同轴的相消路径不能被当作可交换等价', () => {
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 40);
  assert.equal(recovery.state(solved, 42).status, 'uncertain');
});

test('超过两条未知步或过长窗口仍拒绝猜测', () => {
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 40);
  assert.equal(recovery.state(after('R', 'U', 'F'), 43).status, 'uncertain');
  recovery.move('U', 74, 100);
  assert.equal(recovery.state(after('R', 'U'), 74).status, 'uncertain');
});

for (const pair of pairs) {
  test(`${pair.join(' ')} 无序号整段末步漏报须两次独立请求确认`, () => {
    const recovery = new FormulaMoveRecovery();
    recovery.start(solved, 0);
    recovery.move('B', 41, 100);
    const facelets = after('B', ...pair);
    assert.equal(recovery.state(facelets, 0, 1).status, 'confirm');
    assert.equal(recovery.state(facelets, 0, 1).status, 'confirm', '同一次请求的重复帧不能确认');
    const result = recovery.state(facelets, 0, 2);
    assert.equal(result.status, 'recovered');
    assert.equal(result.moves.length, 2);
    assert.equal(after('B', ...result.moves.map(item => item.move)), facelets);
    assert.equal(result.tail, true);
    assert.equal(recovery.move('U', 44, 120).status, 'ready', '确认后真实序号继续衔接');
  });
  test(`${pair.join(' ')} 真实回到旧状态不能永远判为旧帧`, () => {
    const sequence = [...pair, pair[0] + "'", pair[1][0]];
    const recovery = new FormulaMoveRecovery();
    recovery.start(solved, 0);
    sequence.slice(0, 3).forEach((move, index) => recovery.move(move, 41 + index, 100 + index));
    assert.equal(after(...sequence), solved);
    assert.equal(recovery.state(solved, 0, 1).status, 'confirm');
    const result = recovery.state(solved, 0, 2);
    assert.equal(result.status, 'recovered');
    assert.deepEqual(result.moves.map(item => item.move), [sequence[3]]);
  });
}

test('无序号核验期间继续转动会使上次候选失效', () => {
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0);
  recovery.move('R', 41, 100);
  assert.equal(recovery.state(solved, 0, 1).status, 'confirm');
  recovery.move('U', 42, 110);
  assert.equal(recovery.state(solved, 0, 2).status, 'confirm');
  assert.equal(recovery.state(after('R', 'U'), 0, 3).status, 'ready');
});

test('无序号首侧漏报补回后不能吃掉下一条真实动作', () => {
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0);
  recovery.move('B', 68, 100);
  const facelets = after("F'", 'B');
  assert.equal(recovery.state(facelets, 0, 1).status, 'confirm');
  assert.equal(recovery.state(facelets, 0, 2).status, 'recovered');
  assert.equal(recovery.state(facelets, 0, 3).status, 'ready');
  assert.equal(recovery.move('R', 69, 120).status, 'ready');
  assert.equal(recovery.state(after("F'", 'B', 'R'), 0, 4).status, 'ready');
});

test('无序号连续返回互不一致的状态必须有界失败', () => {
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0);
  recovery.move('R', 41, 100);
  assert.equal(recovery.state(after('R', 'U'), 0, 1).status, 'confirm');
  assert.equal(recovery.state(after('R', 'F'), 0, 2).status, 'confirm');
  assert.equal(recovery.state(after('R', 'B'), 0, 3).status, 'uncertain');
});

const source = fs.readFileSync('src/vue/FormulaTimer/index.ts', 'utf8');
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const component = parsed.statements.find(ts.isClassDeclaration);
const names = ['handlePhysicalEvent', 'showCase', 'playRecoveredMoves', 'clearVerification', 'scheduleVerification', 'failVerification'];
const members = component.members.filter(member => member.name && names.includes(member.name.getText(parsed)));
assert.equal(members.length, names.length);
const code = ts.transpileModule(`class Harness {${members.map(member => member.getText(parsed)).join('\n')}}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const jobs = new Map();
let jobId = 0;
const fakeWindow = {
  setTimeout(callback, delay) { jobs.set(++jobId, { callback, delay }); return jobId; },
  clearTimeout(identifier) { jobs.delete(identifier); },
};
const Harness = new Function('CubeGroup', 'isFormulaGoal', 'window', 'formulaTimerMaskPlan', 'advanced', 'applyAdvancedF2LMask', `${code}; return Harness;`)(
  { durationScale: 1 }, () => false, fakeWindow, () => null, {cases:[]}, () => {});
function page(recovery) {
  const harness = new Harness();
  const played = [];
  let physical = solved;
  Object.assign(harness, {
    active: true, replayRecord: null, statsOpen: false, current: { category: 'pll' }, recovery,
    recoveryRound: 0, verifyRequest: 0, verifyJob: null, verifyTimeout: null, awaitingState: false,
    unscoredRound: false, physicalRound: false,
    training: { startedAt: 100, lastMoveAt: 100, current: {}, move() {}, holdForVerification() {},
      interrupt() { this.current = null; this.startedAt = null; }, releaseVerification() {}, beginCase() {} },
    displayCube: { serialize: () => physical, twister: { setup() {} } },
    playPhysicalMove(move) { played.push(move); physical = applyFaceletMove(physical, move); },
    world: { controller: { handleUp() {} }, cube: { twister: { discardPending() {}, setup() {} } } },
    prepareQueuedCase() {}, resize() {}, $nextTick() {}, scheduleUnscoredNext() {}, applyDisplayMask() {},
  });
  return { harness, played };
}

test('多个缺口逐段补齐时已确认前缀必须全部交付，且本轮不计成绩', () => {
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 40);
  const { harness, played } = page(recovery);
  harness.scheduleVerification = () => {};
  for (const [move, serial, recovered] of [['F', 43, false], ['U', 45, false], ['R', 41, true], ["L'", 42, true], ["B'", 44, true]])
    harness.handlePhysicalEvent({ type: 'move', move, serial, recovered }, true);
  assert.deepEqual(played, ['R', "L'", 'F', "B'", 'U']);
  assert.equal(harness.unscoredRound, true);
  assert.equal(harness.training.current, null);
});

test('普通切题不回滚到缓存快照，不重放上一题动作', () => {
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 40);
  recovery.move('R', 41, 100);
  const { harness } = page(recovery);
  harness.session = { snapshot: { facelets: solved, faceletsSerial: 40, lastMoveSerial: 41, status: 'connected' } };
  harness.showCase({ id: 'new', scramble: "U'" });
  const result = recovery.move('U', 42, 200);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.moves.map(item => item.move), ['U']);
  assert.equal(recovery.state(after('R', 'U'), 42).status, 'ready');
});

test('新鲜的无序号初始状态跨题保留，首步仍能建立序号', () => {
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0);
  const { harness } = page(recovery);
  harness.session = {
    snapshot: { facelets: solved, faceletsSerial: 0, lastMoveSerial: null, status: 'connected' },
    requestFacelets: () => Promise.resolve(),
  };
  harness.showCase({ id: 'new', scramble: "U'" });
  assert.equal(recovery.move('R', 67, 100).status, 'ready');
  assert.equal(recovery.hasBaseline, true);
});

test('新基线返回前实体输入仍显示，但不能生成有效成绩', () => {
  const recovery = new FormulaMoveRecovery();
  recovery.start(null);
  const { harness, played } = page(recovery);
  harness.training.startedAt = null;
  harness.handlePhysicalEvent({ type: 'move', move: 'R', serial: 41 }, true);
  assert.deepEqual(played, ['R']);
  assert.equal(harness.unscoredRound, true);
  assert.equal(harness.training.current, null);
  harness.handlePhysicalEvent({ type: 'facelets', facelets: after('R'), serial: 41 }, false);
  assert.equal(recovery.hasBaseline, true);
  harness.handlePhysicalEvent({ type: 'move', move: 'U', serial: 42 }, true);
  assert.deepEqual(played, ['R', 'U']);
  assert.equal(harness.training.current, null);
});

test('离开页面期间漏收的动作不跨题补入，改为请求新基线', () => {
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 40);
  recovery.move('R', 41, 100);
  const { harness } = page(recovery);
  let requested = 0;
  harness.session = {
    snapshot: { facelets: solved, faceletsSerial: 40, lastMoveSerial: 43, status: 'connected' },
    requestFacelets() { requested++; return Promise.resolve(); },
  };
  harness.showCase({ id: 'new', scramble: "U'" });
  assert.equal(recovery.hasBaseline, false);
  assert.equal(requested, 1);
  assert.equal(recovery.move('L', 42, null, true).status, 'stale');
});

test('无序号二次核验使用不同请求号，不把重复通知当新请求', () => {
  jobs.clear();
  const recovery = new FormulaMoveRecovery();
  recovery.start(solved, 0);
  recovery.move('U', 41, 100);
  const { harness, played } = page(recovery);
  let requested = 0;
  harness.session = { requestFacelets() { requested++; return Promise.resolve(); } };
  function requestNext() {
    const job = jobs.get(harness.verifyJob);
    assert(job);
    jobs.delete(harness.verifyJob);
    job.callback();
  }
  harness.scheduleVerification(false);
  requestNext();
  assert.equal(harness.verifyRequest, 1);
  const event = { type: 'facelets', facelets: after('U', 'R', "L'"), serial: 0 };
  harness.handlePhysicalEvent(event, false);
  assert.equal(played.length, 0);
  assert.equal(harness.awaitingState, false);
  harness.handlePhysicalEvent(event, false);
  assert.equal(played.length, 0);
  requestNext();
  assert.equal(harness.verifyRequest, 2);
  harness.handlePhysicalEvent(event, false);
  assert.equal(requested, 2);
  assert.equal(played.length, 2);
  assert.equal(harness.unscoredRound, true);
  assert.equal(harness.training.current, null);
});

if (failures) process.exitCode = 1;
else console.log('公式训练 M/S/E 切层补步、连续基线、等价消歧与状态二次核验：通过');
