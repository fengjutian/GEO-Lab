import { useMemo, useState } from 'react';
import { WorkbenchShell, Panel, Metric, Bar, Note } from '@/features/shared/ui';
import { bm25Rank, estimateTokens, splitSentences, tokenize, type Doc } from '@/features/shared/text';

const CORPUS: Doc[] = [
  {
    id: 'geo-def',
    title: 'GEO 的定义与目标',
    source: 'GEO Lab 知识库示例',
    text: 'GEO（Generative Engine Optimization）指针对生成式搜索系统优化内容，使其更容易被检索、理解并在答案中被引用。它把优化目标从排名位置改成被引用概率与引用质量。',
  },
  {
    id: 'rag-flow',
    title: 'RAG 的基本流程',
    source: 'GEO Lab 知识库示例',
    text: 'RAG 先对文档做切分与向量化并建立索引。收到查询后，系统在索引中召回候选片段，经过重排后把片段拼接进上下文窗口，模型再基于这些片段生成答案，并在输出中标注来源。',
  },
  {
    id: 'chunking',
    title: '切分对检索的影响',
    source: 'GEO Lab 知识库示例',
    text: '检索发生在 chunk 级别。过小的块会丢失上下文，过大的块会稀释相关性信号。按标题层级与段落边界切分，通常比固定字数窗口更能保持论证完整，代价是块长度不一致。',
  },
  {
    id: 'citation',
    title: '答案为什么标注来源',
    source: 'GEO Lab 知识库示例',
    text: '生成式答案标注来源有两个作用：让用户核验事实，降低模型幻觉带来的风险；也让内容生产者的贡献可被追踪。引用与否取决于片段是否被检索到、是否足够自洽，以及来源的可信度信号。',
  },
  {
    id: 'entity',
    title: '实体与知识图谱',
    source: 'GEO Lab 知识库示例',
    text: '实体是页面中被明确指称的对象，如组织、人物、产品。页面应通过全称、简称与 sameAs 链接消歧。知识图谱把实体与关系结构化，帮助系统判断页面属于哪个领域、与哪些已知实体相关。',
  },
  {
    id: 'schema',
    title: '结构化数据的作用边界',
    source: 'GEO Lab 知识库示例',
    text: 'JSON-LD 用 schema.org 词汇描述页面实体，帮助解析器确认作者、发布时间与组织归属。它是可理解性的辅助信号，不是引用保证。缺失结构化数据通常不是致命问题，错误的结构化数据反而会造成实体冲突。',
  },
  {
    id: 'measure',
    title: '可见性如何测量',
    source: 'GEO Lab 知识库示例',
    text: '测量 AI 可见性需要固定问题集、记录模型版本与查询时间，并区分提及率、引用率、引用位置与答案准确率。单次查询结果不稳定，需要重复观测并控制个性化与地域差异。',
  },
  {
    id: 'nongeo',
    title: '关于关键词密度',
    source: 'GEO Lab 知识库示例',
    text: '关键词密度是早期搜索引擎的重要信号，现代检索系统更多依赖语义匹配与链接结构。机械堆叠关键词不会提升生成式搜索中的被引用概率，还可能损害可读性。',
  },
];

type Stage = { title: string; detail: string };

const STAGES: Stage[] = [
  { title: '查询解析', detail: '分词、去停用词、得到检索词元' },
  { title: '片段召回', detail: 'BM25 在 chunk 级打分取前 K' },
  { title: '重排', detail: '结合词元覆盖率与段落位置重新排序' },
  { title: '上下文构建', detail: '在 token 预算内拼接片段' },
  { title: '生成与引用', detail: '抽取式摘要 + 来源编号' },
];

