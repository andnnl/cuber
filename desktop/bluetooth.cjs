function normalizeDevices(devices) {
  const seen = new Set();
  return devices.filter(device => {
    if (!device.deviceId || seen.has(device.deviceId)) return false;
    seen.add(device.deviceId);
    return true;
  }).map(device => ({ id: device.deviceId, name: device.deviceName || '未命名设备' }));
}

module.exports = { normalizeDevices };
