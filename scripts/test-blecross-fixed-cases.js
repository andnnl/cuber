const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const path = require('path');

const filename = path.join(__dirname, '..', 'src/vue/BleCrossTrainer/fixed-cases.ts');
const source = fs.readFileSync(filename, 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const { FIXED_CASES, parseFixedFormula, invertFixedMoves, fixedMoveHint } = mod.exports;

assert.strictEqual(FIXED_CASES.filter(item => item.group === '普通情况').length, 39);
assert.strictEqual(FIXED_CASES.filter(item => item.group === '麻烦情况').length, 12);
assert.deepStrictEqual(FIXED_CASES.filter(item => item.group === '麻烦情况').map(item => item.formula), [
  "x U' R U x' R2",
  'x U L D R U x\'',
  'L R B F D2 L R',
  "x R D' L' U' F' R' U2 x'",
  'M2 U2 M2',
  "z' U' R U R' U' z",
  'x U2 D2 z U2 D2 x\'',
  'z U2 D2 R2 x U2 D2',
  "R2 U' x L2 U2 F' R2 x'",
  "L R U2 y' r' U x R' F",
  "x R' U R' z2 R' U R' x'",
  "F U B L' R' F D' R'",
]);
assert.strictEqual(new Set(FIXED_CASES.map(item => item.id)).size, 51);
assert.deepStrictEqual(parseFixedFormula("R'F L' B"), ["R'", 'F', "L'", 'B']);
assert.throws(() => parseFixedFormula('R? F'), /不支持/);
assert.throws(() => parseFixedFormula('Q R'), /不支持/);
for (const item of FIXED_CASES) {
  assert.deepStrictEqual(invertFixedMoves(parseFixedFormula(item.inverse)), item.moves, item.id);
  assert.strictEqual(item.scoreable, item.moves.every(move => /^[URFDLB]/.test(move)));
  for (const move of item.moves) assert.ok(fixedMoveHint(move).includes(move));
}
console.log('固定公式案例库：51 条、无空格分词、逆序及扩展记号校验通过');
