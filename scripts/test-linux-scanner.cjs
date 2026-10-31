const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const scanner = path.join(__dirname, '..', 'desktop', 'linux-ble-scanner', 'publish', 'CuberBleScanner');
const result = JSON.parse(execFileSync(scanner, ['--self-test'], { encoding: 'utf8', timeout: 3000 }));
assert.equal(result.manufacturerMac, '09:08:07:06:05:04');
assert.equal(result.shortDataMac, 'AA:BB:CC:DD:EE:FF');
assert.equal(result.otherVendorMac, 'AA:BB:CC:DD:EE:FF');
assert.equal(result.emptyNameIgnored, true);
assert.equal(result.cachedDeviceIgnored, true);
assert.equal(result.liveAdvertisementAccepted, true);
assert.equal(result.unrelatedDeviceIgnored, true);
assert.equal(result.moyuAccepted, true);
assert.equal(result.qiyiAccepted, true);
assert.equal(result.timerIgnored, true);
console.log('✓ Linux BlueZ scanner manufacturer MAC and fallback');
