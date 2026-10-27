const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const { parseOpFormula } = require('../.tmp/ble/op-formula.js');
const algs = require('../src/vue/Algs/algs.json');

for (const group of algs.filter(item => item.name === 'OLL' || item.name === 'PLL')) {
  for (const item of group.items) {
    let parsed;
    try { parsed = parseOpFormula(item.origin); }
    catch (error) { throw new Error(`${item.name} ${item.origin}: ${error.message}`); }
    assert.ok(parsed.moves.length > 0, `${item.name} 未解析出转动`);
    assert.ok(parsed.inverse.length > 0, `${item.name} 未解析出逆转动`);
  }
}

for (const move of ['U', "U'", 'U2']) {
  assert.equal(parseOpFormula(`${move} (R U R' U')`).openingAuf, move);
}
assert.equal(parseOpFormula("R U R'").openingAuf, null);
assert.equal(parseOpFormula("y U R U'").openingAuf, null);
assert.deepEqual(parseOpFormula('R U').inverse, ["U'", "R'"]);
assert.throws(() => parseOpFormula(''), /为空/);
assert.throws(() => parseOpFormula('Q U R'), /不支持|无效/);
assert.throws(() => parseOpFormula('(R U'), /括号|无效/);
assert.throws(() => parseOpFormula('R U )'), /括号|无效/);
console.log('无缝 OP 公式解析：通过');
