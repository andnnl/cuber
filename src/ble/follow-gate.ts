import { LinkEvent } from "./types";

export interface FollowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 只决定实时 MOVE 能否送到当前界面，不保存动作或修改魔方。 */
export class FollowGate {
  private activeMode = "";
  private enabled = new Map<string, boolean>();

  constructor(private readonly storage: FollowStorage) {}

  activate(mode: string): void {
    this.activeMode = mode;
  }

  isEnabled(mode: string): boolean {
    if (!this.enabled.has(mode)) {
      let value: string | null = null;
      try {
        value = this.storage.getItem(`bleFollow:${mode}`);
      } catch {
        // 禁止本地存储的环境仍默认跟随。
      }
      this.enabled.set(mode, value !== "0");
    }
    return this.enabled.get(mode)!;
  }

  setEnabled(mode: string, enabled: boolean): void {
    this.enabled.set(mode, enabled);
    try {
      this.storage.setItem(`bleFollow:${mode}`, enabled ? "1" : "0");
    } catch {
      // 内存中仍保持用户的本次选择。
    }
  }

  accept(mode: string, event: LinkEvent): boolean {
    return mode === this.activeMode && this.isEnabled(mode) && event.type === "move" && !event.recovered;
  }
}
