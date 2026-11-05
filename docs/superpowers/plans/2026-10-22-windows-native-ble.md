# Windows 原生蓝牙一选即连实现计划

> **面向 AI 代理的工作者：** 以内联方式逐项执行，先测试失败、再实现、再验证。用户明确要求不使用 worktree。

**目标：** Windows 桌面版在设备列表中点选魔方即可连接，不依赖双扫描名称配对。

**架构：** .NET 辅助程序维护扫描记录、GATT 与通知，Electron 主进程以行分隔 JSON 桥接；既有 NativeBridgeTransport 消费事件并向 GAN 协议传递广播中的加密 MAC。

**技术栈：** .NET 8 WinRT BLE、Electron IPC、TypeScript、Node test。

---

### 任务 1：桥接协议和验证

**文件：** `desktop/windows-native-bridge.cjs`、`desktop/desktop.test.cjs`。

- [x] 在测试中构造假子进程，要求 `scan/connect/write/stopScan/disconnect` 生成预期 JSON 命令，错误和进程退出产生可见事件；运行 `npm run test:desktop` 确认失败。
- [x] 实现受限命令、JSON 行解析、长度限制、启动/退出处理；运行 `npm run test:desktop` 确认通过。

### 任务 2：Windows 原生扫描和 GATT

**文件：** `desktop/windows-ble-scanner/Program.cs`。

- [x] 将一次性扫描改为命令循环；广播记录绑定真实广播地址和制造商加密 MAC，按选择的广播地址连接对应 GATT 设备。
- [x] 发现 GAN 服务、订阅通知并支持写入，向桥输出带连接代际的 `services/notify/disconnected/error`；输入非法命令安全拒绝。
- [x] 本地 .NET 8 交叉编译并验证安装资源；Windows 真机验证仍需用户完成。

### 任务 3：Electron 与界面接线

**文件：** `desktop/main.cjs`、`desktop/preload.cjs`、`src/ble/transport/native.ts`、`src/vue/AppShell/index.html`。

- [x] 先为选择记录中的加密 MAC 与广播地址不同场景增加 TypeScript 回归测试，确认旧实现失败。
- [x] Windows preload 暴露受限 `__bleNative`，主进程校验事件来源并转发；更新传输层从扫描记录取加密 MAC。原 Web 手填 MAC 入口保留。
- [x] 界面连接中禁重复点击、显示扫描/连接错误；运行 `npm run test:ble && npm run test:desktop && npm run build`。

### 任务 4：包与复核

**文件：** `.github/workflows/desktop.yml`、`package.json`（仅在需要时）。

- [x] 校验本地打包仍含 `CuberBleScanner.exe`，核对改动范围及构建输出。
- [ ] Windows 真机测试单独交接：扫描列表、点选连接、转动通知、断开、重连、手填 MAC 兜底。
