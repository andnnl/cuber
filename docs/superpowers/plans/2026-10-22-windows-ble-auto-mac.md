# Windows 蓝牙魔方首次连接免填 MAC 实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:executing-plans 在当前工作区内联逐任务实施；不创建 worktree，不调度子代理。

**目标：** Windows 桌面版选择 GAN／MG 设备后自动可靠地获取解密所需 MAC，失败时能明确手动输入。

**架构：** Windows 辅助程序扫描广播并逐行输出 JSON；Electron 主进程按当前选择轮次、设备名及唯一地址做保守匹配；隔离 preload 暴露一次性查询给 Web Bluetooth 传输层。已有 GATT 路径保持不变。候选 MAC 只在协议帧成功解密解析后保存到同一设备 ID 的缓存。

**技术栈：** C# .NET 8 Windows Runtime、Electron IPC、TypeScript、Node assert、GitHub Actions。

---

## 文件职责

- `desktop/windows-ble-scanner/`: WinRT 广播接收、厂商 MAC 提取、有限生命周期的控制台程序。
- `desktop/bluetooth.cjs` / `desktop/windows-ble.cjs`: 地址校验、唯一性匹配、子进程生命周期和有界解析。
- `desktop/main.cjs` / `desktop/preload.cjs`: 选择轮次绑定、最小权限 IPC 与候选地址查询。
- `src/ble/transport/web.ts` / `src/ble/protocols/gan.ts`: 地址优先级和只在协议事件验证后确认缓存。
- `desktop/desktop.test.cjs` / `scripts/test-ble.js`: 选择、取消、冲突、缓存隔离和网页兼容性回归。
- `package.json` / `.github/workflows/desktop.yml`: Windows 编译和严格打包辅助程序，Linux 不依赖 .NET。

### 任务 1：唯一匹配和缓存契约

- [x] 先在 `desktop/desktop.test.cjs` 写断言：同名唯一可匹配，两个不同地址拒绝，非法地址忽略，设备 ID 不共享缓存；运行 `npm run test:desktop` 见红。
- [x] 在 `desktop/bluetooth.cjs` 实现 `normalizeMac`、`matchAddress` 和 ID 定向候选存储；运行 `npm run test:desktop` 见绿。

### 任务 2：Windows 原生扫描

- [x] 在 `desktop/desktop.test.cjs` 写假子进程测试：异常 JSON、超长输出、取消停止；运行见红。超时由生产代码的 16 秒定时器停止，未做实时时钟单测。
- [x] 在 `desktop/windows-ble.cjs` 实现有界 JSONL 接收与 stop，Windows 下启动已打包可执行文件，非 Windows 不启动；运行见绿。
- [x] 在 `desktop/windows-ble-scanner/` 实现 `BluetoothLEAdvertisementWatcher`，用 GAN CIC 的厂商数据前九字节末六字节倒序取得 MAC，缺失时用广播地址；名称为空不输出、固定扫描期限。Windows CI 设置 `dotnet publish` 并检查产物；本机无 dotnet，实际 Windows 构建尚待 CI 验证。

### 任务 3：选择框／网页传输及协议验证

- [x] 先扩展桌面/蓝牙单测：当前选择可查询，手填优先，未知设备不能读缓存，未经有效协议事件不写自动重连缓存；运行测试见红。
- [x] 主进程绑定扫描和选择窗口生命周期；preload 只开放主窗口查询和验证确认；网页传输依次选择手填、已验证同 ID、唯一原生候选、`watchAdvertisements`；协议成功解析事件时确认候选；运行 `npm run test:desktop && npm run test:ble` 见绿。

### 任务 4：打包和全量验证

- [x] CI Windows 在打包前 `dotnet publish`，electron-builder 只在 Windows 平台额外带入 exe，构建前检查缺失即失败；Linux 不依赖 .NET。Windows 实际打包待 Windows CI。
- [x] 执行 `npm run test:desktop`、`npm run test:ble`、`npm run build`，检查 Windows CI 声明及 `git diff --check`；Linux AppImage 打包在 Electron 阶段长时间无进展已停止，Windows 实体机验收待完成。

## 规格核对

连接路径不改 GATT；手填始终优先；同名冲突不猜；广播候选仅限单次；确认缓存按 ID 隔离且在有效协议事件后保存；取消和超时停止扫描；Windows 二进制随包而 Linux 不强依赖。无实机前不声称实体连接已验证。
