const assert = require('node:assert/strict');
const cases = require('../src/vue/AdvancedF2L/data.json').cases;
global.requestAnimationFrame = () => 0;
const { selectAdvancedF2LCase, advancedF2LPreview } = require('../.tmp/ble/adv-f2l.js');
const Cube = require('../.tmp/cuber/cube.js').default;
const { parseAppRoute, routeUrl } = require('../.tmp/ble/app-route.js');
const fs = require('node:fs');
const path = require('node:path');

assert.equal(cases.length, 54, '保留全部 54 个非标 F2L 案例');
assert.deepEqual(Object.fromEntries([...new Set(cases.map(item => item.subgroup))]
  .map(group => [group, cases.filter(item => item.subgroup === group).length])), {
  'Trapped Corner': 18,
  'Trapped Edge': 18,
  'Both Pieces Trapped': 18,
});
assert.equal(cases.reduce((total, item) => total + item.algs.flat().length, 0), 598);
assert.ok(cases.every(item => item.algs.length === 4 && item.oriNames.length === 4));
assert.ok(cases.some(item => item.algs.some(group => !group.length)), '源数据中的空方向不能补造公式');
assert.ok(cases.every(item => item.algs.flat().every(variant => variant.altId && variant.alg)));

const first = selectAdvancedF2LCase(cases[0], 0, 0);
assert.equal(first.id, cases[0].id);
assert.equal(first.altId, cases[0].algs[0][0].altId);
assert.equal(first.displayFormula, cases[0].algs[0][0].alg);
assert.ok(first.moves.length && first.inverse.length);
assert.notEqual(selectAdvancedF2LCase(cases[0], 0, 1).altId, first.altId);
assert.throws(() => selectAdvancedF2LCase(cases.find(item => item.name === 'AF2L 9a'), 1, 0), /暂无解法/);

