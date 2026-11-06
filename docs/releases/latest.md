# 魔方栈最新版本：v1.0.17

发布日期：2026-11-06。Android versionCode：18。

## 更新内容

- 修复公式训练非标 F2L 的目标槽位判定：出题方向只表示角块被困位置，按实际目标角块配色确定应归位的槽位。
- 保留出题时已正确的十字棱块、已完成槽位，要求真实目标角块与配套棱块归位且朝向正确；不额外要求其他未完成槽位。
- 旧记录重新训练时按题目 ID 与公式纠正原有目标元数据，不修改历史成绩。
- 对全部 598 条非标公式、两种 z2 与四种 y 出题转向进行目标实体块校验，并验证屏幕操作、实体跟随和两种连续预打乱布局。

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
