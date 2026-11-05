const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const { PllTraining, isSolvedFacelets, displayPllPhysicalMove } = require('../.tmp/ble/pll-training.js');
const { parseOpFormula } = require('../.tmp/ble/op-formula.js');
const { matchPllSix, describePllSix } = require('../.tmp/ble/pll-six-sticker.js');
const Cube = require('../.tmp/cuber/cube.js').default;
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const realPlls = require('../src/vue/Algs/algs.json').find(group => group.name === 'PLL').items;

const items = Array.from({length: 21}, (_, i) => ({name: `PLL-${i}`, origin: 'R U R\''}));
const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const unsolved = 'RUUUUUUUURRRRRRRRUFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

for (const move of ['U', "U'", 'U2', 'D', 'R', "L'", 'F', "B'"]) {
  assert.equal(displayPllPhysicalMove(move, false), move, '普通题面实体转动保持原记号');
}
assert.equal(displayPllPhysicalMove('U', true), 'D', 'z2 题面实体 U 转到画面的下层');
assert.equal(displayPllPhysicalMove("D'", true), "U'", 'z2 题面实体 D 转到画面的上层');
assert.equal(displayPllPhysicalMove('R2', true), 'L2', 'z2 题面也要左右换名');
assert.equal(displayPllPhysicalMove('F', true), 'F', 'z2 不改变前后面名称');

