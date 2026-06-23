# Cuber CLI 使用教程

## 概述

Cuber CLI 是一个命令行工具，用于验证魔方求解器的正确性。它可以应用操作序列并输出魔方状态字符串。

## 安装

```bash
cd /dd/workspace_trae/cuber
npm install
```

## 基本用法

```bash
npm run verify <命令> [参数]
```

或直接运行：

```bash
node src/verify/cli.js <命令> [参数]
```

## 命令列表

### 1. apply - 应用操作

应用操作序列后输出魔方状态字符串。

```bash
npm run verify apply <操作序列>
```

**示例：**

```bash
# 单次转动
npm run verify apply "R"
# 输出: 操作: R
#       状态: UUFUUFUURRRRRRRDRRFFFFFDFFBDDRDDBDDBLLLLLLLLLUBBUBBUBB

# 多次转动
npm run verify apply "R U R' F"
# 输出: 操作: R U R' F
#       状态: ...

# 空操作（还原状态）
npm run verify apply ""
# 输出: 操作: 
#       状态: UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
```

### 2. test - 运行测试

运行内置测试验证模块正确性。

```bash
npm run verify test
```

**输出示例：**

```
=== 运行验证测试 ===

测试 1: R 转动
R 转动后: UUFUUFUURRRRRRRDRRFFFFFDFFBDDRDDBDDBLLLLLLLLLUBBUBBUBB
  U面: UUFUUFUUR
  R面: RRRRRRDRR
  F面: FFFFFDFFB
  D面: DDRDDBDDB
  B面: UBBUBBUBB

测试 2: R R' = 已还原
PASS

测试 3: R2 R2 = 已还原
PASS
```

## 状态字符串格式

状态字符串采用 **URFDLB** 顺序，共 54 个字符：

| 面 | 位置 | 颜色字符 |
|---|---|---|
| U (Up) | 0-8 | U |
| R (Right) | 9-17 | R |
| F (Front) | 18-26 | F |
| D (Down) | 27-35 | D |
| L (Left) | 36-44 | L |
| B (Back) | 45-53 | B |

**还原状态：**

```
UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
```

## 操作符号

### 基本转动

| 符号 | 含义 |
|---|---|
| R | 右面顺时针 90° |
| R' | 右面逆时针 90° |
| R2 | 右面转动 180° |
| L | 左面顺时针 90° |
| U | 上面顺时针 90° |
| D | 下面顺时针 90° |
| F | 前面顺时针 90° |
| B | 后面顺时针 90° |

### 组合操作

多个操作用空格分隔：

```bash
npm run verify apply "R U R' F'"
```

## 与 cube_cross_solve 对比验证

### 步骤 1：在 Rust 项目生成解法

```bash
cd /dd/workspace_rust/cube_cross_solve
cargo run --release
# 输入打乱: R D2 R F2 L U2 D U L2 U R2 B2 D' L2 B' U R' F L' F'
# 获取解法: U L' D2 F' L' D' L2
```

### 步骤 2：在 Cuber 项目验证解法

```bash
cd /dd/workspace_trae/cuber
npm run verify apply "R D2 R F2 L U2 D U L2 U R2 B2 D' L2 B' U R' F L' F'"
# 记录输出的状态字符串

npm run verify apply "U L' D2 F' L' D' L2"
# 如果解法正确，输出的状态应该是十字已解决
```

## 示例：验证十字求解

```bash
# 打乱魔方
npm run verify apply "R"
# 输出: 状态: UUFUUFUURRRRRRRDRRFFFFFDFFBDDRDDBDDBLLLLLLLLLUBBUBBUBB

# 检查十字是否已解决
# 十字棱块位置: DF(位置27), DR(位置31), DB(位置35), DL(位置39)
# 十字已解决 = DF=D, DR=D, DB=D, DL=D
```

## 常见问题

### Q: 状态字符串中为什么有些位置不是对应面的颜色？

A: 这是正常的。状态字符串表示的是**当前每个位置的颜色**，不是位置本身。例如 R 转动后，U 面的某些位置会变成 F 或 B 的颜色。

### Q: 如何判断十字是否已解决？

A: 检查 D 面的棱块位置（索引 28, 30, 32, 34）是否都是 D 颜色：

```
状态字符串位置: 28, 30, 32, 34
十字已解决条件: 这4个位置都是 'D'
```

## 技术细节

### 实现位置

- CLI 入口: `src/verify/cli.js`
- 魔方逻辑: `src/verify/cube.js`
- 状态转换: 基于 `MOVE_CYCLES` 定义块循环

### 与 TS 主版本的区别

| | TS主版本 | verify CLI |
|---|---|---|
| 文件 | `src/cuber/cube.ts` | `src/verify/cube.js` |
| 依赖 | Three.js | 无依赖 |
| 运行 | 浏览器 | Node.js |
| 用途 | 3D可视化 | 状态验证 |

## 进阶用法

### 批量验证

创建测试文件 `test_cases.txt`：

```
R
R R'
R2 R2
R U R' U'
```

批量运行：

```bash
while read line; do
  npm run verify apply "$line"
done < test_cases.txt
```

### 脚本调用

```javascript
const { applyMoves, stateToString } = require('./src/verify/cube.js');

const state = applyMoves('R U R\' F');
console.log(state);
```