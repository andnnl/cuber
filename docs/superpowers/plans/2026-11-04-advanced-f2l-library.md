# 非标 F2L 独立公式库实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。本项目明确要求内联执行，不新建 worktree。

**目标：** 将 CubeRoot 非标 F2L 快照导入离线公式库，提供 54 案例、四方向和多公式的 3D 动画学习页面。

**架构：** 静态 JSON 保存源案例及公式，纯逻辑模块负责归一化与播放模型；独立 Vue 2 页面负责 3D 场景、案例列表和动画；AppShell、主菜单及背景色注册新模式。

**技术栈：** TypeScript 4.3、Vue 2、Three.js、webpack 5、Node.js 单元测试。

---

## 文件职责

- `scripts/import-adv-f2l.cjs`：从源站快照生成经检查的本地数据文件与导入报告。
- `src/vue/AdvancedF2L/data.json`：打包的原始案例数据，不依赖运行时网络。
- `src/ble/adv-f2l.ts`：案例类型、四方向选择、公式解析与起点建立。
- `scripts/test-adv-f2l.cjs`：完整性、空组、解析、回放与选择行为测试。
- `src/vue/AdvancedF2L/index.ts`、`index.html`、`index.css`：页面状态、3D 视口、播放控制与响应式布局。
- `src/ble/app-route.ts`、`src/vue/AppShell/index.ts`、`src/vue/Setting/index.html`、`src/vue/background-store.ts`：新模式注册与主菜单入口。
- `package.json`：`test:adv-f2l` 命令。

### 任务 1：离线快照及完整性

- [ ] 在 `scripts/test-adv-f2l.cjs` 写失败用例：读取数据后断言 `cases.length === 54`，每个案例四个方向，所有 `algs.flat()` 总数为 598，三类各 18 个，保留空方向和 `altId`。
- [ ] 运行 `node scripts/test-adv-f2l.cjs`；预期因缺少数据失败。
- [ ] 用 `apply_patch` 创建导入脚本：从 `https://cuberoot.me/api/alg/snapshot/3x3/adv-f2l` 获取 JSON，逐案检查 `id/name/subgroup/setup/algs/oriNames`，把原数据格式化写至 `src/vue/AdvancedF2L/data.json`，报告案例、公式和空组统计；工具脚本生成 JSON 属于机械数据导入。
- [ ] 运行导入脚本与完整性测试；预期 54 案例、598 公式且零数据字段错误。

### 任务 2：纯逻辑播放模型

- [ ] 在测试里增加 `selectAdvancedF2LCase(case, orientation, variant)` 的失败断言：前右第一个公式返回原 ID、原记号和合法起始公式；选空组返回明确错误；切换公式改变选中 `altId`。
- [ ] 运行 `npm run test:adv-f2l` 确认上述断言失败。
- [ ] 在 `src/ble/adv-f2l.ts` 实现类型和选择函数；使用现有 `parseOpFormula` 获得正反动作，从选中公式的逆操作生成起点。只为兼容等价转动规范化 `U2'` 等写法，不改变显示的原记号。
- [ ] 增加全量测试：各公式执行 `inverse + moves` 回到还原态，按源 `setup` 核对案例身份和可解目标槽位；不能解析或身份不符时输出包含案例、方向、`altId` 的错误清单。确保测试会因故意篡改一条公式而失败。
- [ ] 运行 `npm run test:adv-f2l`；在全量测试通过之前不将失败项静默删除。

### 任务 3：路由和菜单

- [ ] 在 `scripts/test-adv-f2l.cjs` 添加 `parseAppRoute('?mode=advf2l').mode === 'advf2l'`、`routeUrl` 返回新模式以及菜单入口存在的失败断言。
- [ ] 运行测试确认失败。
- [ ] 修改 `src/ble/app-route.ts` 的 MODES、`src/vue/AppShell/index.ts` 的 views、`src/vue/Setting/index.html` 主菜单及 `src/vue/background-store.ts` 的 SCOPES。
- [ ] 运行测试确认通过，检查其他 `?mode=` 路由未改变。

### 任务 4：3D 页面与播放

- [ ] 写页面行为测试（可用源码方法 harness 或浏览器自动化）：切案例/方向/公式会停止旧播放、重建起点；空方向不能播放；重置、上一步、下一步、播放、暂停按实际公式步骤变化。
- [ ] 运行测试确认失败。
- [ ] 创建 `AdvancedF2L/index.ts`：提供 World、Viewport、Preference、Palette，管理 `caseId/orientation/variant/cursor/playing`，用现有 twister 建起点和逐步动画，停用时取消定时器与渲染循环。
- [ ] 创建模板与样式：桌面案例网格与常驻 3D 区域，手机按「3D → 当前方向的多公式列表 → 可滚动案例网格」排列；按三类筛选，保留四方向空组提示；注明数据来源。
- [ ] 运行页面行为测试；检查主菜单进入页面、滚动、选择和返回。

### 任务 5：完成核验

- [ ] 运行 `npm run test:adv-f2l`、`npm run test:pll`、`npm run test:formula-timer`、`npm run build`，记录实际退出状态。
- [ ] 运行 `git diff --check`，审查新文件和现有未提交改动；不把既有草稿及上次未提交的修复混入本功能提交。
- [ ] 报告导入的案例／公式数量、被排除或无法播放的公式、验证结果；请用户实测需要实体视觉判断的动画。除非用户另行要求，不打包 App、不推送或发布版本。
