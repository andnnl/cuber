# cuber CLI 使用说明

## 安装

```bash
cd /dd/workspace_trae/cuber
npm install
```

## 基本命令

```bash
npm run verify <命令> [参数]
```

或直接运行：

```bash
node src/verify/cli.js <命令> [参数]
```

## 命令列表

### 1. verify - 验证求解

验证打乱+求解是否正确。

```bash
npm run verify verify "R U R' F" "R' U' R F'"
```

输出：
- 打乱后状态字符串 (URFDLB格式)
- 求解后状态字符串
- 十字是否已解决
- 是否完全还原

### 2. apply - 应用操作

应用操作后输出魔方状态字符串。

```bash
npm run verify apply "R"
npm run verify apply "R U R' F"
```

输出：
- 操作序列
- 状态字符串 (54字符 URFDLB 格式)

### 3. test - 运行测试

运行内置测试验证模块正确性。

```bash
npm run verify test
```

测试内容：
- R 转动后状态
- 十字求解验证
- R R' = 已还原
- R2 R2 = 已还原

## 状态字符串格式

URFDLB 顺序，每个面 9 个贴纸：
- U: 位置 0-8
- R: 位置 9-17
- F: 位置 18-26
- D: 位置 27-35
- L: 位置 36-44
- B: 位置 45-53

已还原状态：`UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB`

## 示例

```bash
# 验证十字求解
npm run verify verify "R D2 R F2 L U2" "U L' D2 F' L' D'"

# 查看单次转动状态
npm run verify apply "R"

# 运行测试
npm run verify test
```

## 与 cube_cross_solve 对比验证

可用此CLI验证 Rust 求解器生成的解法是否正确：

```bash
# 在 cube_cross_solve 项目生成解法
cargo run --release
# 输入打乱: R D2 R F2 L U2 D U L2 U R2 B2 D' L2 B' U R' F L' F'
# 获取十字解法: U L' D2 F' L' D' L2

# 在 cuber 项目验证
npm run verify verify "R D2 R F2 L U2 D U L2 U R2 B2 D' L2 B' U R' F L' F'" "U L' D2 F' L' D' L2"
```