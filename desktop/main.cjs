const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const { startAssetServer } = require('./server.cjs');
const { normalizeDevices, matchAddress, AddressSelection } = require('./bluetooth.cjs');
const { NativeScan, scannerPath, supportsNativeScan } = require('./windows-ble.cjs');

// Electron does not expose navigator.bluetooth on Linux without this Chromium feature.
app.commandLine.appendSwitch('enable-features', 'WebBluetooth');
if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow;
let chooser;
let finishChooser;
let assetServer;
let scan;
let selectedAddresses;
let currentDevices = [];
let selectionExpires = 0;

function verifiedFile() { return path.join(app.getPath('userData'), 'verified-ble-macs.json'); }
function saveVerified() {
  try { fs.writeFileSync(verifiedFile(), JSON.stringify(selectedAddresses.verified), { mode: 0o600 }); }
  catch (error) { console.warn('[desktop] 无法保存设备地址:', error.message); }
}

function closeChooser(deviceId = '') {
  const finish = finishChooser;
  finishChooser = null;
  if (deviceId && chooser && !chooser.isDestroyed()) {
    const selected = normalizeDevices(currentDevices).find(device => device.id === deviceId);
    if (!selected) deviceId = '';
    else {
      selectedAddresses.choose(deviceId, matchAddress(selected.name, scan?.records || []));
      selectionExpires = Date.now() + 30000;
    }
  }
  scan?.stop();
  if (!deviceId) { selectedAddresses?.clear(); selectionExpires = 0; }
  if (finish) finish(deviceId);
  const closedWindow = chooser;
  chooser = null;
  if (closedWindow && !closedWindow.isDestroyed()) closedWindow.close();
}

function openChooser(devices, callback) {
  closeChooser();
  currentDevices = devices;
  finishChooser = callback;
  if (supportsNativeScan()) {
    try { scan.start(scannerPath(app)); }
    catch (error) { console.warn('[desktop] 原生蓝牙扫描未启动:', error.message); }
  }
  chooser = new BrowserWindow({
    parent: mainWindow, modal: true, width: 420, height: 440, minWidth: 340, minHeight: 320,
    title: '选择蓝牙魔方', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'picker-preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true,
    },
  });
  chooser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const thisChooser = chooser;
  chooser.on('closed', () => { if (chooser === thisChooser) closeChooser(); });
  chooser.webContents.on('did-finish-load', () => {
    if (chooser && !chooser.isDestroyed()) chooser.webContents.send('bluetooth-devices', normalizeDevices(devices));
  });
  chooser.loadFile(path.join(__dirname, 'picker.html'));
}

ipcMain.on('bluetooth-select', async (event, deviceId) => {
  if (chooser && event.sender === chooser.webContents && typeof deviceId === 'string') {
    const selected = normalizeDevices(currentDevices).find(device => device.id === deviceId);
    const activeChooser = chooser;
    // The native scanner may start after the user clicks quickly; allow one short scan window.
    if (selected && supportsNativeScan() && !scan.records.some(record =>
      record.name === selected.name && record.source === 'manufacturer')) {
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    if (chooser !== activeChooser) return;
    closeChooser(deviceId);
  }
});
ipcMain.on('bluetooth-cancel', event => {
  if (chooser && event.sender === chooser.webContents) closeChooser();
});

function trustedMain(event) {
  return event.sender === mainWindow?.webContents && event.senderFrame === mainWindow?.webContents.mainFrame;
}
ipcMain.handle('bluetooth-mac', (event, id) => {
  if (!trustedMain(event) || typeof id !== 'string' ||
    (Date.now() > selectionExpires && !Object.prototype.hasOwnProperty.call(selectedAddresses?.verified || {}, id))) return null;
  return selectedAddresses?.get(id) || null;
});
ipcMain.handle('bluetooth-confirm-mac', (event, id, mac) => {
  if (!trustedMain(event) || typeof id !== 'string' ||
    (Date.now() > selectionExpires && !Object.prototype.hasOwnProperty.call(selectedAddresses?.verified || {}, id))) return false;
  const confirmed = selectedAddresses?.confirm(id, mac) || false;
  if (confirmed) saveVerified();
  return confirmed;
});

app.whenReady().then(async () => {
  if (!app.hasSingleInstanceLock()) return;
  const assets = app.isPackaged ? path.join(process.resourcesPath, 'www') : path.join(__dirname, '..', 'dist');
  assetServer = await startAssetServer(assets);
  const baseUrl = assetServer.url;
  const origin = new URL(baseUrl).origin;
  try { selectedAddresses = new AddressSelection(JSON.parse(fs.readFileSync(verifiedFile(), 'utf8'))); }
  catch { selectedAddresses = new AddressSelection(); }
  scan = new NativeScan();

  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    ['bluetooth', 'bluetoothScanning'].includes(permission) && requestingOrigin === origin);
  ses.setPermissionRequestHandler((contents, permission, callback) =>
    callback(['bluetooth', 'bluetoothScanning'].includes(permission) && contents === mainWindow?.webContents));

  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 720, minHeight: 520,
    title: '魔方栈', icon: path.join(__dirname, '..', 'resource', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    if (!finishChooser) openChooser(devices, callback);
    else if (chooser && !chooser.isDestroyed()) {
      currentDevices = devices;
      chooser.webContents.send('bluetooth-devices', normalizeDevices(devices));
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  mainWindow.on('closed', () => { closeChooser(); selectedAddresses.clear(); mainWindow = null; });
  mainWindow.loadURL(`${baseUrl}?mode=blecross`);
}).catch(error => {
  console.error('[desktop] 启动失败:', error);
  // A different local service may occupy the fixed port; never show its content.
  require('electron').dialog.showErrorBox('桌面版启动失败', `无法监听本地资源端口 34657：${error.message}`);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (assetServer) assetServer.close().catch(console.error); });
app.on('second-instance', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
