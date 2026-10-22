# Linux 蓝牙 MAC 自动识别实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:executing-plans，在当前工作区内联逐项实施；用户明确要求不用 worktree。

**目标：** Linux AppImage 首次连接魔方时尝试自动识别 MAC，失败时保留手填。

**架构：** GIO/BlueZ 辅助程序以 JSONL 输出设备名称及 MAC；Electron 复用 Windows `NativeScan` 与当前设备 ID 的安全匹配及验证缓存。

**技术栈：** C + GIO、Electron、Node.js、electron-builder、Ubuntu CI。

---

## 文件职责

- `desktop/linux-ble-scanner/scanner.c`：BlueZ 扫描、厂商地址解析、JSONL 输出及有界退出。
- `desktop/windows-ble.cjs`：共享扫描器子进程和平台可执行文件路径。
- `desktop/main.cjs`、`desktop/preload.cjs`、`desktop/picker.html`：Linux 启动扫描、候选查询与提示。
- `desktop/desktop.test.cjs`、`scripts/test-linux-scanner.cjs`：平台路径与扫描器规则回归。
- `package.json`、`.github/workflows/desktop.yml`、`desktop/README.md`：Linux 严格编译、打包、检查及使用说明。

### 任务 1：桌面契约

- [x] 在 `desktop/desktop.test.cjs` 增加 Linux 开发/打包路径、平台启用断言；运行 `npm run test:desktop`，确认缺失功能失败。
- [x] 扩展扫描器路径和平台判断；Linux 也启动扫描、延迟一次候选收集，preload 暴露相同受限 IPC；测试通过。

### 任务 2：BlueZ 原生辅助程序

- [x] 写 `scripts/test-linux-scanner.cjs` 调用 `--self-test` 检查九字节 GAN 厂商地址逆序、非法短载荷回退、拒绝空名称；运行确认缺失程序失败。
- [x] 用 GIO 获取 BlueZ 托管对象并监听新增/本轮广播属性变化，忽略初始历史设备；开始及停止发现，限时退出，按 JSONL 契约输出。执行 `npm run test:linux-scanner` 验证通过。

### 任务 3：构建、打包与回归

- [x] Linux 打包前执行 `pkg-config --cflags --libs gio-2.0 gio-unix-2.0` 编译，缺产物阻止打包；electron-builder 仅 Linux 额外带入该可执行文件。Ubuntu CI 验证包内文件。
- [x] 文档说明 Linux 受 BlueZ、权限和设备广播影响，含手填兜底。运行 `npm run test:desktop`、`npm run test:linux-scanner`、`npm run test:ble`、`npm run build` 和包内容检查；注明没有实体魔方的局限。

## 规格核对

不改 GATT；优先厂商稳定 MAC；同名冲突不猜；扫描结束可回收；手填可用；Windows 不受 Linux 原生依赖影响。

本地 `npm run desktop:linux` 的 Electron 下载阶段因网络缓慢改用已有缓存 zip 运行 `electron-builder --linux AppImage --config.electronDist=...`；构建退出码为 0。从 AppImage 提取的 `resources/linux-ble-scanner/CuberBleScanner` 可执行并通过自检。审查后补测并修复跨轮次迟到事件、记录上限覆盖厂商升级、BlueZ 历史设备误匹配；最终 AppImage SHA-256 为 `1c0954a8343b6e4ea515829db056ef68dc8f85f075388cf8efb4709a0653e727`。实体蓝牙魔方连接尚未验证，Ubuntu CI 亦待触发。
