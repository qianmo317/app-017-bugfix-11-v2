import { useCallback, useEffect, useState } from 'react';
import type { Doc } from '../types';
import { listDocs, saveDoc, deleteDoc, newDoc } from '../lib/storage';
import { navigate } from '../router';

export default function HomePage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [failingId, setFailingId] = useState<string | null>(null);

  const refresh = useCallback(() => listDocs().then(setDocs), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const createDoc = () => {
    const doc = newDoc({ title: `文档 ${new Date().toLocaleDateString('zh-CN')}` });
    saveDoc(doc).then(() => navigate(`/editor/${doc.id}`));
  };

  const remove = async (id: string) => {
    // 乐观删除：先从列表移除，落库失败再刷新回滚
    const previous = docs;
    setDocs((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
    try {
      await deleteDoc(id);
      setFailingId(null);
    } catch {
      setFailingId(id);
      setDocs(previous);
    }
  };

  return (
    <div>
      <h1>最近文档</h1>
      <p className="row">
        <button type="button" className="primary" onClick={createDoc}>
          ＋ 新建盲文文档
        </button>
        <button type="button" onClick={() => navigate('/library')}>从模板新建</button>
      </p>
      {docs === null ? (
        <p>加载中…</p>
      ) : docs.length === 0 ? (
        <p>还没有文档。点「新建盲文文档」开始，或从模板库选择一个模板。</p>
      ) : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li className="doc-item" key={d.id}>
              <a
                href={`/editor/${d.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/editor/${d.id}`);
                }}
              >
                {d.title}
              </a>
              <span className="meta">
                {new Date(d.updatedAt).toLocaleString('zh-CN')} · {d.setup.cellsPerLine}方×{d.setup.linesPerPage}行
              </span>
              <button type="button" onClick={() => navigate(`/editor/${d.id}`)}>
                打开
              </button>
              <button type="button" className="danger" onClick={() => remove(d.id)} aria-label={`删除 ${d.title}`}>
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
      {failingId && (
        <p className="violation-item" role="alert">
          删除失败，请重试。
        </p>
      )}
      <section style={{ marginTop: 24 }}>
        <h2>这是什么？</h2>
        <p>
          把一段汉字 / 拼音 / 数字 / 英文转换为规范的现行汉语盲文，按盲文纸 32 方 × 25 行分页排版，
          直接输出可打印的点阵图（SVG/PNG）或供盲文打字机使用的 BRF 文件。
          多音字会列出候选并要求确认，绝不静默猜测。
        </p>
      </section>
    </div>
  );
}
