const { contextBridge, ipcRenderer } = require('electron');

if (process.platform === 'win32') {
  contextBridge.exposeInMainWorld('cuberDesktopBluetooth', {
    macForDevice: id => typeof id === 'string' ? ipcRenderer.invoke('bluetooth-mac', id) : Promise.resolve(null),
    confirmMac: (id, mac) => typeof id === 'string' && typeof mac === 'string'
      ? ipcRenderer.invoke('bluetooth-confirm-mac', id, mac) : Promise.resolve(false),
  });
}
