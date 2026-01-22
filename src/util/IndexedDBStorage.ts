const DB_NAME = 'CubeCrossSolverDB';
const DB_VERSION = 1;
const STORE_NAME = 'cross_table';

export class IndexedDBStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`IndexedDB 打开失败: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] 数据库打开成功');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('[IndexedDB] 对象存储创建成功');
        }
      };
    });
  }

  async saveTable(tableBytes: Uint8Array): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.put({
        id: 'cross_table_bytes',
        data: tableBytes,
        timestamp: Date.now(),
      });

      request.onerror = () => {
        reject(new Error(`保存搜索表失败: ${request.error}`));
      };

      request.onsuccess = () => {
        console.log('[IndexedDB] 搜索表保存成功');
        resolve();
      };
    });
  }

  async loadTable(): Promise<Uint8Array | null> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get('cross_table_bytes');

      request.onerror = () => {
        reject(new Error(`加载搜索表失败: ${request.error}`));
      };

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log('[IndexedDB] 搜索表加载成功');
          resolve(result.data as Uint8Array);
        } else {
          console.log('[IndexedDB] 未找到缓存的搜索表');
          resolve(null);
        }
      };
    });
  }

  async clearTable(): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.delete('cross_table_bytes');

      request.onerror = () => {
        reject(new Error(`清除搜索表失败: ${request.error}`));
      };

      request.onsuccess = () => {
        console.log('[IndexedDB] 搜索表清除成功');
        resolve();
      };
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[IndexedDB] 数据库关闭成功');
    }
  }
}

export const indexedDBStorage = new IndexedDBStorage();
