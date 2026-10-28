const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const { exportCustomOlls, mergeCustomOlls } = require('../.tmp/ble/op-oll-transfer.js');

const existing = [{ id: 'custom-existing', name: '我的 OLL', origin: "R U R' U'" }];
const valid = item => {
  if (item.origin === 'R2') throw Error('不是 OLL');
};
const text = exportCustomOlls(existing, 'txt');
assert.equal(text, "我的 OLL|R U R' U'\n");
assert.deepEqual(JSON.parse(exportCustomOlls(existing, 'json')), {
  version: 1, items: [{ name: '我的 OLL', origin: "R U R' U'" }],
});
for (const format of ['txt', 'json']) {
  const imported = mergeCustomOlls([], exportCustomOlls(existing, format), format, valid);
  assert.equal(imported.added, 1);
  assert.equal(imported.items[0].name, '我的 OLL');
  assert.equal(imported.items[0].origin, existing[0].origin);
}
const merged = mergeCustomOlls(existing, "重复|(R U) R' U'\n我的 OLL|F R U R' U' F'\n我的 OLL|F R U R' U' F'\nU R U' R'\n", 'txt', valid);
assert.equal(merged.added, 2);
assert.equal(merged.skipped, 2);
assert.equal(merged.renamed, 1);
assert.deepEqual(merged.items.map(item => item.name), ['我的 OLL', '我的 OLL (2)', '导入 OLL 1']);
assert.equal(merged.items[0], existing[0], '现有条目原样保留');
assert.equal(new Set(merged.items.map(item => item.id)).size, 3);
const suffix = mergeCustomOlls([...existing, { id: 'custom-second', name: '我的 OLL (2)', origin: "F R U R' U' F'" }],
  "我的 OLL|L U L' U'", 'txt');
assert.equal(suffix.items[2].name, '我的 OLL (3)');
assert.equal(mergeCustomOlls([], JSON.stringify({ version: 1, items: [{ id: 'from-another-device', name: '带 ID', origin: 'F U' }] }), 'json').items[0].id.startsWith('custom-'), true);
assert.deepEqual(existing, [{ id: 'custom-existing', name: '我的 OLL', origin: "R U R' U'" }], '不得修改入参');
assert.throws(() => mergeCustomOlls(existing, '新公式|F R U R\n坏公式|R2', 'txt', valid), /不是 OLL/);
assert.throws(() => mergeCustomOlls(existing, '名称|bad token', 'txt', valid), /不支持/);
assert.throws(() => mergeCustomOlls(existing, '{', 'json', valid), /JSON|格式/);
assert.throws(() => mergeCustomOlls(existing, 'x'.repeat(1024 * 1024 + 1), 'txt', valid), /过大/);
assert.throws(() => mergeCustomOlls(Array.from({ length: 100 }, (_, i) =>
  ({ id: `custom-${i}`, name: `第${i}条`, origin: 'R U' })),
  '新增|L U L\' U\'', 'txt', valid), /100/);
console.log('自定义 OLL 双格式导入导出与合并：通过');
