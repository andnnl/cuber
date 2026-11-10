const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = function loadTypeScript(module, filename) {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    fileName: filename,
  });
  module._compile(compiled.outputText, filename);
};

const prediction = require('../src/vue/CrossF2LTrainer/prediction.ts');
const { rotatePositionByOps, pieceName } = require('../src/vue/CrossF2LTrainer/pieces.ts');
assert.strictEqual(typeof prediction.stickerVerdict, 'function', '应提供位置和朝向同时判定');
for (const face of 'URFDLB') {
  for (const axis of ['x', 'y', 'z']) {
    for (const times of [-2, -1, 0, 1, 2]) {
      const rotated = prediction.rotateStickerFace(face, [{ axis, times }]);
      assert.strictEqual(prediction.rotateStickerFace(rotated, [{ axis, times: -times }]), face);
    }
  }
}
for (let index = 0; index < 27; index++) {
  const faces = prediction.positionFaces(index);
  for (const axis of ['x', 'y', 'z']) {
    const ops = [{ axis, times: 1 }];
    const rotated = rotatePositionByOps(index, ops);
    assert.deepStrictEqual(faces.map(face => prediction.rotateStickerFace(face, ops)).sort(), prediction.positionFaces(rotated).sort());
  }
  assert.deepStrictEqual(faces, pieceName(index).split(''));
}
const edge = [{ color: 'F', face: 'R' }, { color: 'R', face: 'B' }];
assert.strictEqual(prediction.selectEdgeSticker(edge), 'R');
assert.strictEqual(prediction.selectEdgeSticker(edge, 'F'), 'F');
assert.strictEqual(prediction.selectEdgeSticker([{ color: 'F', face: 'D' }, { color: 'R', face: 'L' }]), 'F');
const correct = { enabled: true, index: 26, face: 'U', actualIndex: 26, actualFace: 'U' };
assert.strictEqual(prediction.stickerVerdict(correct), 'correct');
assert.strictEqual(prediction.stickerVerdict({ ...correct, face: 'F' }), 'incorrect');
assert.strictEqual(prediction.stickerVerdict({ ...correct, index: 24 }), 'incorrect');
assert.strictEqual(prediction.stickerVerdict({ ...correct, face: '' }), 'incomplete');
assert.strictEqual(prediction.stickerVerdict({ ...correct, index: null }), 'incomplete');
assert.strictEqual(prediction.stickerVerdict({ ...correct, enabled: false, index: null }), 'disabled');
assert.strictEqual(prediction.normalizePredictionFormula(" R  U2 R’ "), "R U2 R'");
assert.strictEqual(prediction.normalizePredictionFormula("M S' E2 r u'"), "M S' E2 r u'");
assert.throws(() => prediction.normalizePredictionFormula('R garbage U'), /无效/);
assert.throws(() => prediction.normalizePredictionFormula(''), /输入/);
console.log('F2L sticker prediction logic OK');
