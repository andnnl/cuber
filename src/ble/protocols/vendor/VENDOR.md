# Vendor 来源说明

本目录代码 vendored 自 [afedotov/gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth) v3.0.2 (MIT License, 见 LICENSE.txt)。

| 文件 | 原文件 | 改动 |
|------|--------|------|
| gan-cube-definitions.ts | src/gan-cube-definitions.ts | 原样复制 |
| gan-cube-encrypter.ts | src/gan-cube-encrypter.ts | 原样复制 (依赖 npm aes-js) |
| utils.ts | src/utils.ts | 仅保留 `now` 与 `toKociembaFacelets` (删除时间戳回归拟合等连接层工具) |
| gan-protocol-core.ts | src/gan-cube-protocol.ts | 裁剪: 移除 Web Bluetooth 连接类 (GanCubeClassicConnection) 与 RxJS 依赖, 保留纯协议驱动 (Gen2/3/4) 与事件类型 |

原库的 Web Bluetooth 连接层 (gan-smart-cube.ts) 未 vendor —— 由本项目 `src/ble/transport/` 的统一传输层替代 (Web Bluetooth 与 Android 原生桥双实现)。

注意: 该库未实现 GAN Gen1 (356i / 356i2) 协议, 本项目亦暂不支持。
