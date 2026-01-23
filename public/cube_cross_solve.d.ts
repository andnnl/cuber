/* tslint:disable */
/* eslint-disable */

/**
 * WASM: 生成搜索表
 */
export function generate_table(max_depth: number): void;

/**
 * WASM: 获取搜索表的字节数组
 */
export function get_table_bytes(): Uint8Array;

/**
 * WASM: 获取搜索表统计信息
 */
export function get_table_stats(): any;

/**
 * WASM: 检查搜索表是否已加载
 */
export function is_table_loaded(): boolean;

/**
 * WASM: 从字节数组加载搜索表
 */
export function load_table_from_bytes(data: Uint8Array): void;

/**
 * WASM: 求解底面十字（多解）
 *
 * 支持三种输入格式：
 * 1. 打乱公式字符串，如 "R U R' F"（包含空格）
 * 2. 状态编码（数字字符串），如 "123456789"
 * 3. 完整魔方状态（54个字符），如 "FLDBUFBFLBULFRDRUFDDUBFLRUBFLUDDRDFURRRRLUFLUBBDBBDLRL"
 */
export function solve_multi(scramble: string, max_solutions: number): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly generate_table: (a: number) => [number, number];
    readonly get_table_bytes: () => [number, number, number, number];
    readonly get_table_stats: () => [number, number, number];
    readonly is_table_loaded: () => number;
    readonly load_table_from_bytes: (a: number, b: number) => [number, number];
    readonly solve_multi: (a: number, b: number, c: number) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
