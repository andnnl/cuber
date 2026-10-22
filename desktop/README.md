# Windows / Linux 桌面版

桌面应用基于 Electron，复用网页的界面、蓝牙协议、WASM 求解器和搜索表。启动后默认进入 BLECross；可通过应用内菜单进入其他模式。

## 本机运行与打包

建议使用 Node.js 22。现有 webpack 依赖之间有 peer 版本冲突，安装时需加 `--legacy-peer-deps`。

```bash
npm install --legacy-peer-deps
npm run test:desktop
npm run build
node scripts/gen-table.mjs dist
npm run desktop:dev
```

Linux 生成 AppImage：`npm run desktop:linux`。Windows 生成 NSIS 安装包：`npm run desktop:win`。两种安装包均写入 `desktop-release/`；在 Linux 同时构建两端可尝试 `npm run desktop:build`，Windows 安装包的跨平台构建依赖 Wine。本机若 Wine 的默认前缀无权限，可将 `WINEPREFIX` 指向当前用户拥有的目录（如 `mktemp -d` 创建的临时目录）。GitHub Actions 的 `Desktop Windows / Linux` 工作流分别在原生 Windows 和 Linux runner 上构建，并上传产物作为工作流附件；手动运行或推送 `v*` 标签均可触发。工作流**不会自动发布 Release**。

打包脚本会先执行 webpack 生产构建和搜索表生成，随后把 `dist` 原样作为资源放入安装包。请勿直接用 `file://` 打开 `dist/index.html`：Worker、WASM 和 ES Module 需要同源的安全上下文。桌面壳只在 `127.0.0.1:34657` 提供包内静态资源（不对外监听、不从网络下载），以让 Chromium 正常提供 Web Bluetooth；固定端口也让界面设置保存在同一个浏览器来源下。若端口被其他程序占用，应用会报错而不会加载其他程序的页面。

## 蓝牙魔方

点击「连接魔方」后，Electron 显示附近设备列表；选择 GAN、MG 等支持的魔方。桌面端使用与 Chrome/Edge 一样的 Web Bluetooth 传输层，Android 原生蓝牙桥不会在桌面端启用。GAN Gen2 如无法自动取得 MAC 地址，请先在连接面板手动输入设备 MAC。Windows／Linux 的蓝牙适配器、权限、驱动和设备固件都会影响扫描；首次发布前仍需分别用实体魔方验证连接、转动通知和断开重连。

Linux 如扫描不到设备，先确认蓝牙已启用、用户可访问 BlueZ，且魔方未连接其他应用。桌面安装包未签名，Windows SmartScreen 可能提示未知发布者；正式分发前应配置签名证书。已生成的 APK 不受桌面打包配置影响。
