import { useMemo, useState } from 'react';
import { WorkbenchShell, Panel, Note } from '@/features/shared/ui';

type GraphNode = {
  id: string;
  label: string;
  en: string;
  category: '概念' | '检索' | '表示' | '生成' | '可信度';
  description: string;
  article?: { title: string; href: string };
};

type GraphEdge = { source: string; target: string; label: string };

const NODES: GraphNode[] = [
  {
    id: 'geo',
    label: 'GEO',
    en: 'Generative Engine Optimization',
    category: '概念',
    description: '针对生成式搜索系统优化内容，目标是提高被检索、理解和引用的概率，而不是排名位置。',
    article: { title: '什么是 GEO？完整技术介绍', href: '/knowledge/what-is-geo/' },
  },
  {
    id: 'seo',
    label: 'SEO',
    en: 'Search Engine Optimization',
    category: '概念',
    description: '面向传统搜索结果的优化，是 GEO 的可抓取与可理解基础。',
    article: { title: 'GEO 与 SEO 的区别', href: '/knowledge/geo-vs-seo/' },
  },
  {
    id: 'aeo',
    label: 'AEO',
    en: 'Answer Engine Optimization',
    category: '概念',
    description: '面向答案型界面的优化，关注能否直接回答问题，与 GEO 高度重叠。',
  },
  {
    id: 'ai-search',
    label: 'AI 搜索',
    en: 'AI Search',
    category: '概念',
    description: '以生成式模型为核心、返回答案与来源的搜索形态。',
    article: { title: 'AI 搜索引擎工作原理', href: '/knowledge/ai-search-how-it-works/' },
  },
  {
    id: 'query',
    label: '查询理解',
    en: 'Query Understanding',
    category: '检索',
    description: '把用户问题分解为意图、实体与检索词元，决定后续召回的方向。',
  },
  {
    id: 'retrieval',
    label: '检索',
    en: 'Retrieval',
    category: '检索',
    description: '从索引中召回候选片段，常见为 BM25 稀疏检索与向量稠密检索的混合。',
    article: { title: 'RAG 完整技术架构', href: '/knowledge/rag-architecture/' },
  },
  {
    id: 'vector-db',
    label: '向量数据库',
    en: 'Vector Database',
    category: '检索',
    description: '存储嵌入向量并支持近似最近邻检索，是稠密检索的工程基础。',
  },
  {
    id: 'reranking',
    label: '重排',
    en: 'Reranking',
    category: '检索',
    description: '用更贵的模型对候选片段重新打分，决定最终进入上下文的顺序。',
  },
  {
    id: 'embedding',
    label: '嵌入',
    en: 'Embedding',
    category: '表示',
    description: '把文本映射为稠密向量，使语义相近的内容在向量空间中距离更近。',
    article: { title: 'Embedding 与语义检索', href: '/knowledge/embedding-semantic-retrieval/' },
  },
  {
    id: 'chunking',
    label: '切分',
    en: 'Chunking',
    category: '表示',
    description: '决定检索的最小单位，会影响片段自洽性与上下文完整度。',
    article: { title: 'Chunking 的原理与实践', href: '/knowledge/chunking-in-practice/' },
  },
  {
    id: 'entity',
    label: '实体',
    en: 'Entity',
    category: '表示',
    description: '被明确指称的组织、人物、产品与概念，是消歧与关联的基本单位。',
    article: { title: 'AI 如何理解网页实体', href: '/knowledge/entity-understanding/' },
  },
  {
    id: 'kg',
    label: '知识图谱',
    en: 'Knowledge Graph',
    category: '表示',
    description: '以实体与关系组织知识，帮助系统判断页面所属领域与关联对象。',
    article: { title: 'Knowledge Graph 与 GEO', href: '/knowledge/knowledge-graph-geo/' },
  },
  {
    id: 'schema',
    label: '结构化数据',
    en: 'Structured Data',
    category: '表示',
    description: '用 schema.org 词汇声明页面实体与属性，辅助机器解析。',
    article: { title: '结构化数据与 JSON-LD 的正确用法', href: '/knowledge/structured-data/' },
  },
  {
    id: 'context',
    label: '上下文窗口',
    en: 'Context Window',
    category: '生成',
    description: '模型单次能读入的 token 上限，决定了能放进多少检索片段。',
  },
  {
    id: 'llm',
    label: '大模型',
    en: 'LLM',
    category: '生成',
    description: '基于检索片段生成答案，可能忽略片段或产生幻觉。',
  },
  {
    id: 'citation',
    label: '引用',
    en: 'Citation',
    category: '可信度',
    description: '答案中标注来源，让用户核验事实，也让内容贡献可被追踪。',
    article: { title: 'AI 回答为什么会引用某个网站', href: '/knowledge/why-ai-cites-a-site/' },
  },
  {
    id: 'trust',
    label: '可信度信号',
    en: 'Trust Signals',
    category: '可信度',
    description: '作者、组织、来源链接与可核验数据共同构成的可信度证据。',
  },
  {
    id: 'evaluation',
    label: '评估',
    en: 'Evaluation',
    category: '可信度',
    description: '用固定问题集与重复观测测量提及率、引用率与答案准确率。',
    article: { title: 'GEO 效果如何量化评估', href: '/knowledge/measuring-geo-effects/' },
  },
];

