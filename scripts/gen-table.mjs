// 生成 Cross 求解搜索表 bin 文件 (打包进 dist 与 Android assets)
// 用法: node scripts/gen-table.mjs [输出目录] (默认 dist)
// 原理: Node 直接调用 wasm-bindgen 胶水, generate_table(8) 后导出字节写文件。
//       App 启动时优先 fetch 该文件 loadTableFromBytes, 免去现场重算。
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(root, process.argv[2] || "dist");
mkdirSync(outDir, { recursive: true });

// 1. 加载 wasm-bindgen 胶水 (ES Module)。
//    项目 package.json 无 "type":"module", .js 会被 Node 当 CJS 解析报
//    "Unexpected token 'export'" → 复制为 .tmp/ 下临时 .mjs 再动态 import
const gluePath = path.join(root, "dist/cube_cross_solve.js");
mkdirSync(path.join(root, ".tmp"), { recursive: true });
const tmpGlue = path.join(root, ".tmp/cube_cross_solve.gen.mjs");
copyFileSync(gluePath, tmpGlue);
const glue = await import(pathToFileURL(tmpGlue).href);

// 2. Node 的 fetch 不支持 file://, 直接读 wasm 字节传入 init
const wasmBytes = new Uint8Array(readFileSync(path.join(root, "dist/cube_cross_solve_bg.wasm")));
await glue.default(wasmBytes);

if (glue.is_table_loaded()) {
  console.log("[gen-table] 表已就绪 (wasm 内置), 无需生成");
} else {
  console.log("[gen-table] 生成搜索表 (深度 8) ...");
  await glue.generate_table(8);
}

// 3. 导出字节写文件
const bytes = await glue.get_table_bytes();
const out = path.join(outDir, "cube_cross_table.bin");
writeFileSync(out, Buffer.from(bytes));
console.log(`[gen-table] 完成: ${out} (${(bytes.length / 1024).toFixed(1)} KB)`);
