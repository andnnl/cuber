type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: number;
};

export class SolverWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private closed = false;

  constructor(url: string = "cube_cross_worker.js") {
    this.worker = new Worker(url, { type: "module" });
    this.worker.onmessage = event => this.handleMessage(event.data);
    this.worker.onerror = event => {
      this.failAll(new Error(event.message || "求解 Worker 异常"));
    };
    this.worker.onmessageerror = () => {
      this.failAll(new Error("求解 Worker 消息解析失败"));
    };
  }

  request<T>(operation: string, payload: Record<string, any> = {}, transfer: Transferable[] = [], timeout = 120000): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error("求解 Worker 已关闭"));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`求解 Worker 超时: ${operation}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage({ id, operation, payload }, transfer);
      } catch (error) {
        window.clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  terminate(): void {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    this.failAll(new Error("求解 Worker 已终止"));
  }

  private handleMessage(message: any): void {
    const pending = this.pending.get(message && message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    window.clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error || "求解 Worker 请求失败"));
    }
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
