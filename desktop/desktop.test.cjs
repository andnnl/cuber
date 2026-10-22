const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveAsset } = require('./assets.cjs');
const { normalizeDevices } = require('./bluetooth.cjs');
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
