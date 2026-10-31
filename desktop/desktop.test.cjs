const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveAsset } = require('./assets.cjs');
const { normalizeDevices, normalizeMac, matchAddress, AddressSelection } = require('./bluetooth.cjs');
const { NativeScan, scannerPath, supportsNativeScan } = require('./windows-ble.cjs');
const { WindowsNativeBridge, validateNativeCommand } = require('./windows-native-bridge.cjs');
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

test('Windows native bridge keeps selected device address and its encryption MAC together', () => {
  const commands = [];
  const events = [];
  const listeners = {};
  const fake = {
    stdout: { on(name, cb) { listeners[`stdout:${name}`] = cb; } },
    stderr: { on() {} },
    stdin: { write(line) { commands.push(JSON.parse(line)); } },
    on(name, cb) { listeners[name] = cb; },
    kill() {},
  };
  const bridge = new WindowsNativeBridge(() => fake, (type, payload) => events.push({ type, payload }));
  bridge.start('scanner.exe');
  bridge.send('scan');
  listeners['stdout:data'](Buffer.from('{"type":"scan","payload":{"address":"10:20:30:40:50:60","name":"GAN 12","mac":"AA:BB:CC:DD:EE:FF"}}\n'));
  assert.deepEqual(events[0], { type: 'scan', payload: {
    address: '10:20:30:40:50:60', name: 'GAN 12', mac: 'AA:BB:CC:DD:EE:FF',
  } });
  bridge.send('connect', { address: '10:20:30:40:50:60', generation: 1 });
  assert.deepEqual(commands, [{ type: 'scan' }, { type: 'connect', address: '10:20:30:40:50:60', generation: 1 }]);
  bridge.stop();
});

test('Windows helper requests only GAN GATT services and reports failed connection stage', () => {
  const source = fs.readFileSync(path.join(__dirname, 'windows-ble-scanner', 'Program.cs'), 'utf8');
  const definitions = fs.readFileSync(path.join(__dirname, '..', 'src', 'ble', 'protocols', 'vendor', 'gan-cube-definitions.ts'), 'utf8');
  for (const name of ['GAN_GEN2_SERVICE', 'GAN_GEN3_SERVICE', 'GAN_GEN4_SERVICE',
    'GAN_GEN2_STATE_CHARACTERISTIC', 'GAN_GEN3_STATE_CHARACTERISTIC', 'GAN_GEN4_STATE_CHARACTERISTIC',
    'GAN_GEN2_COMMAND_CHARACTERISTIC', 'GAN_GEN3_COMMAND_CHARACTERISTIC', 'GAN_GEN4_COMMAND_CHARACTERISTIC']) {
    const uuid = definitions.match(new RegExp(`export const ${name} = "([^"]+)"`))?.[1];
    assert.ok(uuid, `${name} missing`);
    assert.ok(source.includes(uuid), `${name} missing from Windows GATT allowlist`);
  }
  assert.match(source, /GetGattServicesForUuidAsync/);
  assert.doesNotMatch(source, /\.GetGattServicesAsync\(/);
  assert.match(source, /阶段.*HResult|stage.*HResult/i);
});

test('Windows helper scans MoYu/QiYi and allows their GATT characteristics without admitting timer/robot', () => {
  const source = fs.readFileSync(path.join(__dirname, 'windows-ble-scanner', 'Program.cs'), 'utf8');
  for (const uuid of ['0783b03e-7735-b5a0-1760-a305d2795cb0', '0783b03e-7735-b5a0-1760-a305d2795cb1',
    '0783b03e-7735-b5a0-1760-a305d2795cb2', '0000fff0-0000-1000-8000-00805f9b34fb', '0000fff6-0000-1000-8000-00805f9b34fb']) {
    assert.ok(source.includes(uuid), `${uuid} missing`);
  }
  assert.match(source, /WCU_MY3/);
  assert.match(source, /QY-QYSC/);
  assert.match(source, /XMD-TornadoV4-i/);
  assert.match(source, /protocol\.AltCommand/);
});

test('Windows native bridge reports a scanner crash as a visible error', () => {
  const events = [];
  const listeners = {};
  const fake = {
    stdout: { on(name, cb) { listeners[`stdout:${name}`] = cb; } },
    stderr: { on() {} }, stdin: { write() {} },
    on(name, cb) { listeners[name] = cb; }, kill() {},
  };
  const bridge = new WindowsNativeBridge(() => fake, (type, payload) => events.push({ type, payload }));
  bridge.start('scanner.exe');
  listeners.exit(1);
  assert.equal(events.at(-1).type, 'error');
  assert.match(events.at(-1).payload.message, /扫描|蓝牙/);
});

test('Windows helper exit disconnects an active BLE session', () => {
  const events = [];
  const listeners = {};
  const fake = {
    stdout: { on(name, cb) { listeners[`stdout:${name}`] = cb; } },
    stderr: { on() {} }, stdin: { write() {} },
    on(name, cb) { listeners[name] = cb; }, kill() {},
  };
  const bridge = new WindowsNativeBridge(() => fake, (type, payload) => events.push({ type, payload }));
  bridge.start('scanner.exe');
  bridge.send('connect', { address: '10:20:30:40:50:60', generation: 2 });
  listeners['stdout:data'](Buffer.from('{"type":"services","payload":{"generation":2,"services":[]}}\n'));
  listeners.exit(1);
  assert.deepEqual(events.at(-1), { type: 'disconnected', payload: { generation: 2 } });
});

test('scanner crash after disconnect is not hidden by a stale connection generation', () => {
  const events = [];
  const listeners = {};
  const fake = { stdout: { on() {} }, stderr: { on() {} }, stdin: { write() {} },
    on(name, cb) { listeners[name] = cb; }, kill() {} };
  const bridge = new WindowsNativeBridge(() => fake, (type, payload) => events.push({ type, payload }));
  bridge.start('scanner.exe');
  bridge.send('connect', { address: '10:20:30:40:50:60', generation: 2 });
  bridge.send('disconnect');
  listeners.exit(1);
  assert.equal(events.at(-1).type, 'error');
  assert.equal(Object.prototype.hasOwnProperty.call(events.at(-1).payload, 'generation'), false);
});

test('Windows native bridge rejects arbitrary renderer commands and malformed addresses', () => {
  assert.equal(validateNativeCommand('shell', []), null);
  assert.equal(validateNativeCommand('connect', ['wrong', 1]), null);
  assert.equal(validateNativeCommand('write', ['../../secret', 'AA==']), null);
  assert.deepEqual(validateNativeCommand('connect', ['10:20:30:40:50:60', 3]),
    { type: 'connect', address: '10:20:30:40:50:60', generation: 3 });
  assert.deepEqual(validateNativeCommand('write', ['6e400002-b5a3-f393-e0a9-e50e24dc4179', 'AA==']),
    { type: 'write', charUuid: '6e400002-b5a3-f393-e0a9-e50e24dc4179', base64: 'AA==' });
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
