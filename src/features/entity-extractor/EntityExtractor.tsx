import { useMemo, useState } from 'react';
import { WorkbenchShell, Panel, Metric, Note } from '@/features/shared/ui';
import { countChars } from '@/features/shared/text';

const TECH_TERMS = [
  'Generative Engine Optimization', 'GEO', 'SEO', 'AEO', 'RAG', 'LLM', 'LLMs', 'Embedding',
  'BM25', 'JSON-LD', 'schema.org', 'Knowledge Graph', 'vector database', 'Vector Database',
  'reranking', 'Reranking', 'chunking', 'Chunking', 'citation', 'Citation', 'context window',
  '检索增强生成', '生成式引擎优化', '知识图谱', '向量数据库', '嵌入', '重排', '上下文窗口',
  '结构化数据', '实体消歧', '语义检索',
];

const ORG_SUFFIX = /([\u4e00-\u9fffA-Za-z0-9·（）()\-]{2,20})(公司|集团|研究院|研究所|实验室|大学|学院|基金会|协会|委员会|中心|工作室|科技|Inc\.|Ltd\.|LLC|University|Institute|Lab|Foundation)/g;
const EN_PROPER = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/g;
const TITLE_PERSON = /(?:作者|创始[人者]|CEO|CTO|研究员|教授|博士|由)\s*([\u4e00-\u9fff]{2,4}|[A-Z][a-z]+\s[A-Z][a-z]+)/g;
const URL_PATTERN = /https?:\/\/[^\s)）"'<>]+/g;
const YEAR_PATTERN = /\b(19|20)\d{2}\b/g;

const VAGUE_REFERENCES = ['它', '这个', '那个', '该公司', '他', '她', '其', '这些', '那些'];

type EntityGroup = 'organization' | 'person' | 'technology' | 'link' | 'date';

const GROUP_LABELS: Record<EntityGroup, string> = {
  organization: '组织 / 品牌',
  person: '人物',
  technology: '技术与术语',
  link: '外部链接',
  date: '时间',
};

type Found = { text: string; group: EntityGroup; count: number };

