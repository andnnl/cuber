# Android 蓝牙魔方 App 设计

## 目标

将当前仓库的 Android WebView 壳作为首个平台交付，安装后直接进入蓝牙十字训练界面，并保留现有 GAN 蓝牙魔方原生连接能力。

## 范围

- Android App 默认启动 `mode=blecross`。
- 保留 `WebViewAssetLoader` 的 HTTPS 本地资源加载方式，以支持 ES Module、WASM 和搜索表加载。
- 保留原生 BLE 扫描、GATT 连接、服务发现、通知订阅和写入队列。
- Android 12 及以上使用 `BLUETOOTH_SCAN`、`BLUETOOTH_CONNECT`；Android 11 及以下使用旧蓝牙权限和定位权限。
- debug 构建允许 WebView 远程调试；release 构建关闭远程调试。
- App 版本升级为 `versionCode 6`、`versionName 1.0.5`。
- 使用最新 webpack 产物和十字搜索表重新生成 debug/release APK。

## 不在本次范围

- iOS App。
- 修改 GAN Gen2、Gen3、Gen4 协议算法。
- 应用商店正式签名、上架和自动更新。
- 新增其他品牌蓝牙魔方协议。

## 启动与连接流程

1. `MainActivity` 使用本地 HTTPS 地址打开 `index.html?mode=blecross`。
2. 页面通过 `window.__bleNative` 判断 Android 原生桥是否存在。
3. 用户点击连接后，原生桥申请当前 Android 版本所需权限并扫描 BLE 设备。
4. 用户选择设备后，原生层按地址建立 GATT 连接并发现服务。
5. 原生层把服务、通知和错误事件回调给 TypeScript 传输层。
6. TypeScript 根据 GAN 服务 UUID 选择协议代际，并用设备地址参与协议解密。

## 发布安全

- `WebView.setWebContentsDebuggingEnabled` 根据 `BuildConfig.DEBUG` 控制，避免 release APK 暴露 WebView 调试入口。
- 本次 release APK 延续 debug 签名，仅定位为可直接安装的个人测试包。
- 正式发布前必须改用独立 release keystore，并妥善保存签名材料。

## 构建与验收

- 运行 BLE 自动化测试，确认传输层和协议层无回归。
- 运行 webpack 生产构建。
- 生成或复用 `cube_cross_table.bin`，同步最新前端资源到 Android assets。
- 使用 JDK 17 或更高版本运行 Gradle，生成 debug 和 release APK。
- 检查 APK 包名、版本、蓝牙权限、默认入口资源以及 WASM/搜索表文件。
- 由于当前环境不能替代真实 Android 手机与真实魔方，最终仍需进行一次真机扫描、连接、转动和断线重连验收。

## 成功标准

- App 安装启动后直接显示蓝牙十字训练界面。
- release APK 关闭 WebView 调试。
- APK 包含 Android BLE 权限、最新前端资源、WASM 和十字搜索表。
- 自动化测试和 Android 构建均通过。
