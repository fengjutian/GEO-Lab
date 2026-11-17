import { parse } from 'file:///D:/github/GEO-Lab/node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'D:/github/GEO-Lab/src/content/knowledge';
const ids = new Set(readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')));
const mine = ['entity-understanding','knowledge-graph-geo','why-ai-cites-a-site','measuring-geo-effects','ai-readable-content','geo-technical-audit','structured-data'];
const cats = new Set(['基础概念','SEO 与 GEO','AI 搜索原理','RAG 与检索','Embedding 与向量','内容结构','实体与知识图谱','引用与可信度','评估方法']);
const evs = new Set(['official','paper','experiment','analysis','field']);
const tools = new Set(['site-audit','embedding','chunking','rag','entity','schema','content-structure']);

for (const id of mine) {
  const raw = readFileSync(join(dir, id + '.md'), 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) { console.log(id, 'NO FRONTMATTER'); continue; }
  let d;
  try { d = parse(m[1]); } catch (e) { console.log(id, 'YAML ERROR', e.message); continue; }
  const errs = [];
  if (typeof d.title !== 'string' || d.title.length > 120) errs.push('title');
  if (typeof d.description !== 'string' || d.description.length < 20 || d.description.length > 300) errs.push('description-len');
  if (d.summary && d.summary.length > 400) errs.push('summary-len');
  if (!(d.publishDate instanceof Date)) errs.push('publishDate-not-date');
  if (d.updatedDate && !(d.updatedDate instanceof Date)) errs.push('updatedDate-not-date');
  if (d.publishDate instanceof Date && d.updatedDate instanceof Date && d.updatedDate < d.publishDate) errs.push('updated-before-publish');
  if (d.publishDate instanceof Date) {
    const p = d.publishDate.toISOString().slice(0,7);
    if (p !== '2026-09' && p !== '2026-10') errs.push('publish-month:' + p);
  }
  if (!cats.has(d.category)) errs.push('category:' + d.category);
  if (!evs.has(d.evidence)) errs.push('evidence:' + d.evidence);
  if (!Array.isArray(d.tags) || d.tags.length < 3 || d.tags.length > 5) errs.push('tags');
  if (!Array.isArray(d.tools) || d.tools.some((t) => !tools.has(t))) errs.push('tools:' + JSON.stringify(d.tools));
  if (!Array.isArray(d.related) || d.related.some((r) => !ids.has(r) || r === id)) errs.push('related:' + JSON.stringify(d.related));
  if (typeof d.order !== 'number' || d.order < 7 || d.order > 13) errs.push('order');
  if (typeof d.draft !== 'boolean' || typeof d.featured !== 'boolean') errs.push('bool');
  for (const ref of d.references ?? []) {
    if (ref.url && !/^https?:\/\/[^\s]+$/.test(ref.url)) errs.push('ref-url:' + ref.url);
  }
  console.log(id.padEnd(26), errs.length ? 'FAIL ' + errs.join(' | ') : 'OK', 'order=' + d.order, 'cat=' + d.category, 'ev=' + d.evidence, 'tags=' + d.tags.length);
}
