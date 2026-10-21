const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('src/wasm/CfopClient.ts', 'utf8');
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018}}).outputText;
const target = {exports:{}};
new Function('module', 'exports', code)(target, target.exports);
const {CfopClient} = target.exports;
const instances = [];
global.Worker = class {
  constructor(url) { this.url = url; this.terminated = false; instances.push(this); }
  postMessage(message) { this.message = message; }
  terminate() { this.terminated = true; }
};
(async () => {
  const client = new CfopClient();
  const request = client.search('start', {input:'R'}, 1000);
  const worker = instances[0];
  assert.ok(worker, 'search Worker created');
  assert.ok(worker.message, 'search request posted');
  worker.onmessage({data:{id:worker.message.id, ok:true, result:['R']}});
  assert.deepStrictEqual(await request, ['R']);
  const pending = client.timeline('R', ['U']);
  client.cancel();
  await pending.then(() => {throw new Error('未取消');}, error => {assert.match(error.message, /取消/);});
  assert.ok(instances[1].terminated);
  client.dispose();
  assert.throws(() => client.search('start', {}, 1000), /关闭/);
  console.log('CFOP Worker client cancellation verified');
})().catch(error => {console.error(error); process.exitCode = 1;});
