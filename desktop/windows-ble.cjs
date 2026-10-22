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
    const child = this.launch(executable);
    this.child = child;
    child.stdout.on('data', chunk => {
      if (this.child !== child) return;
      this.remainder += chunk.toString('utf8');
      if (this.remainder.length > 8192) { this.remainder = ''; return; }
      const lines = this.remainder.split('\n');
      this.remainder = lines.pop();
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          const mac = normalizeMac(record.mac);
          if (typeof record.name === 'string' && record.name.length > 0 && record.name.length < 100 && mac) {
            const address = normalizeMac(record.address);
            const existing = address ? this.records.findIndex(other => other.address === address && other.name === record.name) : -1;
            if (existing >= 0) {
              if (record.source === 'manufacturer') this.records[existing] = { name: record.name, mac, address, source: record.source };
            } else if (this.records.length < 128 && !this.records.some(other => other.name === record.name && other.mac === mac)) {
              this.records.push({ name: record.name, mac, address, source: record.source });
            }
          }
        } catch { /* Ignore malformed scanner output. */ }
      }
    });
    child.on('error', () => { if (this.child === child) this.stop(); });
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

function supportsNativeScan(platform = process.platform) { return platform === 'win32' || platform === 'linux'; }

function scannerPath(app, platform = process.platform, resources = process.resourcesPath) {
  const directory = platform === 'linux' ? 'linux-ble-scanner' : 'windows-ble-scanner';
  const executable = platform === 'linux' ? 'CuberBleScanner' : 'CuberBleScanner.exe';
  return app.isPackaged ? path.join(resources, directory, executable)
    : path.join(__dirname, directory, 'publish', executable);
}

module.exports = { NativeScan, scannerPath, supportsNativeScan };
