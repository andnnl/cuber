export class SolveRequestCache<T> {
  private entries = new Map<string, Promise<T>>();

  constructor(private readonly capacity: number = 24) {}

  get(key: string, executor: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }

    const request = executor().catch(error => {
      if (this.entries.get(key) === request) {
        this.entries.delete(key);
      }
      throw error;
    });
    this.entries.set(key, request);
    this.trim();
    return request;
  }

  clear(): void {
    this.entries.clear();
  }

  private trim(): void {
    while (this.entries.size > Math.max(1, this.capacity)) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.entries.delete(oldest.value);
    }
  }
}
