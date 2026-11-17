import { useMemo, useState } from 'react';
import { WorkbenchShell, Panel, Metric, Bar, Note } from '@/features/shared/ui';
import { countChars, splitParagraphs, splitSentences, estimateTokens } from '@/features/shared/text';

const SAMPLE = `## GEO 的核心判断

GEO 的目标不是让页面“被 AI 喜欢”，而是让内容在检索与生成链路中更容易被选中和引用。这需要三个条件：页面可被抓取、内容可被理解、来源可被信任。

## 为什么结构比修辞重要

生成式引擎通常以片段为单位检索内容。一段脱离上下文就无法理解的论证，即使写得再好，也很难被单独摘取。

- 结论先行：每节开头用一句话给出判断
- 一段一意：避免一个段落同时讨论三个主题
- 数据带来源：给出年份、机构与链接

## 可摘取的片段长什么样

以下两种写法，检索系统更容易处理第一种：

1. “GEO 在 2024 年被形式化为针对生成式引擎的优化问题（Aggarwal 等，KDD 2024）。”
2. “随着时代的发展，越来越多的企业开始意识到 GEO 的重要性……”

第一种包含实体、时间、来源与结论；第二种只有语气。`;

type Check = {
  id: string;
  label: string;
  detail: string;
  pass: boolean;
  weight: number;
};