function extract(text: string): Found[] {
  const map = new Map<string, Found>();
  const push = (raw: string, group: EntityGroup) => {
    const value = raw.trim().replace(/[，。；：、\s]+$/g, '');
    if (value.length < 2) return;
    const key = `${group}:${value.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { text: value, group, count: 1 });
  };

  for (const match of text.matchAll(ORG_SUFFIX)) push(match[0], 'organization');
  for (const match of text.matchAll(TITLE_PERSON)) push(match[1], 'person');
  for (const match of text.matchAll(URL_PATTERN)) push(match[0], 'link');
  for (const match of text.matchAll(YEAR_PATTERN)) push(match[0], 'date');

  const lower = text.toLowerCase();
  for (const term of TECH_TERMS) {
    if (lower.includes(term.toLowerCase())) push(term, 'technology');
  }

  // 英文专有名词：排除句首常见词与已识别技术术语
  const skip = new Set(['The', 'This', 'That', 'These', 'Those', 'When', 'What', 'How', 'Why', 'In', 'For', 'And', 'But', 'If', 'It', 'A', 'An']);
  for (const match of text.matchAll(EN_PROPER)) {
    const candidate = match[1];
    if (skip.has(candidate)) continue;
    if (TECH_TERMS.some((term) => term.toLowerCase() === candidate.toLowerCase())) continue;
    if (candidate.split(/\s+/).length === 1 && candidate.length < 3) continue;
    push(candidate, 'organization');
  }

  return [...map.values()].sort((a, b) => b.count - a.count || b.text.length - a.text.length);
}

const SAMPLE = `GEO Lab（生成式引擎优化实验室）由研究团队在 2026 年建立，研究方向是生成式引擎优化与 AI 搜索。

团队分析了 Google 与 OpenAI 的公开文档，并用 schema.org 的 Organization 与 Article 类型标注本站页面。研究表明，检索系统更依赖片段的自洽性，而不是关键词密度：一份由 Aggarwal 等人在 2024 年发表的论文将 GEO 形式化为针对生成式引擎的优化问题。

在实现层面，内容团队使用 JSON-LD 描述作者与组织，并通过 sameAs 指向 GitHub 主页。向量检索部分使用开源嵌入模型，配合 BM25 做混合召回。`;

export default function EntityExtractor() {
  const [text, setText] = useState(SAMPLE);

  const entities = useMemo(() => extract(text), [text]);
  const grouped = useMemo(() => {
    const groups: Record<EntityGroup, Found[]> = {
      organization: [],
      person: [],
      technology: [],
      link: [],
      date: [],
    };
    for (const entity of entities) groups[entity.group].push(entity);
    return groups;
  }, [entities]);

  const vagueCounts = useMemo(
    () =>
      VAGUE_REFERENCES.map((word) => ({
        word,
        count: (text.match(new RegExp(word, 'g')) ?? []).length,
      })).filter((item) => item.count > 0),
    [text],
  );

  const totalVague = vagueCounts.reduce((sum, item) => sum + item.count, 0);
  const chars = countChars(text);
  const density = chars ? (entities.reduce((sum, item) => sum + item.count, 0) / chars) * 100 : 0;
  const hasDefinition = /(是指|指的是|定义为|定义为|是一种|is defined as)/.test(text);
  const hasSameAs = /sameAs/.test(text);
  const hasAuthor = /(作者|Author|作者简介)/.test(text);

  const checks = [
    { label: '包含明确的定义句', ok: hasDefinition, hint: '“X 是指 …”让解析器抓到主题实体' },
    { label: '标注组织与品牌名称', ok: grouped.organization.length > 0, hint: '组织实体应与 sameAs / JSON-LD 一致' },
    { label: '出现可识别的作者信息', ok: hasAuthor || grouped.person.length > 0, hint: '作者是可信度信号之一' },
    { label: '包含 sameAs 或外部身份链接', ok: hasSameAs || grouped.link.length > 0, hint: '帮助系统把实体与已知知识对齐' },
    { label: '代词指代数量可控', ok: totalVague <= Math.max(3, chars / 120), hint: '过多“它/该公司”会让片段脱离上下文后无法理解' },
  ];

  return (
    <WorkbenchShell>
      <Panel title="待分析文本" hint={`${chars} 字 · ${entities.length} 个实体`}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          className="workbench-input resize-y text-[12px] leading-relaxed"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setText(SAMPLE)}
            className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60 hover:text-white"
          >
            恢复示例文本
          </button>
          <button
            type="button"
            onClick={() => setText('')}
            className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60 hover:text-white"
          >
            清空
          </button>
        </div>
      </Panel>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Metric label="实体总数" value={entities.length} />
        <Metric label="组织 / 品牌" value={grouped.organization.length} />
        <Metric label="技术术语" value={grouped.technology.length} />
        <Metric label="实体密度" value={density.toFixed(1)} unit="/100字" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="识别结果" hint="规则 + 词表，非 NER 模型">
          <div className="space-y-4">
            {(Object.keys(grouped) as EntityGroup[]).map((group) =>
              grouped[group].length > 0 ? (
                <div key={group}>
                  <p className="workbench-label">{GROUP_LABELS[group]}</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {grouped[group].slice(0, 24).map((entity) => (
                      <li
                        key={entity.text}
                        className={`rounded border px-2 py-0.5 text-[11px] ${
                          group === 'technology'
                            ? 'border-brand-400/30 bg-brand-400/10 text-brand-100'
                            : group === 'organization'
                              ? 'border-accent-300/30 bg-accent-500/10 text-accent-100'
                              : 'border-white/15 bg-white/5 text-white/70'
                        }`}
                        title={`出现 ${entity.count} 次`}
                      >
                        {entity.text}
                        {entity.count > 1 && (
                          <span className="ml-1 font-mono text-[9px] text-white/35">×{entity.count}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
            {entities.length === 0 && <p className="text-xs text-white/40">没有识别到实体，检查文本是否过短。</p>}
          </div>
        </Panel>

        <Panel title="实体覆盖检查">
          <ul className="space-y-2.5">
            {checks.map((check) => (
              <li key={check.label} className="flex gap-2">
                <span
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] ${
                    check.ok ? 'bg-emerald-400/20 text-emerald-300' : 'bg-rose-400/15 text-rose-300'
                  }`}
                  aria-hidden="true"
                >
                  {check.ok ? '✓' : '!'}
                </span>
                <span>
                  <span className={`text-[12px] ${check.ok ? 'text-white/80' : 'text-white/90'}`}>
                    {check.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-relaxed text-white/40">{check.hint}</span>
                </span>
              </li>
            ))}
          </ul>
          {vagueCounts.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="workbench-label">指代词</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {vagueCounts.map((item) => (
                  <span key={item.word} className="font-mono text-[10px] text-white/50">
                    {item.word}×{item.count}
                  </span>
                ))}
              </p>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Note tone="warn">
          这是基于规则与词表的演示，不是命名实体识别模型。它会漏掉长尾专有名词，也会把普通英文大写词误判为组织。
          真实生产环境应使用带领域词表的 NER 模型，并结合 JSON-LD 中的 Organization / Person 声明做交叉校验。
        </Note>
      </div>
    </WorkbenchShell>
  );
}
