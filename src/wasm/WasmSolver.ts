import { SolverWorkerClient } from "./SolverWorkerClient";
import { debugLog } from "../util/debug-log";

let wasmModule: any = null;
let workerClient: SolverWorkerClient | null = null;
let backend: "worker" | "main" | null = null;
let isInitialized = false;
let tableLoaded = false;

async function initMainThread(): Promise<void> {
  const wasm: any = (window as any).cube_cross_solve;
  if (!wasm) {
    throw new Error("WASM 模块未找到，请确保在 HTML 中正确加载了 cube_cross_solve.js");
  }
  await wasm.default(new URL('cube_cross_solve_bg.wasm?v=20261022-xxcross', window.location.href));
  wasmModule = wasm;
  backend = "main";
  isInitialized = true;
}

export async function initWasm(): Promise<void> {
  if (isInitialized) return;

  if (typeof Worker !== "undefined") {
    let client: SolverWorkerClient | null = null;
    try {
      client = new SolverWorkerClient();
      await client.request<boolean>("init", {}, [], 30000);
      workerClient = client;
      backend = "worker";
      isInitialized = true;
      debugLog("[WASM] 求解 Worker 初始化成功");
      return;
    } catch (error) {
      client?.terminate();
      workerClient = null;
      console.warn("[WASM] 求解 Worker 不可用，回退主线程", error);
    }
  }

  try {
    await initMainThread();
    debugLog("[WASM] 主线程模块加载成功");
  } catch (error) {
    console.error("[WASM] 模块加载失败:", error);
    throw error;
  }
}

export function isWasmLoaded(): boolean {
  return isInitialized && backend !== null;
}

export async function generateTable(maxDepth: number = 8): Promise<void> {
  requireInitialized();
  try {
    if (backend === "worker") {
      await workerClient!.request("generateTable", { maxDepth });
    } else {
      wasmModule.generate_table(maxDepth);
    }
    tableLoaded = true;
    debugLog(`[WASM] 搜索表生成完成，最大深度: ${maxDepth}`);
  } catch (error) {
    console.error("[WASM] 生成搜索表失败:", error);
    throw error;
  }
}

export async function loadTableFromBytes(data: Uint8Array): Promise<void> {
  requireInitialized();
  try {
    if (backend === "worker") {
      const copy = data.slice();
      await workerClient!.request("loadTable", { buffer: copy.buffer }, [copy.buffer]);
    } else {
      wasmModule.load_table_from_bytes(data);
    }
    tableLoaded = true;
    debugLog("[WASM] 搜索表加载成功");
  } catch (error) {
    console.error("[WASM] 加载搜索表失败:", error);
    throw error;
  }
}

export async function getTableBytes(): Promise<Uint8Array> {
  requireInitialized();
  try {
    const bytes = backend === "worker"
      ? new Uint8Array(await workerClient!.request<ArrayBuffer>("getTableBytes"))
      : new Uint8Array(wasmModule.get_table_bytes());
    debugLog("[WASM] 获取搜索表字节数组成功");
    return bytes;
  } catch (error) {
    console.error("[WASM] 获取搜索表字节数组失败:", error);
    throw error;
  }
}

export function isTableLoaded(): boolean {
  if (!isWasmLoaded()) return false;
  if (backend === "worker") return tableLoaded;
  try {
    tableLoaded = !!wasmModule.is_table_loaded();
    return tableLoaded;
  } catch (error) {
    console.error("[WASM] 检查搜索表状态失败:", error);
    return false;
  }
}

export async function solveMulti(scramble: string, maxSolutions: number = 5): Promise<string[]> {
  requireTable();
  try {
    debugLog(`[WASM] 求开始，状态 ${scramble}`);
    const solutions = backend === "worker"
      ? await workerClient!.request<string[]>("solveMulti", { scramble, maxSolutions })
      : wasmModule.solve_multi(scramble, maxSolutions);
    debugLog(`[WASM] 求解完成，找到 ${solutions.length} 个解法`);
    return solutions;
  } catch (error) {
    console.error("[WASM] 求解失败:", error);
    throw error;
  }
}

export interface XCrossSolution {
  moves: string[];
  slot: string;
  length: number;
}

export async function solveXCross(scramble: string, slot: string, maxSolutions: number = 5): Promise<XCrossSolution[]> {
  requireTable();
  try {
    debugLog(`[WASM] 求解 XCross, 状态 ${scramble}, 槽位 ${slot}`);
    const solutions = backend === "worker"
      ? await workerClient!.request<XCrossSolution[]>("solveXCross", { scramble, slot, maxSolutions })
      : wasmModule.solve_xcross(scramble, slot, maxSolutions);
    debugLog(`[WASM] XCross 求解完成，找到 ${solutions.length} 个解法`);
    return solutions;
  } catch (error) {
    console.error("[WASM] XCross 求解失败:", error);
    throw error;
  }
}

export async function getTableStats(): Promise<Record<string, number>> {
  requireTable();
  try {
    return backend === "worker"
      ? await workerClient!.request<Record<string, number>>("getTableStats")
      : wasmModule.get_table_stats();
  } catch (error) {
    console.error("[WASM] 获取搜索表统计信息失败:", error);
    throw error;
  }
}

function requireInitialized(): void {
  if (!isWasmLoaded()) throw new Error("WASM 模块未初始化");
}

function requireTable(): void {
  requireInitialized();
  if (!isTableLoaded()) throw new Error("搜索表未加载，请先调用 generateTable 或 loadTableFromBytes");
}
