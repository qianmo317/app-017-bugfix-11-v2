/**
 * 文档持久化：IndexedDB（刷新后文档仍在，需求文档 §12）。
 */
import type { Doc } from '../types';

const DB_NAME = 'braille-studio';
const DB_VERSION = 1;
const STORE = 'docs';

// 连接在整个应用生命周期内复用：每次保存都 open/close 会让连续输入明显卡顿。
let dbPromise: Promise<IDBDatabase> | null = null;

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

// 写操作串行化，保证快速连续保存时按调用顺序落库。
let writeChain: Promise<unknown> = Promise.resolve();

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
  const docs = await withStore<Doc[]>('readonly', (s) => s.getAll() as IDBRequest<Doc[]>);
  // 最近改过的排最前
  return docs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string): Promise<Doc | undefined> {
  return withStore<Doc | undefined>('readonly', (s) => s.get(id) as IDBRequest<Doc | undefined>);
}

export async function saveDoc(doc: Doc): Promise<void> {
  const run = writeChain.then(async () => {
    const existing = await getDoc(doc.id);
    // 以已有记录为底合并，保留 setup / ruleProfile / overrides / confirmed 等全部字段，
    // 再用本次传入值覆盖（含 updatedAt）。
    const merged: Doc = { ...(existing ?? newDoc()), ...doc };
    await withStore('readwrite', (s) => s.put(merged));
  });
  // 链尾不能因单次失败而中断后续写入
  writeChain = run.catch(() => {});
  await run;
}

export async function deleteDoc(id: string): Promise<void> {
  const run = writeChain.then(() => withStore('readwrite', (s) => s.delete(id)));
  writeChain = run.catch(() => {});
  await run;
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