const failures = [];
const previewCube = new Cube(3);
const slotPositions = [[20, 23], [18, 21], [0, 3], [2, 5]];
const previewPositions = [
  Array.from({length:9}, (_, i) => Math.floor(i / 3) * 9 + 6 + i % 3),
  Array.from({length:9}, (_, i) => 18 + (2 - Math.floor(i / 3)) * 3 + i % 3),
  Array.from({length:9}, (_, i) => (2 - i % 3) * 9 + (2 - Math.floor(i / 3)) * 3 + 2),
];
const previewYaw = ['', "y'", 'y2', 'y'];
for (const item of cases) for (let direction = 0; direction < 4; direction++) {
  const normal = advancedF2LPreview(item, false, previewCube, direction);
  const flipped = advancedF2LPreview(item, true, previewCube, direction);
  for (const [label, faces] of [['normal', normal], ['z2', flipped]]) {
    assert.equal(faces.length, 3, `${item.name}/${direction}/${label} U/F/R`);
    for (const face of faces) assert.match(face, /^[URFDLBX]{9}$/, `${item.name}/${direction}/${label} 九格贴纸`);
    assert.ok(faces.join('').includes('X'), `${item.name}/${direction}/${label} 无关槽位应为灰色`);
    assert.ok(/[URFDLB]/.test(faces.join('')), `${item.name}/${direction}/${label} 目标块应有彩色贴纸`);
    // 以还原态的物理角棱为准：z2 是改变视角，不会把目标块换成另一个槽位的块。
    const target = slotPositions[direction].map(index => previewCube.initials[index]);
    const irrelevant = slotPositions.filter((_, index) => index !== direction)
      .flat().map(index => previewCube.initials[index]);
    previewCube.twister.setup([label === 'z2' ? 'z2' : '', previewYaw[direction]].filter(Boolean).join(' '));
    const targetSlots = new Set(target.map(piece => previewCube.cubelets.indexOf(piece)));
    const selected = item.algs[direction].length ? selectAdvancedF2LCase(item, direction, 0) : null;
    previewCube.twister.setup([label === 'z2' ? 'z2' : '', ...(selected ? selected.inverse : [item.setup]), previewYaw[direction]].filter(Boolean).join(' '));
    faces.forEach((face, faceIndex) => [...face].forEach((sticker, cell) => {
      const position = previewPositions[faceIndex][cell];
      const piece = previewCube.cubelets[position];
      assert.equal(sticker === 'X', irrelevant.includes(piece) && !targetSlots.has(position),
        `${item.name}/${direction}/${label} 第 ${faceIndex}/${cell} 格的目标块/无关块灰度`);
    }));
  }
  assert.notDeepEqual(normal, flipped, `${item.name}/${direction} z2 应切换朝向`);
  if (direction === 1) assert.notDeepEqual(normal, advancedF2LPreview(item, false, previewCube, 0),
    `${item.name} 改变槽位方向应改变缩略图`);
}
for (const item of cases) for (let direction = 0; direction < 4; direction++) {
  if (direction === 0) {
    try {
      previewCube.twister.setup(item.setup.replace(/([URFDLBMESxyzurfdlb])2'/g, '$12'));
      assert.equal(previewCube.serialize().length, 54);
    } catch (error) { failures.push(`${item.name}/setup: ${error.message}`); }
  }
  for (let variant = 0; variant < item.algs[direction].length; variant++) {
    try {
      const selection = selectAdvancedF2LCase(item, direction, variant);
      const cube = new Cube(3);
      cube.twister.setup(selection.inverse.join(' '));
      const start = cube.serialize();
      assert.notEqual(start, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
      cube.twister.setup([...selection.inverse, ...selection.moves].join(' '));
      assert.equal(cube.complete, true, '正向回放应还原从所选公式逆操作得到的状态');
      cube.twister.setup(['z2', ...selection.inverse].join(' '));
      assert.notEqual(cube.serialize(), start, 'z2 起点必须改变朝向');
      cube.twister.setup(['z2', ...selection.inverse, ...selection.moves].join(' '));
      assert.equal(cube.complete, true, 'z2 朝向回放也应还原');
    } catch (error) { failures.push(`${item.name}/${item.oriNames[direction]}/${item.algs[direction][variant].altId}: ${error.message}`); }
  }
}
assert.equal(failures.length, 0, `无法播放 ${failures.length} 条：\n${failures.slice(0, 20).join('\n')}`);

assert.equal(parseAppRoute('?mode=advf2l').mode, 'advf2l');
assert.equal(routeUrl({ mode: 'advf2l' }, '/'), '/?mode=advf2l');
assert.match(fs.readFileSync(path.join(__dirname, '../src/vue/Setting/index.html'), 'utf8'),
  /tap\('advf2l'\)/, '主菜单须有新模式入口');
const shell = fs.readFileSync(path.join(__dirname, '../src/vue/AppShell/index.ts'), 'utf8');
assert.match(shell, /advf2l:\s*AdvancedF2L/, '独立页面须注册到路由视图');
const page = fs.readFileSync(path.join(__dirname, '../src/vue/AdvancedF2L/index.ts'), 'utf8');
for (const action of ['selectCase', 'selectDirection', 'selectVariant', 'toStart', 'previous', 'next', 'play', 'pause']) {
  assert.match(page, new RegExp(`\\b${action}\\(`), `缺少 ${action} 播放操作`);
}
const template = fs.readFileSync(path.join(__dirname, '../src/vue/AdvancedF2L/index.html'), 'utf8');
assert.match(template, /^<v-app>\s*<div class="adv-f2l-root">/, '页面须有 Vuetify 应用根以承载菜单弹层');
assert.match(template, /<viewport/, '常驻 3D 魔方');
assert.match(template, /selected\.algs\[direction\]/, '每个方向保留多条公式');
assert.match(template, /aria-label="z2"/, '可切换 z2 的复选框');
assert.match(template, /adv-f2l-preview-cube/, '案例卡片使用三维立方体');
assert.match(template, /getColor\(sticker\)/, '缩略图应遵循有效配色');
assert.match(page, /advF2LZ2/, '独立记忆 z2 状态');
const style = fs.readFileSync(path.join(__dirname, '../src/vue/AdvancedF2L/index.css'), 'utf8');
assert.doesNotMatch(style, /\.adv-f2l-root button(?:\s|\.|:|\{)/, '页面按钮规则不得覆盖 Setting 的 Vuetify 菜单');
assert.match(style, /transform-style:\s*preserve-3d/, '缩略图拥有立体透视');
assert.match(style, /grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/, '手机也须三列');

console.log('非标 F2L 数据完整性：通过');
