import { useMemo, useState } from 'react';
import { WorkbenchShell, Panel, Metric, Note } from '@/features/shared/ui';
import { countChars, estimateTokens, splitParagraphs, splitSentences } from '@/features/shared/text';

type Strategy = 'fixed' | 'paragraph' | 'heading' | 'sentence';

const STRATEGY_LABELS: Record<Strategy, string> = {
  fixed: '固定长度 + 重叠',
  paragraph: '按段落聚合',
  heading: '按标题层级',
  sentence: '按句窗',
};

const SAMPLE = `## 什么是 GEO

GEO（Generative Engine Optimization，生成式引擎优化）研究内容如何被生成式搜索系统检索、理解并引用。

与传统搜索不同，生成式引擎不会返回十个蓝色链接，而是先检索网页片段，再把片段放进上下文，最后生成带来源的答案。这意味着内容不仅要被索引，还要在片段级别足够自洽。

## 为什么切分方式重要

检索系统通常在 chunk 级别做向量化和匹配。一个被切成两半的论证，两半都无法回答问题。

chunk 太小会丢失上下文，太大则会让相关性信号被稀释，还会挤占上下文窗口。多数实现会在 200 到 800 个 token 之间取值，并结合语义或结构边界调整。

## 常见策略

- 固定窗口：实现简单，可预测，但会切断句子和表格
- 递归切分：优先按标题、段落、句子边界回退
- 语义切分：按相邻句子的向量相似度寻找断点
- 父子块：用小块检索，用大块提供上下文

## 评估方式

不要只看 chunk 数量。应当用一组真实问题做检索命中测试，观察答案是否落在某个 chunk 内，以及引用片段是否仍然可读。`;

function chunkFixed(text: string, size: number, overlap: number): string[] {
  const chars = Array.from(text);
  const chunks: string[] = [];
  const step = Math.max(1, size - overlap);
  for (let start = 0; start < chars.length; start += step) {
    const slice = chars.slice(start, start + size).join('').trim();
    if (slice) chunks.push(slice);
    if (start + size >= chars.length) break;
  }
  return chunks;
}

function chunkParagraph(text: string, maxSize: number): string[] {
  const paragraphs = splitParagraphs(text);
  const chunks: string[] = [];
  let buffer = '';
  for (const paragraph of paragraphs) {
    const merged = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (countChars(merged) > maxSize && buffer) {
      chunks.push(buffer);
      buffer = paragraph;
    } else {
      buffer = merged;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function chunkHeading(text: string): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const value = buffer.join('\n').trim();
    if (value) chunks.push(value);
    buffer = [];
  };
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && buffer.length > 0) flush();
    buffer.push(line);
  }
  flush();
  return chunks;
}

function chunkSentence(text: string, perChunk: number): string[] {
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  for (let index = 0; index < sentences.length; index += perChunk) {
    const value = sentences.slice(index, index + perChunk).join('').trim();
    if (value) chunks.push(value);
  }
  return chunks;
}

function runStrategy(text: string, strategy: Strategy, size: number, overlap: number): string[] {
  switch (strategy) {
    case 'fixed':
      return chunkFixed(text, size, overlap);
    case 'paragraph':
      return chunkParagraph(text, size);
    case 'heading':
      return chunkHeading(text);
    case 'sentence':
      return chunkSentence(text, Math.max(1, Math.round(overlap / 40) + 1));
  }
}

export default function ChunkingLab() {
  const [text, setText] = useState(SAMPLE);
  const [size, setSize] = useState(220);
  const [overlap, setOverlap] = useState(40);
  const [strategyA, setStrategyA] = useState<Strategy>('fixed');
  const [strategyB, setStrategyB] = useState<Strategy>('heading');

  const chunksA = useMemo(() => runStrategy(text, strategyA, size, overlap), [text, strategyA, size, overlap]);
  const chunksB = useMemo(() => runStrategy(text, strategyB, size, overlap), [text, strategyB, size, overlap]);

  const stats = (chunks: string[]) => {
    const tokens = chunks.map((chunk) => estimateTokens(chunk));
    const total = tokens.reduce((sum, value) => sum + value, 0);
    return {
      count: chunks.length,
      avg: chunks.length ? Math.round(total / chunks.length) : 0,
      min: tokens.length ? Math.min(...tokens) : 0,
      max: tokens.length ? Math.max(...tokens) : 0,
    };
  };

  const statA = stats(chunksA);
  const statB = stats(chunksB);
  const sourceTokens = estimateTokens(text);

  const renderColumn = (
    label: string,
    strategy: Strategy,
    setStrategy: (value: Strategy) => void,
    chunks: string[],
    stat: ReturnType<typeof stats>,
  ) => (
    <Panel title={label} hint={`${stat.count} 个 chunk`}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(STRATEGY_LABELS) as Strategy[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStrategy(value)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              strategy === value
                ? 'border-brand-400 bg-brand-400/20 text-white'
                : 'border-white/15 text-white/60 hover:text-white'
            }`}
          >
            {STRATEGY_LABELS[value]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="平均 token" value={stat.avg} />
        <Metric label="最小" value={stat.min} />
        <Metric label="最大" value={stat.max} />
      </div>

      <ol className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {chunks.map((chunk, index) => (
          <li key={index} className="rounded-lg border border-white/10 bg-black/25 p-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-brand-300">#{String(index + 1).padStart(2, '0')}</span>
              <span className="font-mono text-[10px] text-white/40">{estimateTokens(chunk)} tok</span>
            </div>
            <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-[11px] leading-relaxed text-white/70">
              {chunk}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );

  return (
    <WorkbenchShell>
      <Panel title="语料" hint={`${sourceTokens} token · ${countChars(text)} 字`}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={7}
          className="workbench-input resize-y font-mono !text-[12px]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[11px] text-white/60">
            目标大小
            <input
              type="range"
              min={80}
              max={600}
              step={10}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
              className="accent-[var(--color-brand-400)]"
            />
            <span className="font-mono text-white/80">{size}</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-white/60">
            重叠
            <input
              type="range"
              min={0}
              max={160}
              step={10}
              value={overlap}
              onChange={(event) => setOverlap(Number(event.target.value))}
              className="accent-[var(--color-accent-500)]"
            />
            <span className="font-mono text-white/80">{overlap}</span>
          </label>
          <button
            type="button"
            onClick={() => setText(SAMPLE)}
            className="ml-auto rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60 hover:text-white"
          >
            恢复示例语料
          </button>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {renderColumn('切分方案 A', strategyA, setStrategyA, chunksA, statA)}
        {renderColumn('切分方案 B', strategyB, setStrategyB, chunksB, statB)}
      </div>

      <div className="mt-4">
        <Note tone="warn">
          切分只是检索质量的必要条件，不是充分条件。chunk 数量更多不代表更好：
          被切断的表格、丢失的上下文和重复的重叠内容，都可能降低检索结果的可用性。
          用方案 B 的「按标题层级」对比方案 A，可以直观看到结构边界比字数边界更能保持语义完整。
        </Note>
      </div>
    </WorkbenchShell>
  );
}
