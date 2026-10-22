const { spawn } = require('node:child_process');
const path = require('node:path');
const { normalizeMac } = require('./bluetooth.cjs');

class NativeScan {
  constructor(launch = executable => spawn(executable, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })) {
    this.launch = launch;
    this.records = [];
    this.child = null;
    this.remainder = '';
    this.timer = null;
  }

  start(executable) {
    this.stop();
    this.records = [];
    this.remainder = '';
    this.child = this.launch(executable);
    this.child.stdout.on('data', chunk => {
      this.remainder += chunk.toString('utf8');
      if (this.remainder.length > 8192) { this.remainder = ''; return; }
      const lines = this.remainder.split('\n');
      this.remainder = lines.pop();
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          const mac = normalizeMac(record.mac);
          if (typeof record.name === 'string' && record.name.length > 0 && record.name.length < 100 && mac && this.records.length < 128) {
            const address = normalizeMac(record.address);
            const existing = address ? this.records.findIndex(other => other.address === address && other.name === record.name) : -1;
            if (existing >= 0) {
              if (record.source === 'manufacturer') this.records[existing] = { name: record.name, mac, address, source: record.source };
            } else if (!this.records.some(other => other.name === record.name && other.mac === mac)) {
              this.records.push({ name: record.name, mac, address, source: record.source });
            }
          }
        } catch { /* Ignore malformed scanner output. */ }
      }
    });
    this.child.on('error', () => this.stop());
    this.timer = setTimeout(() => this.stop(), 16000);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.child) this.child.kill();
    this.child = null;
    this.remainder = '';
  }
}

function scannerPath(app) {
  return app.isPackaged ? path.join(process.resourcesPath, 'windows-ble-scanner', 'CuberBleScanner.exe')
    : path.join(__dirname, 'windows-ble-scanner', 'publish', 'CuberBleScanner.exe');
}

module.exports = { NativeScan, scannerPath };
