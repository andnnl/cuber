const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const { previewOllFacelets } = require('../.tmp/ble/op-oll-preview.js');
const { parseOpFormula } = require('../.tmp/ble/op-formula.js');
const olls = require('../src/vue/Algs/algs.json').find(group => group.name === 'OLL').items;

for (const oll of olls) {
  let received;
  const facelets = previewOllFacelets(oll, moves => {
    received = moves;
    return 'D'.repeat(9) + 'R'.repeat(9) + 'F'.repeat(9) + 'U'.repeat(9) + 'L'.repeat(9) + 'B'.repeat(9);
  });
  assert.deepEqual(received, ['z2', ...parseOpFormula(oll.origin).inverse], `${oll.name} 应从黄顶绿前执行逆公式`);
  assert.equal(facelets.length, 54);
}
assert.equal(olls.length, 57);
console.log('无缝 OP 57 张 OLL 预览生成：通过');
