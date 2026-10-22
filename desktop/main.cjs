const path = require('node:path');
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const { startAssetServer } = require('./server.cjs');
const { normalizeDevices } = require('./bluetooth.cjs');

// Electron does not expose navigator.bluetooth on Linux without this Chromium feature.
app.commandLine.appendSwitch('enable-features', 'WebBluetooth');
if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow;
let chooser;
let finishChooser;
let assetServer;

function closeChooser(deviceId = '') {
  const finish = finishChooser;
  finishChooser = null;
  if (finish) finish(deviceId);
  if (chooser && !chooser.isDestroyed()) chooser.close();
  chooser = null;
}

function openChooser(devices, callback) {
  closeChooser();
  finishChooser = callback;
  chooser = new BrowserWindow({
    parent: mainWindow, modal: true, width: 420, height: 440, minWidth: 340, minHeight: 320,
    title: '选择蓝牙魔方', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'picker-preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true,
    },
  });
  chooser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  chooser.on('closed', () => closeChooser());
  chooser.webContents.on('did-finish-load', () => {
    if (chooser && !chooser.isDestroyed()) chooser.webContents.send('bluetooth-devices', normalizeDevices(devices));
  });
  chooser.loadFile(path.join(__dirname, 'picker.html'));
}

ipcMain.on('bluetooth-select', (event, deviceId) => {
  if (chooser && event.sender === chooser.webContents && typeof deviceId === 'string') {
    closeChooser(deviceId);
  }
});
ipcMain.on('bluetooth-cancel', event => {
  if (chooser && event.sender === chooser.webContents) closeChooser();
});

app.whenReady().then(async () => {
  if (!app.hasSingleInstanceLock()) return;
  const assets = app.isPackaged ? path.join(process.resourcesPath, 'www') : path.join(__dirname, '..', 'dist');
  assetServer = await startAssetServer(assets);
  const baseUrl = assetServer.url;
  const origin = new URL(baseUrl).origin;

  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    ['bluetooth', 'bluetoothScanning'].includes(permission) && requestingOrigin === origin);
  ses.setPermissionRequestHandler((contents, permission, callback) =>
    callback(['bluetooth', 'bluetoothScanning'].includes(permission) && contents === mainWindow?.webContents));

  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 720, minHeight: 520,
    title: '魔方栈', icon: path.join(__dirname, '..', 'resource', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    if (!finishChooser) openChooser(devices, callback);
    else if (chooser && !chooser.isDestroyed()) {
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
  mainWindow.on('closed', () => { closeChooser(); mainWindow = null; });
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