export default function ContentAnalyzer() {
  const [text, setText] = useState(SAMPLE);

  const analysis = useMemo(() => {
    const paragraphs = splitParagraphs(text);
    const sentences = splitSentences(text);
    const chars = countChars(text);
    const headings = (text.match(/^#{2,4}\s.+$/gm) ?? []).length;
    const lists = (text.match(/^(\s*)([-*+]|\d+\.)\s/gm) ?? []).length;
    const tables = (text.match(/^\|.+\|$/gm) ?? []).length;
    const links = (text.match(/https?:\/\/[^\s)）]+/g) ?? []).length;
    const numbers = (text.match(/\b\d+(\.\d+)?%?\b/g) ?? []).length;
    const questionHeadings = (text.match(/^#{2,4}\s.*[？?]\s*$/gm) ?? []).length;
    const averageParagraph = paragraphs.length ? Math.round(chars / paragraphs.length) : 0;
    const averageSentence = sentences.length ? Math.round(chars / sentences.length) : 0;
    const longParagraphs = paragraphs.filter((paragraph) => countChars(paragraph) > 220).length;
    const longSentences = sentences.filter((sentence) => countChars(sentence) > 90).length;

    const checks: Check[] = [
      {
        id: 'headings',
        label: '有 2 个以上二级标题',
        detail: '标题层级是检索系统识别主题边界的首要结构信号。',
        pass: headings >= 2,
        weight: 18,
      },
      {
        id: 'paragraph',
        label: '平均段落不超过 200 字',
        detail: '过长的段落难以被切成自洽片段。',
        pass: averageParagraph > 0 && averageParagraph <= 200,
        weight: 14,
      },
      {
        id: 'sentence',
        label: '平均句长不超过 60 字',
        detail: '句子是抽取式答案的最小单位。',
        pass: averageSentence > 0 && averageSentence <= 60,
        weight: 12,
      },
      {
        id: 'list',
        label: '包含列表或表格',
        detail: '结构化表达更容易被整段摘取。',
        pass: lists >= 3 || tables >= 3,
        weight: 14,
      },
      {
        id: 'evidence',
        label: '包含数字或来源链接',
        detail: '可核验的事实显著提升片段可信度。',
        pass: numbers > 0 || links > 0,
        weight: 14,
      },
      {
        id: 'question',
        label: '有小节直接回答一个问题',
        detail: '问句式标题与用户查询的意图更接近。',
        pass: questionHeadings >= 1 || headings >= 3,
        weight: 10,
      },
      {
        id: 'length',
        label: '正文长度在 600-4000 字之间',
        detail: '过短缺少信息量，过长难以维持单一主题。',
        pass: chars >= 600 && chars <= 4000,
        weight: 10,
      },
      {
        id: 'no-long-blocks',
        label: '没有超长段落',
        detail: '超过 220 字的段落建议拆分。',
        pass: longParagraphs === 0,
        weight: 8,
      },
    ];

    const score = checks.reduce((sum, check) => sum + (check.pass ? check.weight : 0), 0);

    return {
      chars,
      tokens: estimateTokens(text),
      paragraphs: paragraphs.length,
      sentences: sentences.length,
      headings,
      lists,
      tables: Math.floor(tables / 1),
      links,
      numbers,
      averageParagraph,
      averageSentence,
      longParagraphs,
      longSentences,
      checks,
      score,
    };
  }, [text]);

  const grade =
    analysis.score >= 85
      ? { label: '结构良好', tone: 'good' as const }
      : analysis.score >= 60
        ? { label: '可改进', tone: 'warn' as const }
        : { label: '结构薄弱', tone: 'bad' as const };

  return (
    <WorkbenchShell>
      <Panel title="内容" hint={`${analysis.chars} 字 · 约 ${analysis.tokens} token`}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={10}
          className="workbench-input resize-y text-[12px] leading-relaxed"
          placeholder="粘贴文章正文（支持 Markdown 标题、列表、表格）"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setText(SAMPLE)}
            className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60 hover:text-white"
          >
            恢复示例
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

      <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="段落" value={analysis.paragraphs} />
        <Metric label="句子" value={analysis.sentences} />
        <Metric label="小节" value={analysis.headings} />
        <Metric label="平均段长" value={analysis.averageParagraph} unit="字" />
        <Metric label="平均句长" value={analysis.averageSentence} unit="字" />
        <Metric label="评分" value={analysis.score} unit="/100" tone={grade.tone} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel title="结构评分" hint={grade.label}>
          <Bar value={analysis.score} max={100} tone="accent" />
          <ul className="mt-4 space-y-3">
            {analysis.checks.map((check) => (
              <li key={check.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[12px] ${check.pass ? 'text-white/80' : 'text-white/90'}`}>
                    {check.pass ? '✓ ' : '! '}
                    {check.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-white/35">{check.weight}</span>
                </div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-white/40">{check.detail}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-4">
          <Panel title="构成">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="列表项" value={analysis.lists} />
              <Metric label="表格行" value={analysis.tables} />
              <Metric label="外链" value={analysis.links} />
              <Metric label="数字表达" value={analysis.numbers} />
            </div>
          </Panel>

          <Panel title="可以立刻改的三件事">
            <ul className="space-y-2 text-[11px] leading-relaxed text-white/65">
              {analysis.longParagraphs > 0 && (
                <li>
                  · 有 <span className="font-mono text-amber-300">{analysis.longParagraphs}</span> 个段落超过
                  220 字，按“一段一意”拆开。
                </li>
              )}
              {analysis.headings < 2 && <li>· 缺少二级标题，读者与检索系统都找不到主题边界。</li>}
              {analysis.numbers === 0 && analysis.links === 0 && (
                <li>· 没有数字或来源链接：这类内容很难被判断为“可核验”。</li>
              )}
              {analysis.averageSentence > 60 && <li>· 平均句长偏长，把长句拆成两句会让片段更好摘取。</li>}
              {analysis.score >= 85 && <li>· 结构已经不错，下一步补上原始数据与可复现的测试条件。</li>}
              <li>· 检查每节第一句是否直接给出结论，而不是铺垫。</li>
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <Note tone="warn">
          评分是基于结构特征的启发式规则，不评估事实正确性，也不预测任何排名或引用概率。
          长度、标题、列表都是可优化的表层信号；真正的差异仍然来自原创数据与可核验的经验。
        </Note>
      </div>
    </WorkbenchShell>
  );
}
