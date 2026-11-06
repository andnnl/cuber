const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
globalThis.requestAnimationFrame = () => 0;
const Cube = require('../.tmp/cuber/cube.js').default;
const { TwistAction } = require('../.tmp/cuber/twister.js');
const CubeGroup = require('../.tmp/cuber/group.js').default;
const { FormulaTimer, isFormulaGoal } = require('../.tmp/ble/formula-timer.js');
const { advanceDisplayedCube } = require('../.tmp/ble/formula-timer-follow.js');
const { unmaskedFormulaFacelets } = require('../.tmp/ble/formula-timer-preview.js');
const source = fs.readFileSync('src/vue/FormulaTimer/index.ts', 'utf8');
const file = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const component = file.statements.find(ts.isClassDeclaration);
const names = ['onDirectMove', 'prepareDirectInput', 'onCubeKeydown', 'playPhysicalMove',
  'playRecoveredMoves', 'loop', 'onSessionSnapshot', 'statusLabel'];
const members = component.members.filter(member => member.name && names.includes(member.name.getText(file)));
assert.equal(members.length, names.length, '需要统一支持屏幕操作及实体输入');
const code = ts.transpileModule(`class Harness {${members.map(member => member.getText(file)).join('\n')}}`,
  {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
let now = 1000;
const Harness = new Function('TwistAction', 'CubeGroup', 'advanceDisplayedCube', 'isFormulaGoal', 'Date', 'requestAnimationFrame', 'unmaskedFormulaFacelets',
  `${code}; return Harness;`)(TwistAction, CubeGroup, advanceDisplayedCube, isFormulaGoal, {now:() => now}, () => 0, unmaskedFormulaFacelets);
function page(scramble = "R'") {
  const vm = new Harness();
  const records = [];
  const cube = new Cube(3);
  const displayCube = new Cube(3);
  cube.twister.setup(scramble);
  displayCube.twister.setup(scramble);
  const current = {id:'pll:test', category:'pll', name:'测试', formula:'R', scramble};
  Object.assign(vm, {active:true, statsOpen:false, pickerOpen:false, replayRecord:null,
    preparing:false, unscoredRound:false, awaitingState:false, verifyJob:null,
    lastMirrorAt:0, current, displayCube,
    world:{cube, controller:{handleUp() {}}},
    recovery:{needsState:false, start() {}}, clearVerification() {},
    training:new FormulaTimer({now:() => now, schedule:() => 1, cancel() {}, onResult:record => records.push(record)})});
  vm.training.beginCase(current, 0);
  cube.recordCallbacks.push(action => vm.onDirectMove(action));
  return {vm, records};
}
{
  const {vm, records} = page();
  assert.match(vm.statusLabel, /鼠标|拖动|屏幕/, '未连接蓝牙也能开始训练');
  vm.world.cube.twister.twist(new TwistAction('R'), true, true);
  assert.equal(vm.training.startedAt, 1000, '鼠标首次层转启动计时');
  assert.equal(vm.training.moveCount, 1);
  assert.equal(vm.displayCube.serialize(), vm.world.cube.serialize());
  vm.world.controller.rotating = true;
  vm.loop();
  assert.equal(records.length, 0, '拖动未结束时不能结算画面中暂时的还原态');
  vm.world.controller.rotating = false;
  vm.loop();
  assert.equal(records[0].result, 'success');
  assert.equal(records[0].moveCount, 1);
}
{
  const {vm} = page();
  vm.playRecoveredMoves([{move:'U', at:1100}, {move:"U'", at:1200}], true);
  assert.equal(vm.training.moveCount, 2);
  vm.world.cube.twister.finish();
  assert.equal(vm.training.moveCount, 2, '排队镜像动作执行时仍不得重复计步');
  assert.equal(vm.displayCube.serialize(), vm.world.cube.serialize());
}
{
  const {vm} = page();
  vm.world.cube.twister.twist(new TwistAction('y'), true, true);
  assert.equal(vm.training.startedAt, null, '整体转不启动计时');
  assert.equal(vm.training.moveCount, 0);
  assert.equal(vm.displayCube.serialize(), vm.world.cube.serialize(), '整体转同步实体映射账本');
  vm.playRecoveredMoves([{move:'R', at:1100}], true);
  const count = vm.training.moveCount;
  vm.world.cube.twister.finish();
  assert.equal(vm.training.moveCount, count, '镜像动画不能重复计步');
  assert.equal(vm.displayCube.serialize(), vm.world.cube.serialize(), '整体转后实体动作映射一致');
}
{
  const {vm, records} = page("R' U'");
  vm.playRecoveredMoves([{move:'U', at:1200}], true);
  vm.prepareDirectInput();
  assert.equal(vm.training.moveCount, 1);
  now = 1300;
  vm.world.cube.twister.twist(new TwistAction('R'), true, true);
  vm.loop();
  assert.equal(records[0].result, 'success', '实体和屏幕输入可在同题混用');
  assert.equal(records[0].moveCount, 2);
}
{
  const {vm} = page();
  vm.world.cube.twister.twist(new TwistAction('U'), true, true);
  vm.world.cube.twister.twist(new TwistAction("U'"), true, true);
  assert.equal(vm.training.moveCount, 2, '相邻逆动作不能因历史合并丢步');
  vm.snapshot = {status:'connected'};
  vm.onSessionSnapshot({status:'disconnected'});
  assert.ok(vm.training.current, '屏幕操作不依赖蓝牙连接');
  const before = vm.training.moveCount;
  vm.replayRecord = {};
  vm.world.cube.twister.twist(new TwistAction('U'), true, true);
  assert.equal(vm.training.moveCount, before, '复盘不得计时');
}
{
  const {vm} = page();
  vm.preparing = true;
  vm.world.cube.twister.setup('R U');
  assert.equal(vm.training.startedAt, null, '程序出题不启动计时');
  vm.preparing = false;
  vm.statsOpen = true;
  vm.onDirectMove(new TwistAction('R'));
  assert.equal(vm.training.startedAt, null, '统计页不接收隐藏训练输入');
}
{
  const {vm, records} = page();
  vm.playRecoveredMoves([{move:'U', at:1400}], true);
  vm.snapshot = {status:'connected'};
  vm.onSessionSnapshot({status:'disconnected'});
  assert.equal(records[0].result, 'interrupted', '使用实体输入的轮次断连后仍应中断');
}
{
  const {vm} = page();
  let prevented = false;
  vm.onCubeKeydown({key:'r', shiftKey:false, preventDefault() {prevented = true;}});
  vm.world.cube.twister.finish();
  assert.equal(prevented, true);
  assert.equal(vm.training.moveCount, 1, '键盘操作使用同一计步入口');
}
for (const input of ['screen', 'physical']) {
  const {vm, records} = page("L' U' L R U R'");
  vm.current = { ...vm.current, id:'advf2l:1:0:goal-input', category:'advf2l', targetSlot:'FR',
    initialFacelets:vm.displayCube.serialize() };
  vm.training.beginCase(vm.current, 0);
  const moves = ['R', "U'", "R'"];
  if (input === 'screen') {
    for (const move of moves) vm.world.cube.twister.twist(new TwistAction(move), true, true);
    vm.loop();
  } else vm.playRecoveredMoves(moves.map((move, index) => ({move, at:1000 + index * 100})), true);
  assert.equal(isFormulaGoal('f2l', vm.displayCube.serialize()), false, '其余未完成槽位仍未还原');
  assert.equal(records.length, 1, `${input} 必须使用初始状态及目标槽位判定`);
  assert.equal(records[0].result, 'success');
  assert.equal(records[0].moveCount, 3);
}
console.log('公式计时屏幕输入、实体混用、整体转和计步去重：通过');