{
  const source = fs.readFileSync(path.join(__dirname, '../src/vue/PllObservation/index.ts'), 'utf8');
  const method = source.match(/  handlePhysicalEvent\([\s\S]*?(?=  private saveResult\()/)?.[0];
  assert.ok(method, '找不到六格实体转动入口');
  const js = ts.transpileModule(`class PllFollowHarness {\n${method}\n}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const Harness = new Function('displayPllPhysicalMove', `${js}\nreturn PllFollowHarness`)(displayPllPhysicalMove);
  const moves = [];
  const follow = new Harness();
  follow.active = true;
  follow.snapshot = { status: 'connected' };
  follow.training = { move: () => {} };
  let refreshed = 0;
  follow.refreshActualFeature = () => { refreshed++; };
  follow.world = { cube: { twister: { push: move => moves.push(move) } } };
  follow.useZ2 = true;
  follow.handlePhysicalEvent({ type: 'move', move: 'U' }, true);
  follow.useZ2 = false;
  follow.handlePhysicalEvent({ type: 'move', move: 'U' }, true);
  assert.deepEqual(moves, ['D', 'U'], '六格实体跟随须使用当前题面的 z2 坐标');
  assert.equal(refreshed,2,'实体跟随转动后须重算当前特征');
}

{
  const source = fs.readFileSync(path.join(__dirname,'../src/vue/PllObservation/index.ts'),'utf8');
  const method = source.match(/  private refreshActualFeature\([\s\S]*?(?=  saveFeaturePreference\()/)?.[0];
  assert.ok(method,'找不到实时特征刷新入口');
  const js = ts.transpileModule(`class PllFeatureHarness {\n${method}\n}`,{
    compilerOptions:{target:ts.ScriptTarget.ES2020},
  }).outputText;
  let matched = 0;
  const Harness = new Function('matchPllSix',`${js}\nreturn PllFeatureHarness`)(state => { matched++; return matchPllSix(state); });
  const view = new Harness();
  const cube = new Cube(3);
  const aa = realPlls.find(item => item.name === 'PLL-Aa');
  const ja = realPlls.find(item => item.name === 'PLL-Ja');
  cube.twister.setup(parseOpFormula(aa.origin).inverse.join(' '));
  let facelets = cube.serialize();
  const busy = new Set();
  view.world = {cube:{serialize:() => facelets,locks:new Map([['move',busy]])}};
  view.updateVisualOverlay = () => {};
  view.stickerPoints = [{number:1}];
  view.refreshActualFeature();
  assert.equal(view.actualFeature.name,'Aa');
  const before = view.actualFeature.six;
  view.refreshActualFeature();
  assert.equal(matched,1,'相同题面不能每帧重复核验');
  cube.twister.push('U');
  cube.twister.finish();
  facelets = cube.serialize();
  view.refreshActualFeature();
  assert.notEqual(view.actualFeature.six,before,'U 转动后应读取实时六格');
  cube.twister.setup(parseOpFormula(ja.origin).inverse.join(' '));
  facelets = cube.serialize();
  view.refreshActualFeature();
  assert.equal(view.actualFeature.name,'Ja','切换到其他 PLL 后应更新名称');
  busy.add('R');
  view.refreshActualFeature();
  assert.equal(view.actualFeature,null,'动画过程中不能保留上一题线索');
  assert.deepEqual(view.stickerPoints,[]);
  busy.clear();
  cube.twister.push('R');
  cube.twister.finish();
  facelets = cube.serialize();
  view.refreshActualFeature();
  assert.equal(view.actualFeature,null,'非 PLL 状态不能保留旧线索');
  cube.twister.push("R'");
  cube.twister.finish();
  facelets = cube.serialize();
  view.refreshActualFeature();
  assert.equal(view.actualFeature.name,'Ja','恢复到 PLL 后应重新识别');
}

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
assert.equal(aufs.current.preRotation, 'U');
assert.equal(aufs.current.postAuf, "U'");
assert.equal(aufs.current.scramble, "U R U'");
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
{
  const preview = new Cube(3);
  const classify = scramble => {
    preview.twister.setup(scramble);
    return describePllSix(preview.serialize())?.chapter || null;
  };
  const categorized = new PllTraining(realPlls, () => 0.75, Date.now,
    origin => parseOpFormula(origin).inverse.join(' '), classify);
  const original = categorized.current;
  assert.equal(categorized.canUseFilters(['PLL-F'], [9]), true, 'F 的左灯右灯题面可出题');
  assert.equal(categorized.canUseFilters(['PLL-H'], [1]), false, '不可能的公式与类别交集应被拒绝');
  categorized.setAllowedNames(['PLL-F']);
  categorized.setAllowedChapters([9]);
  assert.equal(categorized.current, original, '改变分类不替换当前题');
  for (let i = 0; i < 12; i++) {
    const next = categorized.next();
    assert.equal(next.name, 'PLL-F');
    assert.equal(classify(next.scramble), 9, '每道新题都属于选定的实际六格分类');
  }
  categorized.setAllowedChapters([1, 9]);
  for (let i = 0; i < 8; i++) assert.ok([1, 9].includes(classify(categorized.next().scramble)),
    '多选分类只能出所选类别');
  categorized.setAllowedChapters([9]);
  categorized.setZ2(true);
  for (let i = 0; i < 8; i++) assert.equal(classify(categorized.next().scramble), 9, 'z2 朝向也应按题面分类');
  categorized.setAllowedChapters([]);
  assert.equal(categorized.canUseFilters([], []), true, '分类清空表示全部随机');
}
for (const [choice, rotation] of [[0, ''], [0.26, 'U'], [0.51, "U'"], [0.76, 'U2']]) {
  const sample = new PllTraining(items, (() => { const values = [0, choice, 0]; return () => values.shift(); })(), Date.now, () => 'R');
  assert.equal(sample.current.preRotation, rotation);
  assert.equal(sample.current.postAuf, '');
  assert.equal(sample.current.scramble, [rotation, 'R'].filter(Boolean).join(' '));
}
for (let i = 0; i < realPlls.length; i++) for (let pre = 0; pre < 4; pre++) for (let post = 0; post < 4; post++) {
  const picks = [(i + 0.01) / realPlls.length, (pre + 0.01) / 4, (post + 0.01) / 4];
  const trainer = new PllTraining(realPlls, () => picks.shift(), Date.now,
    origin => parseOpFormula(origin).inverse.join(' '));
  const cube = new Cube(3);
  cube.twister.setup(trainer.current.scramble);
  assert.equal(matchPllSix(cube.serialize())?.name, realPlls[i].name.slice(4),
    `${realPlls[i].name} 前 AUF=${pre} 后 AUF=${post} 仍须是原 PLL`);
  trainer.setZ2(true);
  cube.twister.setup(trainer.current.scramble);
  assert.equal(matchPllSix(cube.serialize())?.name, realPlls[i].name.slice(4),
    `${realPlls[i].name} z2 前 AUF=${pre} 后 AUF=${post} 仍须是原 PLL`);
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
