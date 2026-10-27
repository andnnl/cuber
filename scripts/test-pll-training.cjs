const assert = require('node:assert/strict');
const { PllTraining, isSolvedFacelets } = require('../.tmp/ble/pll-training.js');

const items = Array.from({length: 21}, (_, i) => ({name: `PLL-${i}`, origin: 'R U R\''}));
const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const unsolved = 'RUUUUUUUURRRRRRRRUFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

assert.equal(isSolvedFacelets(solved), true);
assert.equal(isSolvedFacelets(unsolved), false);
assert.equal(isSolvedFacelets('U'.repeat(54)), false);
assert.equal(isSolvedFacelets(''), false);

const training = new PllTraining(items, () => 0.1, () => 1000, () => "R' U' R");
assert.equal(training.current.name, 'PLL-2');
assert.equal(training.current.preRotation, '');
assert.equal(training.current.postAuf, '');
training.setZ2(true);
assert.equal(training.current.scramble, "z2 R' U' R");
training.next();
assert.equal(training.current.scramble, "z2 R' U' R");
training.setZ2(false);
assert.equal(training.current.scramble, "R' U' R");
const flipped = new PllTraining(items, () => 0.1, () => 1000, () => 'R');
flipped.setZ2(true);
flipped.answer('PLL-3', 1200);
assert.equal(flipped.records[0].scramble, 'z2 R', '复盘记录保留当时的 z2 出题顺序');
assert.equal(training.answer('PLL-3', 1500), false);
assert.equal(training.current.name, 'PLL-2');
assert.equal(training.records.length, 1);
assert.equal(training.records[0].ok, false);
assert.equal(training.records[0].selectedName, 'PLL-3');
assert.equal(training.records[0].durationMs, 500);
assert.equal(training.records[0].scramble, "R' U' R");
assert.equal(training.answer('PLL-2', 1700), true);
assert.equal(training.lastResult.kind, 'observation');
assert.equal(training.lastResult.durationMs, 700);
assert.equal(training.records[0].ok, true);
assert.equal(training.records[0].selectedName, 'PLL-2');
assert.equal(training.records[0].scramble, training.records[1].scramble);
assert.equal(training.current.name, 'PLL-2');
assert.equal(training.records.length, 2);

const picks = [0.99, 0.26, 0.51];
const aufs = new PllTraining(items, () => picks.shift(), Date.now, () => 'R');
assert.equal(aufs.current.name, 'PLL-20');
assert.equal(aufs.current.preRotation, 'y');
assert.equal(aufs.current.postAuf, "U'");
assert.equal(aufs.current.scramble, "y R U'");
let filteredPick = 0.99;
const filtered = new PllTraining(items, () => filteredPick, Date.now, () => 'R');
const initialCase = filtered.current;
filtered.setAllowedNames(['PLL-3']);
assert.equal(filtered.current, initialCase, '改筛选不能替换当前案例');
for (let i = 0; i < 5; i++) assert.equal(filtered.next().name, 'PLL-3');
filtered.setAllowedNames(['PLL-3', 'PLL-7']);
assert.equal(filtered.next().name, 'PLL-7');
filtered.setAllowedNames(['PLL-3', 'PLL-7']);
filteredPick = 0;
assert.equal(filtered.next().name, 'PLL-3');
filtered.setAllowedNames(['PLL-INVALID']);
assert.equal(filtered.next().name, 'PLL-0', '非法名称回退到完整公式库');
filtered.setAllowedNames([]);
filteredPick = 0.99;
assert.equal(filtered.next().name, 'PLL-20', '空选表示完整公式库');
for (const [choice, rotation] of [[0, ''], [0.26, 'y'], [0.51, "y'"], [0.76, 'y2']]) {
  const sample = new PllTraining(items, (() => { const values = [0, choice, 0]; return () => values.shift(); })(), Date.now, () => 'R');
  assert.equal(sample.current.preRotation, rotation);
  assert.equal(sample.current.postAuf, '');
  assert.equal(sample.current.scramble, [rotation, 'R'].filter(Boolean).join(' '));
}

const bluetooth = new PllTraining(items, () => 0.7, Date.now, () => 'R');
bluetooth.facelets(solved, 100);
assert.equal(bluetooth.move(1000, 1, true), false);
assert.equal(bluetooth.startedAt, null);
assert.equal(bluetooth.move(1200, 2), true);
assert.equal(bluetooth.facelets(solved, 1300, 1), false);
assert.equal(bluetooth.facelets(solved, 1400), false); // 连接前还原状态的迟到帧
assert.equal(bluetooth.facelets(unsolved, 1500), false);
assert.equal(bluetooth.facelets(solved, 2300), true);
assert.equal(bluetooth.lastResult.durationMs, 1100);
assert.equal(bluetooth.lastResult.kind, 'bluetooth');
assert.equal(bluetooth.lastResult.scramble, bluetooth.records[0].scramble);
assert.equal(bluetooth.facelets(solved, 2400), false);
assert.equal(bluetooth.records.length, 1);

const serialZero = new PllTraining(items, () => 0, Date.now, () => 'R');
serialZero.facelets(unsolved, 500, 0);
serialZero.move(1000, 12);
assert.equal(serialZero.facelets(solved, 1900, 0), true, '序号固定为 0 的面贴纸仍应判定完成');

bluetooth.move(2500, 3);
bluetooth.retry();
assert.equal(bluetooth.startedAt, null);
assert.equal(bluetooth.records.length, 1);

const oldCase = training.current;
training.restartCaseClock(3000);
assert.equal(training.current, oldCase);
training.answer('PLL-3', 3600);
assert.equal(training.lastResult.durationMs, 600);

const longSession = new PllTraining(items, () => 0.1, () => 1000, () => 'R');
for (let i = 0; i < 205; i++) longSession.answer('PLL-3', 1500 + i);
assert.equal(longSession.records.length, 200, '会话内记录也应遵循持久化上限');
assert.equal(longSession.records[0].at, 1704);
assert.equal(longSession.records[199].at, 1505);

console.log('PLL 六格案例、判题、蓝牙计时与重试：通过');
