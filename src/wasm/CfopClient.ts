type Pending = {resolve: (result: any) => void; reject: (error: Error) => void; timer: number};
type Channel = {worker: Worker | null; pending: Map<number, Pending>};

export class CfopClient {
  private channels: {[name: string]: Channel} = {
    search: {worker: null, pending: new Map()},
    timeline: {worker: null, pending: new Map()},
  };
  private nextId = 1;
  private disposed = false;

  private worker(name: 'search' | 'timeline'): Worker {
    if (this.disposed) throw new Error('CFOP 求解器已关闭');
    const channel = this.channels[name];
    if (channel.worker) return channel.worker;
    const worker = new Worker(`cfop_${name}_worker.js?v=20261022-xxcross`, {type: 'module'});
    worker.onmessage = event => {
      if (channel.worker !== worker) return;
      const {id, ok, result, error} = event.data || {};
      const pending = channel.pending.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      channel.pending.delete(id);
      if (ok) pending.resolve(result);
      else pending.reject(new Error(error || 'CFOP Worker 异常'));
    };
    worker.onerror = event => this.cancel(new Error(event.message || 'CFOP Worker 异常'));
    channel.worker = worker;
    return worker;
  }

  private request<T>(name: 'search' | 'timeline', message: Record<string, any>, timeout: number): Promise<T> {
    const worker = this.worker(name);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.cancel(new Error('CFOP 搜索超时')), timeout) as unknown as number;
      this.channels[name].pending.set(id, {resolve, reject, timer});
      worker.postMessage({id, ...message});
    });
  }

  search<T>(operation: string, payload: Record<string, any>, timeout = 45000): Promise<T> {
    return this.request<T>('search', {operation, payload}, timeout);
  }

  timeline<T>(input: string, moves: string[]): Promise<T> {
    return this.request<T>('timeline', {input, moves}, 20000);
  }

  cancel(reason: Error = new Error('CFOP 搜索已取消')): void {
    for (const name of ['search', 'timeline']) {
      const channel = this.channels[name];
      channel.worker?.terminate();
      channel.worker = null;
      for (const pending of channel.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(reason);
      }
      channel.pending.clear();
    }
  }

  dispose(): void { this.cancel(); this.disposed = true; }
}
