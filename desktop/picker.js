const list = document.getElementById('devices');
document.getElementById('cancel').addEventListener('click', () => window.cubeBluetoothChooser.cancel());
window.cubeBluetoothChooser.onDevices(devices => {
  list.replaceChildren();
  if (!devices.length) {
    list.textContent = '正在扫描附近的设备…';
    return;
  }
  for (const device of devices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = device.name;
    button.addEventListener('click', () => window.cubeBluetoothChooser.select(device.id));
    list.appendChild(button);
  }
});
