# 魔方栈最新版本：v1.0.19

发布日期：2026-11-09。Android versionCode：20。

## 更新内容

- 修复公式训练计时页面的渲染性能问题：历史记录表独立渲染，不再随计时刷新反复重绘，避免大量记录拖慢蓝牙魔方的 3D 动画跟随。
- 训练记录按时间从新到旧分页显示，每页 50 条，最多浏览当前筛选下最近 1000 条；完整历史仍保留用于统计，不删除旧成绩。
- 新成绩和筛选变化自动回到第一页；保留时分秒显示、结果筛选、复盘题面及手机横向滚动。
- 验证 500 条记录下计时刷新不重新格式化历史表格，并回归分页边界、连续实体动作、预打乱两种布局及手机和平板显示。

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
