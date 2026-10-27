const { spawn } = require('node:child_process');

const COMMANDS = new Set(['scan', 'stopScan', 'connect', 'disconnect', 'write']);
const EVENTS = new Set(['scan', 'services', 'notify', 'disconnected', 'error']);

function validateNativeCommand(type, args) {
  if (!COMMANDS.has(type) || !Array.isArray(args)) return null;
  if (type === 'scan' || type === 'stopScan' || type === 'disconnect') return args.length === 0 ? { type } : null;
  if (type === 'connect') {
    const [address, generation] = args;
    if (args.length !== 2 || typeof address !== 'string' || !/^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i.test(address) ||
      !Number.isSafeInteger(generation) || generation < 1) return null;
    return { type, address, generation };
  }
  const [charUuid, base64] = args;
  if (args.length !== 2 || typeof charUuid !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(charUuid) ||
    typeof base64 !== 'string' || base64.length > 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) return null;
  return { type, charUuid, base64 };
}

class WindowsNativeBridge {
  constructor(launch = executable => spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
    onEvent = () => {}) {
    this.launch = launch;
    this.onEvent = onEvent;
    this.child = null;
    this.executable = '';
    this.remainder = '';
    this.generation = 0;
    this.connected = false;
    this.pending = false;
    this.stopping = false;
  }

  start(executable) {
    this.executable = executable;
    if (this.child) return;
    const child = this.launch(executable);
    this.child = child;
    this.stopping = false;
    this.remainder = '';
    child.stdout.on('data', chunk => {
      if (this.child !== child) return;
      this.remainder += chunk.toString('utf8');
      if (this.remainder.length > 65536) {
        this.remainder = '';
        this.onEvent('error', { message: '蓝牙扫描数据过长，已丢弃' });
        return;
      }
      const lines = this.remainder.split('\n');
      this.remainder = lines.pop();
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (EVENTS.has(event.type) && event.payload && typeof event.payload === 'object') {
            if (event.type === 'services') { this.connected = true; this.pending = false; }
            if (event.type === 'disconnected') { this.connected = false; this.pending = false; }
            if (event.type === 'error' && event.payload.generation !== undefined) this.pending = false;
            this.onEvent(event.type, event.payload);
          }
        } catch { /* Invalid helper output never reaches the renderer. */ }
      }
    });
    child.stderr.on('data', chunk => console.warn('[desktop] Windows BLE:', chunk.toString('utf8').slice(0, 1000)));
    child.stdin.on?.('error', error => {
      if (this.child === child) this.onEvent('error', { message: `Windows 蓝牙命令通道失败：${error.message}`, generation: this.generation });
    });
    child.on('error', error => {
      if (this.child !== child) return;
      this.child = null;
      this.reportStopped(`Windows 蓝牙程序无法启动：${error.message}`);
    });
    child.on('exit', code => {
      if (this.child !== child) return;
      this.child = null;
      if (!this.stopping) this.reportStopped(`Windows 蓝牙扫描程序退出 (${code})，请重新扫描`);
    });
  }

  reportStopped(message) {
    if (this.connected) {
      this.connected = false;
      this.onEvent('disconnected', { generation: this.generation });
    } else this.onEvent('error', this.pending ? { message, generation: this.generation } : { message });
    this.pending = false;
  }

  send(type, fields = {}) {
    if (!COMMANDS.has(type)) return false;
    if (!this.child && this.executable) this.start(this.executable);
    if (!this.child || this.child.stdin?.writable === false) {
      this.onEvent('error', { message: 'Windows 蓝牙程序未运行，请重新扫描', generation: this.generation });
      return false;
    }
    if (type === 'connect') { this.generation = fields.generation; this.pending = true; }
    if (type === 'disconnect') { this.connected = false; this.pending = false; }
    try {
      this.child.stdin.write(JSON.stringify({ type, ...fields }) + '\n');
      return true;
    } catch (error) {
      this.onEvent('error', { message: `Windows 蓝牙命令发送失败：${error.message}`, generation: this.generation });
      return false;
    }
  }

  stop() {
    this.stopping = true;
    const child = this.child;
    this.child = null;
    child?.kill();
  }
}

module.exports = { WindowsNativeBridge, validateNativeCommand };
