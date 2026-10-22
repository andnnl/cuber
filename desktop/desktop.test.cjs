const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveAsset } = require('./assets.cjs');
const { normalizeDevices, normalizeMac, matchAddress, AddressSelection } = require('./bluetooth.cjs');
const { NativeScan, scannerPath, supportsNativeScan } = require('./windows-ble.cjs');
const { startAssetServer } = require('./server.cjs');
function test(name, fn) { fn(); console.log(`✓ ${name}`); }

const root = path.resolve('application', 'dist');

test('localhost serves the bundled index and worker assets', () => {
  assert.equal(resolveAsset(root, 'http://127.0.0.1:34657/'), path.join(root, 'index.html'));
  assert.equal(resolveAsset(root, 'http://127.0.0.1:34657/cube_cross_worker.js?v=1'), path.join(root, 'cube_cross_worker.js'));
  assert.equal(resolveAsset(root, 'http://127.0.0.1:34657/cube_cross_solve_bg.wasm'), path.join(root, 'cube_cross_solve_bg.wasm'));
});

test('localhost cannot access other hosts or traverse out of dist', () => {
  assert.equal(resolveAsset(root, 'http://localhost:34657/index.html'), null);
  assert.equal(resolveAsset(root, 'http://127.0.0.1:34657/%2e%2e/secrets'), null);
  assert.equal(resolveAsset(root, 'http://127.0.0.1:34657/%2fetc/passwd'), null);
  assert.equal(resolveAsset(root, 'https://app/index.html'), null);
});

test('bluetooth chooser only exposes unique named devices with their original ids', () => {
  assert.deepEqual(normalizeDevices([
    { deviceId: 'a', deviceName: 'GAN 12' },
    { deviceId: 'a', deviceName: 'GAN 12' },
    { deviceId: 'b', deviceName: 'MG Cube' },
    { deviceId: '', deviceName: 'invalid' },
  ]), [{ id: 'a', name: 'GAN 12' }, { id: 'b', name: 'MG Cube' }]);
});

