export type BackgroundMode = 'global' | 'custom';

const SCOPES = ['playground', 'director', 'player', 'helper', 'algs', 'f2l', 'crossf2l', 'blecross', 'cfop', 'pll6'];
const GLOBAL_KEY = 'cubeBackground.global';

export function normalize(value: string | null): string | null {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
}

export class BackgroundStore {
  private globalValue: string | null = null;
  private modes: { [scope: string]: BackgroundMode } = {};
  private colors: { [scope: string]: string | null } = {};
  private listeners: (() => void)[] = [];

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    this.reload();
  }

  private scope(value: string): string {
    const scope = value === 'fixedcases' ? 'blecross' : value;
    if (SCOPES.indexOf(scope) < 0) throw new Error(`Unknown background scope: ${value}`);
    return scope;
  }

  private read(key: string): string | null {
    try { return this.storage.getItem(key); } catch (_) { return null; }
  }

  private write(key: string, value: string | null): void {
    try {
      if (value === null) this.storage.removeItem(key);
      else this.storage.setItem(key, value);
    } catch (_) { /* 保留当前会话的内存设置。 */ }
  }

  private notify(): void { this.listeners.slice().forEach(listener => listener()); }

  reload(): void {
    this.globalValue = normalize(this.read(GLOBAL_KEY));
    SCOPES.forEach(scope => {
      const modeKey = `cubeBackground.${scope}.mode`;
      const colorKey = `cubeBackground.${scope}.color`;
      let mode = this.read(modeKey);
      let color = normalize(this.read(colorKey));
      if (scope === 'blecross' && mode === null) {
        const legacy = normalize(this.read('bleBackgroundColor'));
        mode = legacy ? 'custom' : 'global';
        if (legacy) {
          color = legacy;
          this.write(colorKey, legacy);
        }
        this.write(modeKey, mode);
      }
      this.modes[scope] = mode === 'custom' ? 'custom' : 'global';
      this.colors[scope] = color;
    });
    this.notify();
  }

  get globalColor(): string | null { return this.globalValue; }
  mode(scope: string): BackgroundMode { return this.modes[this.scope(scope)]; }
  customColor(scope: string): string | null { return this.colors[this.scope(scope)]; }

  effective(scope: string, fallback: string): string {
    const key = this.scope(scope);
    return (this.modes[key] === 'custom' && this.colors[key]) || this.globalValue || normalize(fallback) || '#FFFFFF';
  }

  setGlobal(color: string | null): void {
    if (color !== null && !normalize(color)) return;
    this.globalValue = normalize(color);
    this.write(GLOBAL_KEY, this.globalValue);
    this.notify();
  }

  setMode(scope: string, mode: BackgroundMode): void {
    if (mode !== 'global' && mode !== 'custom') return;
    const key = this.scope(scope);
    if (mode === 'custom' && this.modes[key] !== 'custom') {
      this.colors[key] = this.effective(key, key === 'cfop' ? '#EEF1F7' : '#FFFFFF');
      this.write(`cubeBackground.${key}.color`, this.colors[key]);
    }
    this.modes[key] = mode;
    this.write(`cubeBackground.${key}.mode`, mode);
    this.notify();
  }

  setCustom(scope: string, color: string): void {
    const value = normalize(color);
    if (!value) return;
    const key = this.scope(scope);
    this.colors[key] = value;
    this.modes[key] = 'custom';
    this.write(`cubeBackground.${key}.color`, value);
    this.write(`cubeBackground.${key}.mode`, 'custom');
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }
}
