const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const ts = require('typescript');
globalThis.requestAnimationFrame = () => 0;
const compiledRequire = createRequire(path.resolve('.tmp/data.js'));
const Cube = compiledRequire('./cuber/cube').default;
const Cubelet = compiledRequire('./cuber/cubelet').default;
const source = ts.transpileModule(fs.readFileSync('src/data.ts', 'utf8'), {
  compilerOptions:{target:ts.ScriptTarget.ES2020, module:ts.ModuleKind.CommonJS, esModuleInterop:true},
}).outputText;
const dataModule = {exports:{}};
const saved = new Map();
const window = {localStorage:{getItem:key => saved.get(key) || null, setItem:(key,value) => saved.set(key,value)}};
new Function('require', 'module', 'exports', 'window', source)(
  name => name === '.' ? {} : compiledRequire(name), dataModule, dataModule.exports, window);
const {PaletteData} = dataModule.exports;
const expected = {U:'#F0F0F0', D:'#FFD600', F:'#00A020', R:'#B71C1C', L:'#FF6D00', B:'#0D47A1'};
for (const storage of [null, {version:'0.3', preset:'默认', colors:{}}]) {
  saved.clear();
  if (storage) saved.set('palette', JSON.stringify(storage));
  const palette = new PaletteData({dirty:false});
  palette.refresh();
  const cube = new Cube(3);
  for (const [enabled, top] of [[false,'#F0F0F0'], [true,'#FFD600']]) {
    cube.twister.setup(enabled ? 'z2' : '');
    const facelets = cube.serialize();
    assert.equal(palette.getColor(facelets[4]), top, `z2=${enabled} 顶面颜色`);
    assert.equal(palette.getColor(facelets[22]), '#00A020', '前面始终为绿色');
  }
  for (const [face, color] of Object.entries(expected)) {
    assert.equal(palette.getColor(face), color);
    assert.equal(Cubelet.LAMBERS[face].color.getHexString().toUpperCase(), color.slice(1));
    assert.equal(Cubelet.BASICS[face].color.getHexString().toUpperCase(), color.slice(1));
  }
  palette.color('U', '#123456');
  palette.save();
  const reloaded = new PaletteData({dirty:false});
  reloaded.refresh();
  assert.equal(reloaded.getColor('U'), '#123456', '保留已保存的自定义颜色');
  reloaded.reset();
  assert.equal(reloaded.getColor('U'), '#F0F0F0', '重置恢复白顶默认配色');
  assert.equal(Cubelet.LAMBERS.U.color.getHexString().toUpperCase(), 'F0F0F0');
}
saved.set('palette', JSON.stringify({version:'0.3', preset:'鲜艳', colors:{}}));
const vivid = new PaletteData({dirty:false});
vivid.refresh();
assert.equal(vivid.getColor('U'), '#FFFFFF', '缺失的颜色按所选预设补全');
console.log('默认配色、z2 白顶/黄顶绿前、自定义保存和重置：通过');