export default function RagPlayground() {
  const [query, setQuery] = useState('GEO 和 SEO 有什么区别，AI 为什么会引用某些网站？');
  const [topK, setTopK] = useState(4);
  const [budget, setBudget] = useState(600);

  const result = useMemo(() => {
    const terms = [...new Set(tokenize(query))];
    const hits = bm25Rank(query, CORPUS, { limit: 6 });
    const recall = hits.slice(0, topK);

    const reranked = recall
      .map((hit) => {
        const sentences = splitSentences(hit.doc.text);
        const coverage = terms.length ? hit.matched.length / terms.length : 0;
        const firstSentenceBoost = sentences.length > 0 && sentences[0].length > 0 ? 0.05 : 0;
        return { ...hit, rerank: hit.score * (0.6 + coverage) + firstSentenceBoost };
      })
      .sort((a, b) => b.rerank - a.rerank);

    const context: { id: string; title: string; source: string; text: string; tokens: number }[] = [];
    let used = 0;
    for (const hit of reranked) {
      const tokens = estimateTokens(hit.doc.text);
      if (used + tokens > budget) continue;
      context.push({ ...hit.doc, tokens });
      used += tokens;
      if (context.length >= 3) break;
    }

    const answerParts: { text: string; citation: number }[] = [];
    context.forEach((doc, docIndex) => {
      const sentences = splitSentences(doc.text)
        .map((sentence) => ({
          sentence,
          overlap: tokenize(sentence).filter((token) => terms.includes(token)).length,
        }))
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, 1);
      for (const part of sentences) {
        if (part.overlap === 0) return;
        answerParts.push({ text: part.sentence, citation: docIndex + 1 });
      }
    });

    return { terms, hits, recall, reranked, context, used, answerParts };
  }, [query, topK, budget]);

  const maxScore = result.reranked[0]?.score ?? 1;

  return (
    <WorkbenchShell>
      <Panel title="查询" hint="在 8 条内置语料上演示">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="workbench-input flex-1"
            placeholder="输入一个问题，例如：GEO 为什么需要结构化数据？"
            aria-label="检索问题"
          />
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-white/50">
              topK
              <input
                type="range"
                min={1}
                max={6}
                value={topK}
                onChange={(event) => setTopK(Number(event.target.value))}
                className="w-16 accent-[var(--color-brand-400)]"
              />
              <span className="w-3 font-mono text-white/80">{topK}</span>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-white/50">
              预算
              <input
                type="range"
                min={200}
                max={1200}
                step={50}
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value))}
                className="w-16 accent-[var(--color-accent-500)]"
              />
              <span className="w-8 font-mono text-white/80">{budget}</span>
            </label>
          </div>
        </div>
      </Panel>

      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {STAGES.map((stage, index) => (
          <li key={stage.title} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <span className="font-mono text-[10px] text-brand-300">{String(index + 1).padStart(2, '0')}</span>
            <p className="mt-1 text-[12px] font-medium text-white/90">{stage.title}</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-white/45">{stage.detail}</p>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="召回与重排" hint={`${result.recall.length} 条候选`}>
          <div className="mb-3 flex flex-wrap gap-1">
            {result.terms.slice(0, 16).map((term) => (
              <span
                key={term}
                className="rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[10px] text-white/60"
              >
                {term}
              </span>
            ))}
          </div>
          <ul className="space-y-2">
            {result.reranked.map((hit, index) => (
              <li key={hit.doc.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] text-white/85">
                    {index + 1}. {hit.doc.title}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-white/45">
                    {hit.score.toFixed(2)} → {hit.rerank.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar value={hit.score} max={maxScore} />
                </div>
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {hit.matched.slice(0, 6).map((term) => (
                    <span key={term} className="font-mono text-[9px] text-brand-300">
                      {term}
                    </span>
                  ))}
                </p>
              </li>
            ))}
            {result.reranked.length === 0 && (
              <li className="text-xs text-white/40">没有命中任何片段，试着换一个与语料相关的问题。</li>
            )}
          </ul>
        </Panel>

        <div className="space-y-4">
          <Panel title="上下文窗口" hint={`${result.used}/${budget} token`}>
            {result.context.length > 0 ? (
              <ol className="space-y-2">
                {result.context.map((doc, index) => (
                  <li key={doc.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] text-brand-200">
                        [{index + 1}] {doc.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-white/35">{doc.tokens} tok</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/60">{doc.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-white/40">token 预算不足，未能装配上下文。调高预算试试。</p>
            )}
          </Panel>

          <Panel title="生成结果" hint="抽取式，非真实模型">
            {result.answerParts.length > 0 ? (
              <p className="text-[13px] leading-relaxed text-white/85">
                {result.answerParts.map((part, index) => (
                  <span key={index}>
                    {part.text}
                    <sup className="ml-0.5 font-mono text-[9px] text-accent-300">[{part.citation}]</sup>{' '}
                  </span>
                ))}
              </p>
            ) : (
              <p className="text-xs text-white/40">没有可抽取的句子。命中片段为空或预算过低。</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric label="引用来源" value={result.answerParts.length} unit="条" />
              <Metric
                label="上下文占用"
                value={Math.round((result.used / budget) * 100)}
                unit="%"
                tone={result.used / budget > 0.9 ? 'warn' : 'default'}
              />
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <Note tone="warn">
          本演示不调用大模型：答案是从检索命中片段里抽取的句子，用于说明“引用是怎么产生的”。
          真实 RAG 系统中，模型可能忽略片段、错误归因，甚至生成片段中不存在的内容 —— 这正是需要引用与核验的原因。
        </Note>
      </div>
    </WorkbenchShell>
  );
}
