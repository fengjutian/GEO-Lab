import { useMemo, useState } from 'react';
import { WorkbenchShell, Panel, Metric, Bar, Note } from '@/features/shared/ui';
import { cosine, hashEmbed, similarityLabel, topSharedTerms, type HashVector } from '@/features/shared/text';

const PRESETS: { name: string; a: string; b: string }[] = [
  {
    name: '改写 vs 同义',
    a: '生成式引擎优化关注内容能否被 AI 搜索系统检索、理解并引用。',
    b: 'GEO 的核心是让生成式搜索更容易找到、读懂并引用你的网页内容。',
  },
  {
    name: '近义不同场景',
    a: 'RAG 会先检索相关文档片段，再把它们放进上下文窗口供模型生成答案。',
    b: '向量数据库用于存储嵌入向量，并支持近似最近邻检索。',
  },
  {
    name: '完全无关',
    a: '如何为一个开源项目编写贡献者指南。',
    b: '咖啡因对睡眠结构的影响与代谢差异。',
  },
];

function VectorGrid({ vector, tone }: { vector: HashVector; tone: 'a' | 'b' }) {
  const max = Math.max(...Array.from(vector.values, (value) => Math.abs(value)), 0.0001);
  return (
    <div className="grid grid-cols-16 gap-[2px]" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
      {Array.from(vector.values).slice(0, 256).map((value, index) => {
        const intensity = Math.min(1, Math.abs(value) / max);
        const positive = value >= 0;
        const background = positive
          ? `rgba(${tone === 'a' ? '79,152,128' : '224,102,31'}, ${0.12 + intensity * 0.85})`
          : `rgba(120, 140, 160, ${0.08 + intensity * 0.5})`;
        return (
          <span
            key={index}
            title={`dim ${index}: ${value.toFixed(4)}`}
            className="aspect-square rounded-[1px]"
            style={{ background, opacity: value === 0 ? 0.18 : 1 }}
          />
        );
      })}
    </div>
  );
}

export default function EmbeddingLab() {
  const [textA, setTextA] = useState(PRESETS[0].a);
  const [textB, setTextB] = useState(PRESETS[0].b);
  const [dims, setDims] = useState(256);

  const result = useMemo(() => {
    const vectorA = hashEmbed(textA, dims);
    const vectorB = hashEmbed(textB, dims);
    const score = cosine(vectorA.values, vectorB.values);
    return {
      vectorA,
      vectorB,
      score,
      shared: topSharedTerms(textA, textB, 10),
      tokensA: vectorA.sparse.length,
      tokensB: vectorB.sparse.length,
      activeA: vectorA.sparse.length,
      activeB: vectorB.sparse.length,
    };
  }, [textA, textB, dims]);

  const label = similarityLabel(result.score);

  return (
    <WorkbenchShell>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="文本 A" hint={`${result.activeA} 个非零维度`}>
          <textarea
            value={textA}
            onChange={(event) => setTextA(event.target.value)}
            rows={5}
            className="workbench-input resize-y"
            placeholder="输入第一段文本"
          />
          <div className="mt-3">
            <VectorGrid vector={result.vectorA} tone="a" />
          </div>
        </Panel>

        <Panel title="文本 B" hint={`${result.activeB} 个非零维度`}>
          <textarea
            value={textB}
            onChange={(event) => setTextB(event.target.value)}
            rows={5}
            className="workbench-input resize-y"
            placeholder="输入第二段文本"
          />
          <div className="mt-3">
            <VectorGrid vector={result.vectorB} tone="b" />
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel title="余弦相似度">
          <p className="font-display text-5xl leading-none text-white">{result.score.toFixed(3)}</p>
          <p className={`mt-2 text-xs ${label.tone}`}>{label.label}</p>
          <div className="mt-4">
            <Bar value={result.score} max={1} tone="accent" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="维度" value={dims} />
            <Metric label="共有词元" value={result.shared.length} unit="个" />
          </div>
        </Panel>

        <Panel title="两个向量共享的词元" hint="重合度决定相似度">
          {result.shared.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {result.shared.map((term) => (
                <li
                  key={term}
                  className="rounded border border-brand-400/30 bg-brand-400/10 px-2 py-0.5 font-mono text-[11px] text-brand-100"
                >
                  {term}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-white/40">没有共享词元，相似度接近 0。</p>
          )}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[10px] text-white/40">A 词元</span>
              <span className="font-mono text-[11px] text-white/70">{result.tokensA}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[10px] text-white/40">B 词元</span>
              <span className="font-mono text-[11px] text-white/70">{result.tokensB}</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="workbench-label mr-1">示例</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => {
              setTextA(preset.a);
              setTextB(preset.b);
            }}
            className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/70 transition-colors hover:border-brand-400 hover:text-white"
          >
            {preset.name}
          </button>
        ))}
        <span className="workbench-label ml-auto mr-1">维度</span>
        {[128, 256, 512].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDims(value)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
              dims === value
                ? 'border-brand-400 bg-brand-400/20 text-white'
                : 'border-white/15 text-white/60 hover:text-white'
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <Note tone="warn">
          本实验使用哈希向量（feature hashing）模拟嵌入空间，只反映字面与子词重叠，不理解语义。
          “GEO”与“生成式引擎优化”在这里相似度会偏低，而真实神经嵌入模型能识别这类同义关系 ——
          这正是自建词表方案与预训练嵌入模型的关键差别。
        </Note>
      </div>
    </WorkbenchShell>
  );
}
