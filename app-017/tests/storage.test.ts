/**
 * 文档持久化回归测试：改动必须真的落库（需求文档 §12）。
 * 覆盖：整文档字段（页面设置/读音确认/规则档位）写读一致、删除生效、updatedAt 排序依据。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDoc, getDoc, listDocs, newDoc, saveDoc } from '../src/lib/storage';

beforeEach(async () => {
  const all = await listDocs();
  await Promise.all(all.map((d) => deleteDoc(d.id)));
});

describe('文档持久化（IndexedDB）', () => {
  it('保存后重读：页面设置 / 读音覆盖与确认 / 规则档位全部保留', async () => {
    const doc = newDoc({ title: '测试', raw: '长大' });
    await saveDoc(doc);

    const edited = {
      ...doc,
      raw: '长大了的我们',
      setup: { ...doc.setup, cellsPerLine: 20 },
      overrides: { 长: 'chang2' },
      confirmed: ['长'],
      ruleProfile: 'ueb' as const,
      updatedAt: doc.updatedAt + 1000,
    };
    await saveDoc(edited);

    const back = await getDoc(doc.id);
    expect(back?.raw).toBe('长大了的我们');
    expect(back?.setup.cellsPerLine).toBe(20);
    expect(back?.overrides).toEqual({ 长: 'chang2' });
    expect(back?.confirmed).toEqual(['长']);
    expect(back?.ruleProfile).toBe('ueb');
    expect(back?.updatedAt).toBe(doc.updatedAt + 1000);
  });

  it('删除后重读与列表都不再有该文档', async () => {
    const doc = newDoc({ title: '要删掉的' });
    await saveDoc(doc);
    await deleteDoc(doc.id);
    expect(await getDoc(doc.id)).toBeUndefined();
    expect((await listDocs()).some((d) => d.id === doc.id)).toBe(false);
  });

  it('updatedAt 反映最近一次保存，可用于按最近修改排序', async () => {
    const a = newDoc({ title: 'A' });
    const b = newDoc({ title: 'B' });
    await saveDoc(a);
    await saveDoc(b);
    // 之后再次编辑 A：A 应排到最前
    await saveDoc({ ...a, raw: '改动过', updatedAt: b.updatedAt + 5000 });
    const sorted = [...(await listDocs())].sort((x, y) => y.updatedAt - x.updatedAt);
    expect(sorted[0].id).toBe(a.id);
    expect(sorted[0].raw).toBe('改动过');
  });
});
