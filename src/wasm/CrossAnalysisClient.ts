type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: number };

// Separate from the shared basic solver: cancelling a long search must not kill it.
export class CrossAnalysisClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private disposed = false;

  private ensureWorker(): Worker {
    if (this.disposed) throw new Error('指法推荐已关闭');
    if (this.worker) return this.worker;
    const worker = new Worker('cube_cross_analysis_worker.js?v=20261022-xxcross', { type: 'module' });
    worker.onmessage = event => {
      if (this.worker !== worker) return;
      const message = event.data || {};
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || '求解失败'));
    };
    worker.onerror = event => {
      if (this.worker !== worker) return;
      this.cancel(new Error(event.message || '指法推荐 Worker 异常'));
    };
    this.worker = worker;
    return worker;
  }

  request<T>(operation: string, payload: Record<string, any>, timeout = 180000): Promise<T> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cancel(new Error(`搜索超时：${operation}`));
      }, timeout) as unknown as number;
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, operation, payload });
    });
  }

  cancel(reason: Error = new Error('搜索已取消')): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.pending.clear();
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }
}
