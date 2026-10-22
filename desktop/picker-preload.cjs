const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cubeBluetoothChooser', {
  onDevices: callback => ipcRenderer.on('bluetooth-devices', (_event, devices) => callback(devices)),
  select: id => ipcRenderer.send('bluetooth-select', id),
  cancel: () => ipcRenderer.send('bluetooth-cancel'),
});
