/* tslint:disable */
/* eslint-disable */
/**
* WASM: 从字节数组加载搜索表
* @param {Uint8Array} data
*/
export function load_table_from_bytes(data: Uint8Array): void;
/**
* WASM: 获取搜索表的字节数组
* @returns {Uint8Array}
*/
export function get_table_bytes(): Uint8Array;
/**
* WASM: 生成搜索表
* @param {number} max_depth
*/
export function generate_table(max_depth: number): void;
/**
* WASM: 求解底面十字（多解）
*
* 支持三种输入格式：
* 1. 打乱公式字符串，如 "R U R' F"（包含空格）
* 2. 状态编码（数字字符串），如 "123456789"
* 3. 完整魔方状态（54个字符），如 "FLDBUFBFLBULFRDRUFDDUBFLRUBFLUDDRDFURRRRLUFLUBBDBBDLRL"
* @param {string} scramble
* @param {number} max_solutions
* @returns {any}
*/
export function solve_multi(scramble: string, max_solutions: number): any;
/**
* WASM: 检查搜索表是否已加载
* @returns {boolean}
*/
export function is_table_loaded(): boolean;
/**
* WASM: 获取搜索表统计信息
* @returns {any}
*/
export function get_table_stats(): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly generate_table: (a: number, b: number) => void;
  readonly get_table_bytes: (a: number) => void;
  readonly get_table_stats: (a: number) => void;
  readonly is_table_loaded: () => number;
  readonly load_table_from_bytes: (a: number, b: number, c: number) => void;
  readonly solve_multi: (a: number, b: number, c: number, d: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
