let wasmModule: any = null;
let isInitialized = false;

export async function initWasm(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    const wasm: any = (window as any).cube_cross_solve;
    if (!wasm) {
      throw new Error('WASM 模块未找到，请确保在 HTML 中正确加载了 cube_cross_solve.js');
    }

    await wasm.default();
    wasmModule = wasm;
    isInitialized = true;
    console.log('[WASM] 模块加载成功');
  } catch (error) {
    console.error('[WASM] 模块加载失败:', error);
    throw error;
  }
}

export function isWasmLoaded(): boolean {
  return isInitialized && wasmModule !== null;
}

export async function generateTable(maxDepth: number = 8): Promise<void> {
  if (!isWasmLoaded()) {
    throw new Error('WASM 模块未初始化');
  }

  try {
    await wasmModule.generate_table(maxDepth);
    console.log(`[WASM] 搜索表生成完成，最大深度: ${maxDepth}`);
  } catch (error) {
    console.error('[WASM] 生成搜索表失败:', error);
    throw error;
  }
}

export async function loadTableFromBytes(data: Uint8Array): Promise<void> {
  if (!isWasmLoaded()) {
    throw new Error('WASM 模块未初始化');
  }

  try {
    await wasmModule.load_table_from_bytes(data);
    console.log('[WASM] 搜索表加载成功');
  } catch (error) {
    console.error('[WASM] 加载搜索表失败:', error);
    throw error;
  }
}

export async function getTableBytes(): Promise<Uint8Array> {
  if (!isWasmLoaded()) {
    throw new Error('WASM 模块未初始化');
  }

  try {
    const bytes = await wasmModule.get_table_bytes();
    console.log('[WASM] 获取搜索表字节数组成功');
    return bytes;
  } catch (error) {
    console.error('[WASM] 获取搜索表字节数组失败:', error);
    throw error;
  }
}

export function isTableLoaded(): boolean {
  if (!isWasmLoaded()) {
    return false;
  }

  try {
    return wasmModule.is_table_loaded();
  } catch (error) {
    console.error('[WASM] 检查搜索表状态失败:', error);
    return false;
  }
}

export async function solveMulti(scramble: string, maxSolutions: number = 5): Promise<string[]> {
  if (!isWasmLoaded()) {
    throw new Error('WASM 模块未初始化');
  }

  if (!isTableLoaded()) {
    throw new Error('搜索表未加载，请先调用 generateTable 或 loadTableFromBytes');
  }

  try {
    console.log(`[WASM] 求开始，状态 ${scramble}`);
    const solutions = await wasmModule.solve_multi(scramble, maxSolutions);
    console.log(`[WASM] 求解完成，找到 ${solutions.length} 个解法`);
    return solutions;
  } catch (error) {
    console.error('[WASM] 求解失败:', error);
    throw error;
  }
}

export async function getTableStats(): Promise<Record<string, number>> {
  if (!isWasmLoaded()) {
    throw new Error('WASM 模块未初始化');
  }

  if (!isTableLoaded()) {
    throw new Error('搜索表未加载');
  }

  try {
    const stats = await wasmModule.get_table_stats();
    console.log('[WASM] 获取搜索表统计信息成功');
    return stats;
  } catch (error) {
    console.error('[WASM] 获取搜索表统计信息失败:', error);
    throw error;
  }
}
