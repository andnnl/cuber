const { contextBridge, ipcRenderer } = require('electron');

if (process.platform === 'win32' || process.platform === 'linux') {
  contextBridge.exposeInMainWorld('cuberDesktopBluetooth', {
    macForDevice: id => typeof id === 'string' ? ipcRenderer.invoke('bluetooth-mac', id) : Promise.resolve(null),
    confirmMac: (id, mac) => typeof id === 'string' && typeof mac === 'string'
      ? ipcRenderer.invoke('bluetooth-confirm-mac', id, mac) : Promise.resolve(false),
  });
}

if (process.platform === 'win32') {
  let onNativeEvent = null;
  ipcRenderer.on('native-ble-event', (_event, type, payload) => onNativeEvent?.(type, payload));
  const send = (type, ...args) => ipcRenderer.send('native-ble-command', type, ...args);
  contextBridge.exposeInMainWorld('__bleNative', {
    scan: () => send('scan'),
    stopScan: () => send('stopScan'),
    connect: (address, generation) => send('connect', address, generation),
    disconnect: () => send('disconnect'),
    write: (charUuid, base64) => send('write', charUuid, base64),
    onEvent: callback => { if (typeof callback === 'function') onNativeEvent = callback; },
  });
}
