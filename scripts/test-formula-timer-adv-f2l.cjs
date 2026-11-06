const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.requestAnimationFrame = () => 0;
const { buildFormulaPool, makeFormulaCase } = require('../.tmp/ble/formula-timer-formula.js');
const { isFormulaGoal } = require('../.tmp/ble/formula-timer.js');
const { createAdvancedF2LGoal } = require('../.tmp/ble/formula-timer-goal.js');
const { FormulaTimerStore } = require('../.tmp/ble/formula-timer-store.js');
const { FormulaStatsPreferencesStore } = require('../.tmp/ble/formula-timer-stats-preferences.js');
const { summarizeFormulaRecords } = require('../.tmp/ble/formula-timer-stats.js');
const Cube = require('../.tmp/cuber/cube.js').default;
const { solvedCubie, faceletsToCubie, cubieToFacelets } = require('../.tmp/ble/move-diff.js');
const cases = require('../src/vue/AdvancedF2L/data.json').cases;
const groups = require('../src/vue/Algs/algs.json');
let failures = 0;
const test = (name, run) => {
  try { run(); console.log(`✓ ${name}`); }
  catch (error) { failures++; console.error(`✗ ${name}\n${error.stack}`); }
};
const pool = buildFormulaPool(groups, [], cases);
const advanced = pool.filter(item => item.category === 'advf2l');
test('全部非标案例的有效方向和备选公式进入独立题池，标识唯一稳定', () => {
  assert.equal(advanced.length, 598);
  assert.equal(new Set(pool.map(item => item.id)).size, pool.length);
  for (const item of cases) item.algs.forEach((variants, direction) => variants.forEach((variant, index) => {
    const formula = advanced.find(value => value.id === `advf2l:${item.id}:${direction}:${variant.altId}`);
    assert.ok(formula, `${item.name}/${direction}/${index}`);
    assert.ok(['FR', 'FL', 'BL', 'BR'].includes(formula.targetSlot));
    assert.ok(formula.name.includes(item.name));
    assert.ok(!/2'/.test(formula.formula), '兼容源数据的半转记法');
  }));
});
const stateAfter = moves => {
  const cube = new Cube(3);
  cube.twister.setup(moves);
  return cube.serialize();
};
test('真实非标题按角块配色归槽，不把角块被困的位置当作目标槽位', () => {
  for (const [caseId, expected] of [[3534, ['BR','FR','FL','BL']], [3535, ['BL','BR','FR','FL']],
    [3536, ['FL','BL','BR','FR']], [3543, ['BR','FR','FL','BL']]]) {
    expected.forEach((slot, direction) => {
      const item = advanced.find(value => value.id.startsWith(`advf2l:${caseId}:${direction}:`));
      assert.equal(item.targetSlot, slot, item.name);
    });
  }
  const item = advanced.find(value => value.id === 'advf2l:3534:0:4069');
  const context = makeFormulaCase(item, [], () => 0, false, '', false);
  assert.equal(isFormulaGoal('advf2l', stateAfter("R U R'"), context), true,
    'BR 目标已完成时允许原角块所在的 FR 槽未完成');
  assert.equal(isFormulaGoal('advf2l', stateAfter("R' U' R"), context), false,
    '仅完成 FR 而实际 BR 目标未完成时不得成功');
});
test('全部598条备选公式及出题转向都跟踪实际目标角块，而非它所在的位置', () => {
  const simulator = new Cube(3);
  const cornerIndices = [20, 18, 0, 2];
  for (const item of advanced) {
    const [, caseId, direction] = item.id.split(':');
    const source = cases.find(value => value.id === Number(caseId));
    for (const flipped of [false, true]) for (const yaw of ['', 'y', "y'", 'y2']) {
      const generated = makeFormulaCase(item, [], () => 0.25, flipped, yaw, true);
      simulator.twister.setup(generated.scramble.replace(/ U$/, ''));
      const position = cornerIndices[Number(direction)] + (source.subgroup === 'Trapped Edge' ? 6 : 0);
      const targetColors = simulator.cubelets[position].stickers.filter(Boolean)
        .map(sticker => sticker.name).sort().join('');
      const goal = createAdvancedF2LGoal(generated);
      assert.ok(goal.slots.some(colors => colors.split('').sort().join('') === targetColors),
        `${item.name}/${flipped}/${yaw} 必须检查目标实体块 ${targetColors}`);
    }
  }
});
const baseline = { id:'advf2l:1:0:goal-test', category:'advf2l', targetSlot:'FR',
  initialFacelets:stateAfter("R U R' L' U' L") };
test('目标槽位完成且保留初始十字和已完成槽位即可，原本未完成的槽位不作要求', () => {
  const final = stateAfter("L' U' L");
  assert.equal(isFormulaGoal('f2l', final), false);
  assert.equal(isFormulaGoal('advf2l', final, baseline), true);
  assert.equal(isFormulaGoal('advf2l', baseline.initialFacelets, baseline), false);
  assert.equal(isFormulaGoal('advf2l', stateAfter("L U L'"), baseline), false,
    '原本已完成的后左槽位被破坏，不得成功');
});
test('目标角棱都必须归位且朝向正确，不可只完成其中一块', () => {
  const corner = solvedCubie();
  [corner.cp[4], corner.cp[0], corner.cp[3]] = [corner.cp[0], corner.cp[3], corner.cp[4]];
  assert.equal(isFormulaGoal('advf2l', cubieToFacelets(corner), baseline), false);
  const edge = solvedCubie();
  [edge.ep[8], edge.ep[0], edge.ep[3]] = [edge.ep[0], edge.ep[3], edge.ep[8]];
  assert.equal(isFormulaGoal('advf2l', cubieToFacelets(edge), baseline), false);
  const flipped = solvedCubie();
  flipped.eo[8] = flipped.eo[0] = 1;
  assert.equal(isFormulaGoal('advf2l', cubieToFacelets(flipped), baseline), false);
});
test('初始正确十字棱的底色、侧色、位置和朝向都必须保持正确', () => {
  const shifted = solvedCubie();
  [shifted.ep[4], shifted.ep[5]] = [shifted.ep[5], shifted.ep[4]];
  [shifted.ep[0], shifted.ep[1]] = [shifted.ep[1], shifted.ep[0]];
  assert.equal(isFormulaGoal('advf2l', cubieToFacelets(shifted), baseline), false,
    '底色虽同色但十字侧色未对齐不得成功');
  const flipped = solvedCubie();
  flipped.eo[4] = flipped.eo[0] = 1;
  assert.equal(isFormulaGoal('advf2l', cubieToFacelets(flipped), baseline), false);
});
test('仅锁定初始已正确的十字棱，不额外要求修复打乱时已错误的十字棱', () => {
  const swapCross = facelets => {
    const state = faceletsToCubie(facelets);
    [state.ep[4], state.ep[5]] = [state.ep[5], state.ep[4]];
    [state.ep[0], state.ep[1]] = [state.ep[1], state.ep[0]];
    return cubieToFacelets(state);
  };
  const partial = { ...baseline, initialFacelets:swapCross(baseline.initialFacelets) };
  assert.equal(isFormulaGoal('advf2l', swapCross(stateAfter("L' U' L")), partial), true);
});
test('整体转体后仍跟踪原目标块，不能因当前前右槽位已完成而误判', () => {
  for (const rotation of ['', 'y', "y'", 'y2', 'x', "x'", 'x2', 'z', "z'", 'z2', 'x y']) {
    assert.equal(isFormulaGoal('advf2l', stateAfter(`L' U' L ${rotation}`), baseline), true, rotation);
    assert.equal(isFormulaGoal('advf2l', stateAfter(`R U R' ${rotation}`), baseline), false, rotation);
  }
});
test('四个目标方向及出题转向分别绑定正确槽位，不混用前右目标', () => {
  const slots = ['FR', 'FL', 'BL', 'BR'];
  const setups = ["R U R'", "L' U' L", "L U L'", "R' U' R"];
  for (const [direction, targetSlot] of slots.entries()) {
    const other = setups[(direction + 1) % slots.length];
    for (const prefix of ['', 'z2', 'y', 'z2 y', 'x y']) {
      const initial = `${prefix} ${other} ${setups[direction]}`;
      const context = { id:`advf2l:1:${direction}:direction-test`, targetSlot,
        initialFacelets:stateAfter(initial) };
      const final = stateAfter(`${prefix} ${other}`);
      assert.equal(isFormulaGoal('advf2l', final, context), true, `${targetSlot}/${prefix}`);
      assert.equal(isFormulaGoal('f2l', final), false);
      assert.equal(isFormulaGoal('advf2l', stateAfter(`${prefix} ${setups[direction]}`), context), false);
    }
  }
});
test('缺少目标时不能把旧方向 ID 当成目标归位槽位', () => {
  assert.equal(isFormulaGoal('advf2l', stateAfter("L' U' L"),
    { id:baseline.id, initialFacelets:baseline.initialFacelets }), false);
  assert.equal(isFormulaGoal('advf2l', stateAfter(''), { ...baseline, initialFacelets:'' }), false);
  assert.equal(isFormulaGoal('advf2l', stateAfter(''), { ...baseline, id:'unknown', targetSlot:undefined }), false);
  assert.equal(isFormulaGoal('advf2l', stateAfter('')), false);
});
test('非标完成目标允许顶层未完成', () => {
  const cube = new Cube(3);
  cube.twister.setup("R U R' U R U2 R'");
  assert.equal(isFormulaGoal('advf2l', cube.serialize(), baseline), true);
  cube.twister.setup('R');
  assert.equal(isFormulaGoal('advf2l', cube.serialize(), baseline), false);
});
test('全部非标公式正常及黄顶转向出题后可还原，随机 U 不破坏解法', () => {
  assert.equal(advanced.length, 598);
  for (const item of advanced) for (const flipped of [false, true]) {
    const generated = makeFormulaCase(item, [], () => 0.25, flipped, 'y', true);
    assert.equal(isFormulaGoal('advf2l', generated.initialFacelets, generated), false, item.name);
    const cube = new Cube(3);
    cube.twister.setup(`${generated.scramble} U' ${item.formula}`);
    assert.equal(isFormulaGoal('advf2l', cube.serialize(), generated), true, item.name);
  }
});
test('旧设置保留选题和记录，新增分类独立存储并支持统计偏好', () => {
  let stored = null;
  const storage = { getItem: () => stored, setItem: (key, value) => { stored = value; } };
  const store = new FormulaTimerStore(storage);
  const initial = store.load();
  assert.deepEqual(initial.settings.selectedIds.advf2l, []);
  const legacySettings = { ...initial.settings, selectedIds: { f2l:['f2l:F2L-01'], oll:[], pll:[] } };
  const record = { id:'f2l:F2L-01', category:'f2l', name:'old', formula:'R', initialFacelets:'old',
    result:'success', at:10, durationMs:1000 };
  stored = JSON.stringify({ version:1, settings:legacySettings, records:[record] });
  const migrated = store.load();
  assert.equal(migrated.warning, '');
  assert.deepEqual(migrated.records, [record]);
  assert.deepEqual(migrated.settings.selectedIds, { ...legacySettings.selectedIds, advf2l:[] });
  const settings = { ...migrated.settings, category:'advf2l',
    selectedIds:{ ...migrated.settings.selectedIds, advf2l:['advf2l:case'] } };
  const advancedRecord = { ...record, id:'advf2l:case', category:'advf2l' };
  store.save(settings, [record, advancedRecord]);
  assert.deepEqual(store.load().settings, settings);
  assert.equal(store.load().records.length, 2);
  const summary = summarizeFormulaRecords(store.load().records, 'advf2l', 'per-formula', 20, 3);
  assert.equal(summary.overview.successCount, 1);
  const preferences = new FormulaStatsPreferencesStore(storage);
  preferences.save({ category:'advf2l', mode:'per-formula', count:20 });
  assert.equal(preferences.load().category, 'advf2l');
  stored = JSON.stringify({ version:1, settings:{ ...settings, selectedIds:{ ...settings.selectedIds, advf2l:17 } }, records:[] });
  assert.ok(store.load().warning, '不接受损坏的新分类选题');
});
test('菜单非标 F2L 按钮真正导航并关闭菜单', () => {
  const source = fs.readFileSync('src/vue/Setting/index.ts', 'utf8');
  const body = source.match(/tap\(key: string \| SettingItem\): void \{([\s\S]*?)\n  \}/)[1];
  const tap = new Function('SettingItem', `return function(key) {${body}}`)(class {});
  let route = null;
  const menu = { menu:true, navigate:value => { route = value; } };
  tap.call(menu, 'advf2l');
  assert.deepEqual(route, { mode:'advf2l' });
  assert.equal(menu.menu, false);
});
if (failures) process.exitCode = 1;
