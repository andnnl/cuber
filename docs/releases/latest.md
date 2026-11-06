# 魔方栈最新版本：v1.0.18

发布日期：2026-11-06。Android versionCode：19。

## 更新内容

- 训练记录改为表格，时间只显示时、分、秒；保留结果筛选与复盘题面，手机可横向滚动查看全部列。
- 公式训练预打乱模式在屏幕宽度不超过 600px 时上下排列两个魔方，平板和电脑仍左右排列；轮流操作与固定位置操作均保留，镜像小魔方同步显示。
- 修复公式训练记录难以滚动查看的问题，补齐公式库、非标 F2L、F2L 训练、公式编辑与蓝牙连接教程等页面的滚动区域。
- 恢复可见滚动条，调整小窗口内容换行与 F2L 魔方尺寸；在魔方上滚轮缩放时不再同时滚动页面。
- 回归验证记录表格、18 组响应式预打乱布局、筛选与复盘、连续切题和多页面滚动。

## 固定发布入口

- GitHub：`https://github.com/andnnl/cuber/releases/tag/latest`
- Gitee：`https://gitee.com/andnnl/cuber/releases/tag/latest`

后续版本复用上述页面和 `latest` 标签，仅保留最新一套安装包，不再创建多份历史版本 Release；历史源码版本仍保留 Git 标签。

## 下载与安装

- Windows x64：`Cuber-latest-win-x64.exe`。
- Linux x86_64：`Cuber-latest-linux-x86_64.AppImage`，赋予执行权限后启动。
- Android：`Cuber-latest-android-release.apk`，仅提供正式构建，不再重复上传 debug 包。
- GitHub 提供完整安装包与 `SHA256SUMS.txt`；Gitee 桌面包按 90 MiB 分卷，下载同平台的全部分卷和 `unpack.bat`／`unpack.sh`，放在同一目录后运行脚本合包，脚本会校验完整性。
- 桌面安装包未进行发行商代码签名；Android 沿用项目既有签名配置。

## 后续发布约定

1. 升级应用版本与 Android versionCode，更新本文件，运行回归测试后统一打包。
2. 提交源码及网页／Android 内嵌资源，推送 GitHub、Gitee 的 master，保留对应 `v<版本>` 源码标签。
3. 将 `latest` 标签更新到本次提交，更新固定发布页的标题、说明和附件；稳定附件名保持不变，替换而不累积旧包。
4. 上传完成后回读附件并核对大小与 SHA-256，再移除历史 Release 页面和附件；不删除历史源码标签。
