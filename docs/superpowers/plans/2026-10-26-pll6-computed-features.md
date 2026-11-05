# PLL 六格实际特征计算实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:executing-plans 在当前主工作区内联执行，不创建 worktree；先测试再实现，保留已有未提交改动。

**目标：** 用当前 F/R 六格实际颜色识别文档 65 类，并让 84 个公式观测逐行核验九类资料。

**架构：** 纯函数提取六格及关系；穷举目录是运行时查询真值，独立测试从公式库和 3D 引擎重建目录；资料断言检验 Markdown 条件，界面显示实际匹配与少量区分特征。

**技术栈：** TypeScript、Vue 2、Node assert、Playwright CLI、webpack。

---

## 文件与职责

- `src/ble/pll-six-sticker.ts`：提取、归一化和分类纯函数。
- `src/ble/pll-six-sticker-catalog.ts`：84 状态生成所得签名对应 65 文档行的静态查询目录。
- `scripts/test-pll-six-sticker.cjs`：纯函数红绿测试及目录唯一性测试。
- `scripts/verify-pll6-computed.js`：从真实公式和 Three.js 重新穷举 84 状态，对照九类 Markdown 与 UI。
- `src/vue/PllObservation/index.ts`、`index.html`、`index.css`：当前实际特征展示及原候选对照。
- `docs/pll-six-sticker-observation.md`：仅在核验给出具体反例时修改。

## 本轮核验记录

固定 F/R 六格、21 条公式各 4 种 U 朝向：84 个观测、71 个完整关系签名、65 个教学资料分类；九章计数依次为 5／5／5／9／9／8／8／8／8。浏览器逐条核对文档 343 个明确关系／子集色数条件，发现三个观测反例：第 5 章 Gd `RFBLRL` 的色数、第 6 章 Ja `FFRBBF` 与 Jb `LFFRLL` 的对／邻方向，原图转写未修改，详见资料末尾。另验证了训练用前后 AUF 的 336 种公式组合均匹配其 PLL 名称。UI 显示程序计算的区分关系，原图行折叠为对照。

### 任务 1：计算模型

- [ ] 写纯函数测试：复原态的 F/R 六格、团／眼／棒／灯分类、同／对／邻判定、Z 两色数、非法串返回无结果。运行 `npm run test:pll` 验证红灯。
- [ ] 实现 `extractPllSix(facelets)` 和 `sixSignature(facelets)`，从六面中心构造对色映射；重跑测试变绿。

### 任务 2：84 状态目录与 65 行核验

- [ ] 在浏览器检查中逐条 `inverse(origin) + [空,U,U2,U']`，保存签名／章／名称／色数；先断言尚不存在目录匹配以见红灯。
- [ ] 生成并加入签名目录，断言 84 条都唯一匹配 PLL、按章与 Z 色数归并为 65 行，章计数为 `5,5,5,9,9,8,8,8,8`，无跨名冲突。对照 Markdown 的章节＋名称＋Z 色数集合。
- [ ] 将 Markdown 中明确的编号关系与色数转换为可执行断言，失败时报告六格与反例；可验证且匹配的条目才能作为实际提示来源。

### 任务 3：界面与回归

- [ ] 浏览器先断言开启“显示当前特征”后存在实测六格和匹配章／PLL，状态改变会更新，非法状态不能回退到按题目名称猜测。
- [ ] 实现实际识别和候选资料对照；不改变用户的判断题答案及蓝牙判题逻辑。
- [ ] 运行 `npm run test:pll`、`npm run test:ble`、`npm run build`、浏览器脚本和 `git diff --check`；保留本地工作区，不混入桌面蓝牙改动。
