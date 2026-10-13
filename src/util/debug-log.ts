declare const __DEV__: boolean;

export function debugLog(...args: any[]): void {
  if (__DEV__) {
    console.log(...args);
  }
}
