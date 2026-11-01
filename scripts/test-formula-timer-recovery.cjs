const assert = require('node:assert/strict');
const { FormulaMoveRecovery } = require('../.tmp/ble/formula-timer-recovery.js');
const { applyFaceletMove } = require('../.tmp/ble/move-diff.js');

const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const after = (...moves) => moves.reduce((state, move) => applyFaceletMove(state, move), solved);
const prime = face => face + String.fromCharCode(39);

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
  assert.equal(result.status, 'uncertain', '两个可交换的漏步顺序不唯一时不得猜测');
  assert.deepEqual(result.moves, []);
}

console.log('公式计时蓝牙断档补步账本：通过');