const EDGES: GraphEdge[] = [
  { source: 'geo', target: 'seo', label: '依赖基础' },
  { source: 'geo', target: 'aeo', label: '重叠' },
  { source: 'geo', target: 'ai-search', label: '优化对象' },
  { source: 'ai-search', target: 'query', label: '第一步' },
  { source: 'query', target: 'retrieval', label: '触发' },
  { source: 'retrieval', target: 'vector-db', label: '使用' },
  { source: 'retrieval', target: 'embedding', label: '使用' },
  { source: 'retrieval', target: 'chunking', label: '依赖索引' },
  { source: 'retrieval', target: 'reranking', label: '后接' },
  { source: 'reranking', target: 'context', label: '填充' },
  { source: 'context', target: 'llm', label: '输入' },
  { source: 'llm', target: 'citation', label: '生成' },
  { source: 'citation', target: 'trust', label: '依赖' },
  { source: 'trust', target: 'entity', label: '由实体体现' },
  { source: 'entity', target: 'kg', label: '组织为' },
  { source: 'entity', target: 'schema', label: '声明为' },
  { source: 'kg', target: 'schema', label: '共享词汇' },
  { source: 'evaluation', target: 'citation', label: '测量' },
  { source: 'evaluation', target: 'ai-search', label: '测试' },
  { source: 'chunking', target: 'embedding', label: '输入' },
];

const CATEGORY_COLORS: Record<GraphNode['category'], string> = {
  概念: '#7fb8a3',
  检索: '#4f9880',
  表示: '#e0661f',
  生成: '#8fa3b8',
  可信度: '#f6b98d',
};

type Positioned = GraphNode & { x: number; y: number };

/** 确定性力导向布局：固定随机种子 + 固定迭代次数，保证每次渲染位置一致。 */
function layout(nodes: GraphNode[], edges: GraphEdge[], width = 760, height = 520): Positioned[] {
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const positions = nodes.map((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2;
    const radius = 150 + random() * 90;
    return {
      ...node,
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    };
  });

  const byId = new Map(positions.map((node) => [node.id, node]));

  for (let iteration = 0; iteration < 420; iteration += 1) {
    const alpha = 0.4 * (1 - iteration / 420) + 0.02;

    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i];
        const b = positions[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(12, Math.hypot(dx, dy));
        const force = (5200 / (distance * distance)) * alpha * 6;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        a.x -= fx;
        a.y -= fy;
        b.x += fx;
        b.y += fy;
      }
    }

    for (const edge of edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const ideal = 128;
      const force = ((distance - ideal) / distance) * 0.06 * alpha;
      const fx = dx * force;
      const fy = dy * force;
      source.x += fx;
      source.y += fy;
      target.x -= fx;
      target.y -= fy;
    }

    for (const node of positions) {
      node.x += (width / 2 - node.x) * 0.008 * alpha * 3;
      node.y += (height / 2 - node.y) * 0.008 * alpha * 3;
    }
  }

  // 力导向布局的结果常常挤在局部，最后统一缩放到画布内，避免大片空白。
  const xs = positions.map((node) => node.x);
  const ys = positions.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 56;
  const scaleX = (width - padding * 2) / Math.max(1, maxX - minX);
  const scaleY = (height - padding * 2) / Math.max(1, maxY - minY);
  const scale = Math.min(scaleX, scaleY);

  return positions.map((node) => ({
    ...node,
    x: padding + (node.x - minX) * scale + ((width - padding * 2) - (maxX - minX) * scale) / 2,
    y: padding + (node.y - minY) * scale + ((height - padding * 2) - (maxY - minY) * scale) / 2,
  }));
}

