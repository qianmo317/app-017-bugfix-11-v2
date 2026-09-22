/**
 * 文档持久化：IndexedDB（刷新后文档仍在，需求文档 §12）。
 */
import type { Doc } from '../types';

const DB_NAME = 'braille-studio';
const DB_VERSION = 1;
const STORE = 'docs';

let dbPromise: Promise<IDBDatabase> | null = null;

/** 复用同一个连接，避免每次读写都 open/close（连续输入时开销显著）。 */
function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
    });
  }
  return dbPromise;
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作失败'));
      }),
  );
}

export async function listDocs(): Promise<Doc[]> {
  return withStore<Doc[]>('readonly', (s) => s.getAll() as IDBRequest<Doc[]>);
}

export async function getDoc(id: string): Promise<Doc | undefined> {
  return withStore<Doc | undefined>('readonly', (s) => s.get(id) as IDBRequest<Doc | undefined>);
}

/** 整文档写入：Doc 的全部字段（含 setup / overrides / confirmed / ruleProfile）都必须落库。 */
export async function saveDoc(doc: Doc): Promise<void> {
  await withStore('readwrite', (s) => s.put(doc));
}

export async function deleteDoc(id: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(id));
}

export function newDoc(partial?: Partial<Doc>): Doc {
  return {
    id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    title: '未命名文档',
    raw: '',
    cells: [],
    setup: {
      cellsPerLine: 32,
      linesPerPage: 25,
      doubleSided: false,
      marginMm: { top: 20, left: 15, right: 15 },
    },
    ruleProfile: 'zh-current',
    updatedAt: Date.now(),
    overrides: {},
    confirmed: [],
    ...partial,
  };
}
