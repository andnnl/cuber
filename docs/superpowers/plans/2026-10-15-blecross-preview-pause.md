# BLECross 推荐预览转正停顿实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 内联执行；步骤按 TDD 红灯、绿灯与验证执行。

**目标：** 推荐卡片播放和 GIF 均先展示转正的魔方 1 秒，再执行公式；GIF 包含该静止段。

**架构：** 在 `playBest` 的完整播放路径复用一个 1000ms 的可取消起播计时器；步进路径保持立即执行。推荐 GIF 先切正面并启动录制，再调用同一 `playBest` 起播路径，录制循环在停顿期间持续采样。切换推荐、关闭界面时沿用现有取消清理。

**技术栈：** TypeScript、Vue 2、Three.js、Playwright CLI、webpack。

---

## 文件职责

- `src/vue/BleCrossTrainer/index.ts`：播放起播计时器、推荐 GIF 开始顺序和录制生命周期。
- `scripts/verify-blecross-recommendation-pause.js`：真实浏览器中断言转正、停顿、GIF 采样与训练数据不变。

### 任务 1：测试停顿语义

- [x] 创建浏览器测试：新打乱后找非 F 朝向推荐，点击播放立即断言中心块转正、预览游标为 0；等待 700ms 游标仍为 0；总等待到 1000ms 后游标推进。
- [x] 在同一脚本点击 GIF：开始后立即确认目标中心块在 F 且帧数增加；起播前至少录制 12 帧（80ms/帧约 1 秒），起播后完成录制；用 ffmpeg 核对导出 GIF 的前 13 帧静止。
- [x] 对照未修改的生产构建运行 `playwright-cli run-code --filename=scripts/verify-blecross-recommendation-pause.js`，确认因过早起播失败。

### 任务 2：统一播放和录制时序

- [x] `playBest` 将完整播放传入 1000ms 延迟；`startBestPreview` 在 `playingBest` 与 `rebasing` 锁定后以已有 `bestPlayTimer` 延迟调用 `playNextBestMove`，步进仍立即播放。
- [x] 推荐 GIF 移除外层 700ms 计时器；转正后先 `startGif` 录首帧，再调用 `playBest`，由同一 1000ms 延迟负责静止段。停止录制或推荐变化时取消播放计时器。
- [x] 重建后运行新浏览器测试，确认停顿、帧数、自动收尾和训练数据断言通过。
- [x] 审查后补修普通 GIF：重置轮次前保存解法快照，录制起点只准备一次；普通公式与推荐卡片显式区分上下文，同公式不同卡片用推荐 ID 隔离游标。
- [x] 补充浏览器回归：普通 GIF 约 1 秒起播／停止取消，公式撞名和同公式不同推荐卡片，更新旧预览测试的显式参数。
- [x] 审查补修：切换 y/y′ 或训练目标、重算最优解时取消待播动作和自动录制；自动下轮倒计时内禁止普通 GIF 录到跨轮旧快照。

### 任务 3：验证与提交

- [x] 运行 `node scripts/test-blecross-recommendation-preview.js`、`npm run test:ble`、`node scripts/test-cross-analysis.js`、生产构建和浏览器推荐朝向/展示/停顿回归。
- [x] 审核 `git diff --check`、`git status --short`；只提交推荐预览、颜色修复、对应测试与构建产物，不提交工作区原有的 README、`.superpowers/`、`.trae/`。
- [x] 提交中文 Conventional Commit，并将当前 `master` 推送到已配置的 `github` 与 `origin`，核对远端结果。
