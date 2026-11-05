# Windows 原生蓝牙一选即连

## 目标

Windows 桌面版的连接面板展示原生 BLE 扫描到的魔方；选中一项即可连接该设备、订阅通知并执行 GAN 协议初始化。错误留在面板中可见。浏览器 Web Bluetooth、Linux 和 Android 原有路径不变，手填 MAC 仍是兜底。

## 数据流

Windows 专用 .NET 辅助程序常驻 Electron 子进程，通过单行 JSON stdin/stdout 交换命令和事件。扫描事件带设备名称、广播地址和从制造商数据解析的 GAN 加密 MAC；列表只呈现可得到可信加密 MAC 的设备。选择后使用该扫描记录中的广播地址进行 GATT 连接，但向现有 GAN 协议层提供同一记录的加密 MAC。避免 Electron 设备列表与 Windows 扫描列表按名称关联。

Electron preload 只暴露 `__bleNative` 的五个受限方法，主进程校验来源和参数后转发到子进程；返回事件分发到现有 `window.__ble.dispatch`。不向不可信页面开放任意进程命令。连接与扫描的超时、进程退出和系统错误转成界面可见的错误事件。断开时清理通知与 GATT 资源。原有 Web Bluetooth MAC 输入继续可用。

## 验证

Node 测试覆盖 IPC 消息解析、设备身份与 MAC 传递、错误和进程退出、主进程来源校验；TypeScript 测试覆盖原生地址与解密 MAC 分离；Windows CI 编译辅助程序并验证安装包包含它。Linux 本地运行前端构建和现有测试；Windows 真机 BLE 连接由用户安装新包验证。
