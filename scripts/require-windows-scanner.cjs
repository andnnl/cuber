const fs = require('node:fs');
const path = require('node:path');

const binary = path.join(__dirname, '..', 'desktop', 'windows-ble-scanner', 'publish', 'CuberBleScanner.exe');
if (!fs.existsSync(binary)) {
  console.error(`Windows 包缺少蓝牙扫描辅助程序: ${binary}\n先在 Windows 运行 dotnet publish desktop/windows-ble-scanner/CuberBleScanner.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o desktop/windows-ble-scanner/publish`);
  process.exitCode = 1;
}