test('native advertisement matches only a unique, exact named address', () => {
  assert.equal(normalizeMac('aabbccddeeff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMac('AA:BB:CC:DD:EE:FG'), null);
  assert.equal(matchAddress('GAN 12', [{ name: 'GAN 12', mac: 'aabbccddeeff' }]), 'AA:BB:CC:DD:EE:FF');
  assert.equal(matchAddress('GAN 12', [{ name: 'GAN 12', mac: 'aabbccddeeff' },
    { name: 'GAN 12', mac: '001122334455' }]), null);
  assert.equal(matchAddress('GAN 12', [{ name: 'GAN 13', mac: 'aabbccddeeff' }]), null);
  assert.equal(matchAddress('GAN 12', [{ name: 'GAN 12', mac: 'not-an-address' }]), null);
});

test('selection cannot expose another device or stale candidate', () => {
  const selection = new AddressSelection();
  selection.choose('first', 'AA:BB:CC:DD:EE:FF');
  assert.equal(selection.get('second'), null);
  assert.equal(selection.get('first'), 'AA:BB:CC:DD:EE:FF');
  selection.choose('second', null);
  assert.equal(selection.get('first'), null);
  selection.clear();
  assert.equal(selection.get('second'), null);
});

test('verified MAC cache requires current selection and valid confirmed candidate', () => {
  const selection = new AddressSelection({ first: 'AA:BB:CC:DD:EE:FF' });
  selection.choose('second', '00:11:22:33:44:55');
  assert.equal(selection.get('first'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(selection.confirm('first', '00:11:22:33:44:55'), false);
  assert.equal(selection.confirm('second', 'bad'), false);
  assert.equal(selection.confirm('second', '00:11:22:33:44:55'), true);
  selection.clear();
  assert.equal(selection.get('second'), '00:11:22:33:44:55');
});

test('scanner bounds records and stops its process on cancel', () => {
  let killed = 0;
  const fake = { stdout: { on(_event, callback) { this.feed = callback; } },
    on() {}, kill() { killed++; } };
  const scan = new NativeScan(() => fake);
  scan.start('scanner.exe');
  fake.stdout.feed(Buffer.from('{"name":"GAN 12","mac":"AABBCCDDEEFF"}\n{"name":"GAN 12","mac":"bad"}\n'));
  assert.equal(matchAddress('GAN 12', scan.records), 'AA:BB:CC:DD:EE:FF');
  fake.stdout.feed(Buffer.from('x'.repeat(9000)));
  assert.equal(scan.records.length, 1);
  scan.stop();
  scan.start('scanner.exe');
  fake.stdout.feed(Buffer.from('{"name":"GAN 12","mac":"001122334455","address":"AABBCCDDEEFF","source":"radio"}\n'));
  fake.stdout.feed(Buffer.from('{"name":"GAN 12","mac":"102030405060","address":"AABBCCDDEEFF","source":"manufacturer"}\n'));
  assert.equal(matchAddress('GAN 12', scan.records), '10:20:30:40:50:60');
  scan.stop();
  assert.equal(killed, 2);
});

test('late events from a stopped scan cannot affect a new scan', () => {
  const children = [];
  const scan = new NativeScan(() => {
    const listeners = {};
    const child = {
      stdout: { on(name, fn) { listeners[name] = fn; } },
      on(name, fn) { listeners[name] = fn; },
      kill() { child.killed = true; },
      emit(name, value) { listeners[name]?.(value); },
      feed(value) { listeners.data?.(Buffer.from(value)); },
    };
    children.push(child);
    return child;
  });
  scan.start('scanner');
  scan.stop();
  scan.start('scanner');
  children[0].feed('{"name":"GAN 12","mac":"AABBCCDDEEFF"}\n');
  children[0].emit('error', new Error('late failure'));
  assert.equal(scan.records.length, 0);
  assert.equal(children[1].killed, undefined);
  children[1].feed('{"name":"GAN 12","mac":"001122334455"}\n');
  assert.equal(matchAddress('GAN 12', scan.records), '00:11:22:33:44:55');
  scan.stop();
});

test('manufacturer data may upgrade an existing record at the scan limit', () => {
  let feed;
  const scan = new NativeScan(() => ({ stdout: { on(_name, fn) { feed = fn; } }, on() {}, kill() {} }));
  scan.start('scanner');
  feed(Buffer.from('{"name":"GAN 12","mac":"AABBCCDDEEFF","address":"AABBCCDDEEFF","source":"radio"}\n'));
  for (let i = 1; i < 128; i++) {
    const mac = i.toString(16).padStart(12, '0');
    feed(Buffer.from(JSON.stringify({ name: `Other ${i}`, mac }) + '\n'));
  }
  feed(Buffer.from('{"name":"GAN 12","mac":"102030405060","address":"AABBCCDDEEFF","source":"manufacturer"}\n'));
  assert.equal(scan.records.length, 128);
  assert.equal(matchAddress('GAN 12', scan.records), '10:20:30:40:50:60');
  scan.stop();
});

test('Linux scanner uses packaged executable while Windows keeps existing path', () => {
  const resources = path.join(__dirname, 'test-resources');
  assert.equal(scannerPath({ isPackaged: true }, 'linux', resources), path.join(resources, 'linux-ble-scanner', 'CuberBleScanner'));
  assert.equal(scannerPath({ isPackaged: false }, 'linux'), path.join(__dirname, 'linux-ble-scanner', 'publish', 'CuberBleScanner'));
  assert.equal(scannerPath({ isPackaged: true }, 'win32', resources), path.join(resources, 'windows-ble-scanner', 'CuberBleScanner.exe'));
  assert.equal(supportsNativeScan('linux'), true);
  assert.equal(supportsNativeScan('win32'), true);
  assert.equal(supportsNativeScan('darwin'), false);
});

(async () => {
  const server = await startAssetServer(path.join(__dirname, '..', 'dist'), 0);
  try {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const [html, wasm, blocked] = await Promise.all([
      fetch(server.url), fetch(`${server.url}cube_cross_solve_bg.wasm`),
      fetch(`${server.url}%2e%2e/package.json`),
    ]);
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type'), /text\/html/);
    assert.equal(wasm.status, 200);
    assert.match(wasm.headers.get('content-type'), /application\/wasm/);
    assert.equal(blocked.status, 404);
    console.log('✓ localhost serves offline modules and blocks traversal');
  } finally {
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
