const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('src/vue/CfopLearning/index.ts', 'utf8');
const template = fs.readFileSync('src/vue/CfopLearning/index.html', 'utf8');
assert.match(template, /@click="togglePlay"[^>]*>[^<]*<\/button>\s*<button @click="generateGif"[^>]*:disabled="[^"]*gifRecording[^"]*"[^>]*>[^<]*生成 GIF/);
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const component = parsed.statements.find(ts.isClassDeclaration);
const methods = ['generateGif', 'recordGif', 'stopGif', 'stopPlayback'];
const members = component.members.filter(member => member.name && methods.includes(member.name.getText(parsed)));
assert.equal(members.length, methods.length);
const code = ts.transpileModule(`class TestPage {${members.map(member => member.getText(parsed)).join('\n')}}`,
  {compilerOptions:{target:ts.ScriptTarget.ES2018}}).outputText;
let downloads = 0;
let disposed = 0;
let renderError = false;
let encodedFrames = 0;
const renderer = class {
  setPixelRatio() {} setSize() {} setClearColor() {} clear() {}
  render() { if (renderError) throw new Error('render failed'); }
  getContext() { return {RGBA:1, UNSIGNED_BYTE:1, readPixels() {}}; }
  dispose() { disposed++; }
};
const encoder = class {
  start() {} add() { encodedFrames++; } finish() {}
  out = {getData:() => new Uint8Array([71, 73, 70])};
};
const TestPage = new Function('THREE', 'GIF', 'COLORS', 'Util', 'URL', 'window', 'tweener',
  `${code}; return TestPage;`)({WebGLRenderer:renderer}, encoder, {},
  {DOWNLOAD:() => downloads++}, {createObjectURL:() => 'blob:test', revokeObjectURL() {}},
  {setTimeout:callback => callback()}, {finish() {}});
function page() {
  const instance = new TestPage();
  Object.assign(instance, {route:{moves:['R'], frames:[]}, follow:null, busy:false,
    stepping:false, gifRecording:false, gifCapture:null, animationVersion:0, cursor:1,
    world:{width:800, height:400, resize() {}, scene:{}, camera:{}},
    seek(cursor) { this.stopPlayback(); this.cursor = cursor; },
    async togglePlay() { this.recordGif(); this.cursor = 1; }});
  return instance;
}
(async () => {
  const normal = page();
  await normal.generateGif();
  assert.equal(downloads, 1);
  assert.ok(encodedFrames >= 2, 'record start and end frames');
  assert.equal(normal.gifRecording, false);
  assert.equal(normal.gifCapture, null);
  assert.equal(disposed, 1);
  assert.equal(normal.world.width, 800);
  assert.equal(normal.world.height, 400);
  const cancelled = page();
  cancelled.togglePlay = async function () { this.stopPlayback(); };
  await cancelled.generateGif();
  assert.equal(downloads, 1, 'cancelled export must not download');
  assert.equal(cancelled.gifRecording, false);
  const blocked = page();
  blocked.follow = {};
  await blocked.generateGif();
  assert.equal(downloads, 1, 'physical follow must not export');
  renderError = true;
  const failed = page();
  await failed.generateGif();
  assert.match(failed.error, /render failed/);
  assert.equal(failed.world.width, 800);
  assert.equal(failed.world.height, 400);
  assert.equal(failed.gifRecording, false);
  assert.equal(failed.gifCapture, null);
  assert.equal(downloads, 1);
  console.log('CFOP GIF export, cancellation and cleanup verified');
})().catch(error => {console.error(error); process.exitCode = 1;});
