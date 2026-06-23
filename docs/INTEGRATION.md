# cube_cross_solve + cuber 集成指南

## 概述

cuber 已集成 cube_cross_solve WASM 模块，可实现：
1. 生成打乱 → 2. 求解 → 3. 3D 动画播放

## API 接口

### WASM 模块 (`window.cube_cross_solve`)

```javascript
// 初始化 WASM
await wasm.default();

// 生成搜索表（首次约 200ms）
await wasm.generate_table(8);

// 从 IndexedDB 缓存加载（约 50ms）
const cached = await loadFromIndexedDB();
await wasm.load_table_from_bytes(cached);

// 求解（返回多个解法）
const solutions = await wasm.solve_multi("R U R' F", 5);

// 获取表数据用于缓存
const bytes = await wasm.get_table_bytes();
```

### 3D 可视化 (`cuber/core`)

```javascript
// 获取魔方实例（Playground 模式）
const cube = world.cube;

// 获取当前状态字符串（54字符）
const state = cube.serialize(); // "UUUUUUUUURRRRRRRRR..."

// 设置状态（瞬间）
twister.setup("R U R' F");

// 播放算法（动画）
twister.push("R U R' U' R' F R F'");
```

## 完整示例

### 方式 1: Playground 模式

URL: `http://localhost:8080/?mode=playground`

```typescript
// src/vue/Playground/rubic.ts 中已有集成
import * as WasmSolver from "../../wasm/WasmSolver";

// 初始化
await WasmSolver.initWasm();

// 尝试从 IndexedDB 加载缓存
const cache = await indexedDBStorage.get("cross_table");
if (cache) {
  await WasmSolver.loadTableFromBytes(cache);
} else {
  await WasmSolver.generateTable(8);
  const bytes = await WasmSolver.getTableBytes();
  await indexedDBStorage.set("cross_table", bytes);
}

// 求解
const scramble = twister.scrambler(); // 生成打乱
const solutions = await WasmSolver.solveMulti(scramble, 5);

// 选择最佳解法播放
twister.push(solutions[0]);
```

### 方式 2: 自定义集成页面

创建新 HTML 文件（放到 `dist/` 目录）：

```html
<!DOCTYPE html>
<html>
<head>
  <title>Cross Solver Demo</title>
  <script type="module">
    import * as wasm from './cube_cross_solve.js';
    
    async function solve() {
      // 初始化
      await wasm.default();
      
      // 加载表
      if (!wasm.is_table_loaded()) {
        await wasm.generate_table(8);
      }
      
      // 求解
      const scramble = document.getElementById('scramble').value;
      const solutions = await wasm.solve_multi(scramble, 5);
      
      // 显示结果
      document.getElementById('result').innerHTML = 
        solutions.map(s => `<div>${s}</div>`).join('');
    }
    
    window.solve = solve;
  </script>
</head>
<body>
  <input id="scramble" placeholder="打乱公式" value="R U R' F">
  <button onclick="solve()">求解</button>
  <div id="result"></div>
</body>
</html>
```

## 数据格式

### 打乱公式格式

```
R U R' F      - 标准魔方记号
R U2 R' U'    - 180度转动用 2
Rw Uw         - 双层转动用 w
```

### 状态字符串格式（54字符）

```
位置 0-8:   U 面 (UBR→UBL→UFR→UFL 顺序)
位置 9-17:  R 面
位置 18-26: F 面
位置 27-35: D 面
位置 36-44: L 面
位置 45-53: B 面

每个面布局：
0 1 2
3 4 5
6 7 8
```

## 性能指标

| 操作 | 时间 |
|------|------|
| WASM 初始化 | ~50ms |
| 生成搜索表 | ~200ms |
| 从缓存加载 | ~50ms |
| 单次求解 | <0.1ms |
| 动画播放 | ~1s/步 |

## 已缓存功能

cuber 已在 IndexedDB 中自动缓存搜索表：
- Key: `cross_table`
- Size: ~2.6MB (190,080 状态)

首次访问会生成，后续访问自动加载缓存。

## 扩展方向

1. **XCross 模式**: 同时解决十字 + 一个 F2L
2. **F2L 模式**: 解决所有 4 组 F2L
3. **完整求解**: CFOP 全流程 (Cross → F2L → OLL → PLL)
4. **状态验证**: 用 3D 显示验证求解结果正确性