export default function KnowledgeGraph() {
  const [selected, setSelected] = useState<string | null>('geo');
  const [hovered, setHovered] = useState<string | null>(null);
  const [category, setCategory] = useState<GraphNode['category'] | '全部'>('全部');

  const positioned = useMemo(() => layout(NODES, EDGES), []);
  const active = hovered ?? selected;
  const neighbors = useMemo(() => {
    if (!active) return new Set<string>();
    const set = new Set<string>([active]);
    for (const edge of EDGES) {
      if (edge.source === active) set.add(edge.target);
      if (edge.target === active) set.add(edge.source);
    }
    return set;
  }, [active]);

  const selectedNode = NODES.find((node) => node.id === selected) ?? null;
  const byId = useMemo(() => new Map(positioned.map((node) => [node.id, node])), [positioned]);
  const categories: (GraphNode['category'] | '全部')[] = ['全部', '概念', '检索', '表示', '生成', '可信度'];

  // 只在悬停时压暗无关节点；点击选中时保持全图可见，避免误以为图是空的。
  const dimSource = hovered;
  const isDimmed = (id: string) => dimSource !== null && !neighbors.has(id);
  const isFiltered = (node: GraphNode) => category !== '全部' && node.category !== category;

  return (
    <WorkbenchShell>
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategory(value)}
            className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
              category === value
                ? 'border-brand-400 bg-brand-400/20 text-white'
                : 'border-white/15 text-white/55 hover:text-white'
            }`}
          >
            {value}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-white/35">点击节点查看概念与对应文章</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel>
          <svg viewBox="0 0 760 520" className="w-full" role="img" aria-label="GEO 技术知识图谱">
            <g>
              {EDGES.map((edge) => {
                const source = byId.get(edge.source);
                const target = byId.get(edge.target);
                if (!source || !target) return null;
                const dim = isDimmed(edge.source) || isDimmed(edge.target);
                const highlighted = active === edge.source || active === edge.target;
                return (
                  <line
                    key={`${edge.source}-${edge.target}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={highlighted ? CATEGORY_COLORS[source.category] : 'rgba(255,255,255,0.28)'}
                    strokeWidth={highlighted ? 1.6 : 1}
                    opacity={dim ? 0.12 : 0.9}
                  />
                );
              })}
            </g>
            <g>
              {positioned.map((node) => {
                const dim = isDimmed(node.id) || isFiltered(node);
                const isSelected = selected === node.id;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    opacity={dim ? 0.25 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHovered(node.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(node.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelected(node.id);
                    }}
                    aria-label={`${node.label} ${node.en}`}
                  >
                    <circle
                      r={isSelected ? 12 : 9}
                      fill={CATEGORY_COLORS[node.category]}
                      stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.35)'}
                      strokeWidth={isSelected ? 2 : 1}
                    />
                    <text
                      x={0}
                      y={-18}
                      textAnchor="middle"
                      fontSize={11}
                      fill={dim ? 'rgba(255,255,255,0.5)' : '#ffffff'}
                      style={{ pointerEvents: 'none' }}
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </Panel>

        <div className="space-y-3">
          <Panel title="当前节点">
            {selectedNode ? (
              <>
                <div className="flex items-baseline gap-2">
                  <h3 className="font-display text-xl text-white">{selectedNode.label}</h3>
                  <span className="font-mono text-[10px] text-white/40">{selectedNode.en}</span>
                </div>
                <span
                  className="mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px]"
                  style={{
                    borderColor: `${CATEGORY_COLORS[selectedNode.category]}55`,
                    color: CATEGORY_COLORS[selectedNode.category],
                  }}
                >
                  {selectedNode.category}
                </span>
                <p className="mt-3 text-[12px] leading-relaxed text-white/65">{selectedNode.description}</p>
                {selectedNode.article && (
                  <a
                    href={selectedNode.article.href}
                    className="mt-3 inline-flex items-center gap-1 text-[11px] text-brand-300 hover:text-white"
                  >
                    阅读：{selectedNode.article.title} →
                  </a>
                )}
                <div className="mt-4 border-t border-white/10 pt-3">
                  <p className="workbench-label">直接关联</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {EDGES.filter(
                      (edge) => edge.source === selectedNode.id || edge.target === selectedNode.id,
                    ).map((edge) => {
                      const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                      const other = NODES.find((node) => node.id === otherId);
                      if (!other) return null;
                      return (
                        <li key={otherId}>
                          <button
                            type="button"
                            onClick={() => setSelected(otherId)}
                            className="rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/65 hover:border-brand-400 hover:text-white"
                            title={edge.label}
                          >
                            {other.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-xs text-white/40">点击任意节点查看说明。</p>
            )}
          </Panel>

          <Panel title="图例">
            <ul className="space-y-1.5">
              {(Object.keys(CATEGORY_COLORS) as GraphNode['category'][]).map((key) => (
                <li key={key} className="flex items-center gap-2 text-[11px] text-white/60">
                  <span className="size-2.5 rounded-full" style={{ background: CATEGORY_COLORS[key] }} />
                  {key}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <Note>
          这张图是 GEO Lab 自己对技术依赖关系的整理，不是任何搜索引擎或模型的官方架构。
          边的方向表示“在链路中先于/服务于”，不代表因果强度。
        </Note>
      </div>
    </WorkbenchShell>
  );
}
