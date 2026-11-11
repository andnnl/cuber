# 魔方栈最新版本：v1.0.20

发布日期：2026-11-12。Android versionCode：21。

## 更新内容

- F2L 预判增加角块底色、棱块指定色贴的位置与朝向判定，角棱可独立选择，并支持自定义解法。
- 十字难度与蓝牙十字保持一致，支持随机及精确最优 2～7 步；半透明与隐藏无关可同时启用并独立保存。
- 增加“答对自动下一题”开关，正确后短暂停留显示结果再出题；取消勾选、重置、手动切题或离开页面会取消待执行切题。
- 无缝 OP 当前题面增加“显示 B 面”开关，补齐背面顶层三格、对应轨迹与六格覆盖计算，保留观察窗口和终点筛选。
- 修复公式集训练计时中非标 F2L 的朝向不一致：自动在逆公式打乱前补偿转体，统一当前题和预打乱下一题的朝向，保留出题前 z2／y 设置及原训练公式。
- 覆盖全部 598 条非标公式及 8 种出题朝向，回归还原判定、色贴预判、自动切题、OP 背面轨迹、两种预打乱布局及手机和平板显示。

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
