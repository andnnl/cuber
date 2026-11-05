# MoYu32 与 QYSC/Tornado V4 跨平台蓝牙接入计划

> **面向 AI 代理的工作者：** 在当前工作区内联执行；逐项用测试先复现缺口再实现。用户明确禁止 worktree。

**目标：** GAN 保持可用，新增 MoYu32 和 QYSC/Tornado V4 的扫描、连接、状态及转动，覆盖 Android、浏览器、Windows 和 Linux。计时器、机器人不在本次范围。

**架构：** 传输层负责设备发现、GATT 特征订阅、写入和地址；协议驱动负责设备专属握手、解密、状态及历史转动，统一输出 `LinkEvent`。按设备名和特征组合选择协议，不能只凭共享 `fff0` 服务判定。原生桥仍保持一次一个智能魔方的会话。

**技术栈：** TypeScript、Vue 2、aes-js、Android Java、Windows .NET BLE、Linux BlueZ/GDBus；`npm run test:ble`、`npm run test:android`、`npm run test:desktop`、`npm run test:linux-scanner`、`npm run build`。

---

### 任务 1：协议和传输边界

**文件：** `src/ble/types.ts`、`src/ble/protocols/registry.ts`、`src/ble/cube-link.ts`、`src/ble/transport/web.ts`、`src/ble/transport/native.ts`、`scripts/test-ble.js`。

- [ ] 测试：MoYu 服务 `0783b03e-7735-b5a0-1760-a305d2795cb0` 选择 MoYu；名字 `QY-QYSC` 或 `XMD-TornadoV4-i` 且有 `fff6` 通知特征时选 QiYi；GAN v4 服务不能误判为 QiYi。
- [ ] 跑 `npm run test:ble`，确认新测试因协议未注册而失败。
- [ ] 引入协议实例接口（`connect/onEvent/onDisconnect/disconnect/requestFacelets/requestBattery`），连接器从 `DeviceInfo` 选择实例；GATT 传输提供读通知、写特征及平台地址，错误信息按品牌显示。
- [ ] 跑 `npm run test:ble`，确认 GAN 和协议选择测试通过。

### 任务 2：MoYu32 协议

**文件：** `src/ble/protocols/moyu32.ts`、`scripts/test-moyu-qiyi.cjs`、`tsconfig.ble.json`。

- [ ] 测试：给定 MAC 和 20 字节帧能解密并读取 `A3` 的 54 格状态；`A5` 连续和回绕计数生成按时间顺序的转动；非法状态不污染账本。
- [ ] 跑新增测试确认缺口；实现设备请求队列 `A1/A3/A4`、MAC 派生 AES、状态/电量/转动解析及掉帧重同步。
- [ ] 运行新增测试和 `npm run test:ble`。

### 任务 3：QiYi 协议

**文件：** `src/ble/protocols/qiyi.ts`、`scripts/test-moyu-qiyi.cjs`。

- [ ] 测试：hello MAC 反序、CRC16、AES 和 `FE` 状态帧，`03` 的历史去重、未来步处理、状态回校；错误 MAC/帧明确失败。
- [ ] 跑新增测试确认缺口；实现握手和 ACK、状态及历史步转换、串行写入、超时与重试。
- [ ] 运行新增测试和 `npm run test:ble`。

### 任务 4：四平台扫描与 GATT

**文件：** `src/ble/transport/web.ts`、`src/ble/transport/native.ts`、`android/app/src/main/java/com/cuber/trainer/BleBridge.java`、`desktop/windows-ble-scanner/Program.cs`、`desktop/linux-ble-scanner/scanner.c`、相应测试。

- [ ] 测试：四个平台的候选过滤允许 MoYu/QiYi，排除 QiYi Smart Timer 与 GAN Robot；正确服务和通知/写特征被选中，GAN 原路径不回退。
- [ ] 跑平台测试确认缺口；实现广播识别、GATT 分型、写入通道选择、必要的 MTU/通知支持。只有 GAN 使用 GAN manufacturer MAC 解析与确认机制。
- [ ] 跑 `npm run test:android`、`npm run test:desktop`、`npm run test:linux-scanner`。

### 任务 5：连接界面与验收

**文件：** `src/vue/Setting/index.ts`、连接界面相关模板、`scripts/test-ble.js`、浏览器验证脚本。

- [ ] 测试：设备列表显示品牌，连接后页面共享同一状态；刷新/切页、断开和重连不复用旧通知；手动 MAC 只在必需时提示。
- [ ] 更新文案及连接记录；运行 `npm run test:ble`、`npm run build`、`git diff --check`。
- [ ] 真机矩阵：各品牌在 Android、Chrome/Edge、Windows、Linux 验证首帧、连续转动、快速连转、断链与重连；无实物时明确标记待验证，不声称真机支持已验收。

**参考与许可边界：** DCTimer-BLE 的 Java 协议用于核对帧格式与行为；本项目独立编写 TypeScript 实现，不直接拷贝 Java 文件。发布前审视第三方许可说明。
