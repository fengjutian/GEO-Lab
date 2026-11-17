import { getCollection, type CollectionEntry } from 'astro:content';
import { estimateReadingTime } from '@/lib/utils/format';

type WithDates = { data: { publishDate: Date; draft?: boolean; featured?: boolean } };

const byDateDesc = (a: WithDates, b: WithDates) =>
  b.data.publishDate.getTime() - a.data.publishDate.getTime();

function isPublished(entry: WithDates) {
  // 生产构建过滤草稿；开发环境保留，方便预览。
  return import.meta.env.PROD ? !entry.data.draft : true;
}

/** 知识库按 order → 日期排序，形成一条推荐学习路径。 */
export async function getKnowledge() {
  const entries = await getCollection('knowledge', (entry) => isPublished(entry));
  return entries.sort((a, b) => {
    if (a.data.order !== b.data.order) return a.data.order - b.data.order;
    return byDateDesc(a, b);
  });
}

export async function getResearch() {
  const entries = await getCollection('research', (entry) => isPublished(entry));
  return entries.sort(byDateDesc);
}

export async function getCases() {
  const entries = await getCollection('cases', (entry) => isPublished(entry));
  return entries.sort(byDateDesc);
}

export async function getToolDocs() {
  const entries = await getCollection('tools', (entry) => isPublished(entry));
  return entries.sort((a, b) => a.data.title.localeCompare(b.data.title, 'zh-CN'));
}

export type AnyEntry =
  | CollectionEntry<'knowledge'>
  | CollectionEntry<'research'>
  | CollectionEntry<'cases'>;

export function readingTime(entry: { body?: string; data: { title: string } }): number {
  return estimateReadingTime(entry.body ?? entry.data.title);
}

/** 所有可索引的内容页，用于首页聚合与 RSS。 */
export async function getAllContent(): Promise<
  { entry: AnyEntry; section: 'knowledge' | 'research' | 'cases'; href: string }[]
> {
  const [knowledge, research, cases] = await Promise.all([
    getKnowledge(),
    getResearch(),
    getCases(),
  ]);
  return [
    ...knowledge.map((entry) => ({ entry, section: 'knowledge' as const, href: `/knowledge/${entry.id}/` })),
    ...research.map((entry) => ({ entry, section: 'research' as const, href: `/research/${entry.id}/` })),
    ...cases.map((entry) => ({ entry, section: 'cases' as const, href: `/cases/${entry.id}/` })),
  ].sort((a, b) => b.entry.data.publishDate.getTime() - a.entry.data.publishDate.getTime());
}

export const SECTION_LABELS = {
  knowledge: { label: '知识库', href: '/knowledge/', en: 'Knowledge' },
  research: { label: '技术研究', href: '/research/', en: 'Research' },
  cases: { label: '案例库', href: '/cases/', en: 'Cases' },
} as const;
