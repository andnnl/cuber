/** 与普通求解完全独立；终止此 Worker 不会打断 Cross／F2L 的求解。 */
export class WideCrossClient {
  private worker: Worker | null = null;
  private sequence = 0;
  private rejectPending: ((error: Error) => void) | null = null;
  private timer: number | null = null;
  private disposed = false;

  request(facelets: string, onStage?: (stage: string) => void): Promise<any> {
    return this.send({ facelets }, onStage);
  }

  score(formulas: string[][]): Promise<any[]> {
    return this.send({ operation: 'score', formulas });
  }

  private send(payload: object, onStage?: (stage: string) => void): Promise<any> {
    if (this.disposed) return Promise.reject(new Error('宽转推荐已关闭'));
    this.cancel();
    const workerUrl = 'cube_cross_wide_worker.js?v=20261020-wide-grip';
    const worker = new Worker(workerUrl, { type: 'module' });
    const id = ++this.sequence;
    this.worker = worker;
    return new Promise((resolve, reject) => {
      this.rejectPending = reject;
      this.timer = setTimeout(() => this.cancel(new Error('宽转搜索超时')), 180000) as unknown as number;
      worker.onmessage = event => {
        if (worker !== this.worker || event.data?.id !== id) return;
        const message = event.data;
        if (message.stage) { onStage?.(message.stage); return; }
        this.clearPending();
        worker.terminate();
        this.worker = null;
        if (message.ok) resolve(message.result);
        else reject(new Error(message.error || '宽转搜索失败'));
      };
      worker.onerror = async event => {
        if (worker !== this.worker) return;
        let detail = event.message || '宽转 Worker 异常';
        if (!event.message) {
          try {
            const response = await fetch(workerUrl);
            if (!response.ok) detail = `宽转 Worker 加载失败 (HTTP ${response.status})，请重启开发服务并刷新页面`;
          } catch { /* 浏览器可能屏蔽 Worker 错误详情，保留通用提示。 */ }
        }
        if (worker === this.worker) this.cancel(new Error(detail));
      };
      worker.postMessage({ id, ...payload });
    });
  }

  private clearPending(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.rejectPending = null;
  }

  cancel(error: Error = new Error('宽转搜索已取消')): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) worker.terminate();
    const reject = this.rejectPending;
    this.clearPending();
    if (reject) reject(error);
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }
}
