/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const generate_table: (a: number) => [number, number];
export const get_table_bytes: () => [number, number, number, number];
export const get_table_stats: () => [number, number, number];
export const is_table_loaded: () => number;
export const load_table_from_bytes: (a: number, b: number) => [number, number];
export const solve_multi: (a: number, b: number, c: number) => [number, number, number];
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
