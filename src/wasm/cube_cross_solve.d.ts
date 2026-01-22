declare module '/cube_cross_solve.js' {
  export default function(): Promise<void>;
  export function generate_table(max_depth: number): Promise<void>;
  export function load_table_from_bytes(data: Uint8Array): Promise<void>;
  export function get_table_bytes(): Promise<Uint8Array>;
  export function is_table_loaded(): boolean;
  export function solve_multi(scramble: string, max_solutions: number): Promise<string[][]>;
  export function get_table_stats(): Promise<Record<string, number>>;
}

declare module '*?cube_cross_solve' {
  const value: any;
  export default value;
}

declare module '*?cube_cross_solve.js' {
  const value: any;
  export default value;
}

declare module 'cube_cross_solve.js' {
  export default function(): Promise<void>;
  export function generate_table(max_depth: number): Promise<void>;
  export function load_table_from_bytes(data: Uint8Array): Promise<void>;
  export function get_table_bytes(): Promise<Uint8Array>;
  export function is_table_loaded(): boolean;
  export function solve_multi(scramble: string, max_solutions: number): Promise<string[][]>;
  export function get_table_stats(): Promise<Record<string, number>>;
}
