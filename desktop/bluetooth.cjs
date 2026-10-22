function normalizeDevices(devices) {
  const seen = new Set();
  return devices.filter(device => {
    if (!device.deviceId || seen.has(device.deviceId)) return false;
    seen.add(device.deviceId);
    return true;
  }).map(device => ({ id: device.deviceId, name: device.deviceName || '未命名设备' }));
}

function normalizeMac(value) {
  if (typeof value !== 'string' || !/^(?:[a-f\d]{12}|[a-f\d]{2}(?:[:-][a-f\d]{2}){5})$/i.test(value)) return null;
  return value.replace(/[:-]/g, '').toUpperCase().match(/../g).join(':');
}

function matchAddress(name, advertisements) {
  if (!name || name === '未命名设备') return null;
  const addresses = new Set(advertisements.filter(record => record.name === name)
    .map(record => normalizeMac(record.mac)).filter(Boolean));
  return addresses.size === 1 ? [...addresses][0] : null;
}

class AddressSelection {
  constructor(verified = {}) {
    this.verified = Object.fromEntries(Object.entries(verified).filter(([id, mac]) => id && normalizeMac(mac))
      .map(([id, mac]) => [id, normalizeMac(mac)]));
    this.clear();
  }
  choose(id, mac) {
    this.id = id;
    this.mac = normalizeMac(mac);
  }
  get(id) { return id ? (Object.prototype.hasOwnProperty.call(this.verified, id) ? this.verified[id] :
    (id === this.id ? this.mac : null)) : null; }
  confirm(id, mac) {
    const normalized = normalizeMac(mac);
    if (!normalized || !id || (id !== this.id && this.get(id) !== normalized)) return false;
    this.verified[id] = normalized;
    return true;
  }
  clear() { this.id = null; this.mac = null; }
}

module.exports = { normalizeDevices, normalizeMac, matchAddress, AddressSelection };
