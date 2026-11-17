/**
 * 工具注册表。
 * 每个工具都声明它做什么、不做什么 —— 这是 GEO Lab 与“一键提升 AI 排名”类工具的分界。
 * 所有工具默认在浏览器端运行，不上传用户文本。
 */
export type ToolCategory = '诊断' | '分析' | '生成' | '实验室';

export type ToolDefinition = {
  slug: string;
  title: string;
  titleEn: string;
  description: string;
  category: ToolCategory;
  href: string;
  status: 'stable' | 'beta' | 'planned';
  runtime: 'browser' | 'server';
  /** 能力边界：明确写出不能推断的东西 */
  limitations: string[];
  /** 相关知识库文章，形成知识 → 实验的闭环 */
  related: string[];
};

export const TOOLS: ToolDefinition[] = [
  {
    slug: 'site-audit',
    title: 'GEO 网站诊断',
    titleEn: 'Site Audit',
    description:
      '输入站点 URL，检查抓取可达性、标题结构、Schema、作者与组织实体、内链与 robots/sitemap，输出分层报告。',
    category: '诊断',
    href: '/tools/site-audit/',
    status: 'beta',
    runtime: 'browser',
    limitations: [
      '只做静态结构检查，不测试 AI 是否真的引用你的网站',
      '受浏览器同源策略限制，跨域抓取需要可选的服务端抓取接口',
      '不评估内容原创性与事实准确性',
    ],
    related: ['geo-technical-audit'],
  },
  {
    slug: 'embedding',
    title: 'Embedding 语义相似度',
    titleEn: 'Semantic Similarity',
    description:
      '对比两段文本的向量表示与相似度，观察同一语义的不同表述如何被检索系统判定为相关。',
    category: '实验室',
    href: '/tools/embedding/',
    status: 'stable',
    runtime: 'browser',
    limitations: [
      '演示使用本地字符 n-gram 哈希向量，不是真实神经嵌入模型',
      '相似度数值只用于理解机制，不能当作真实模型的评分',
    ],
    related: ['embedding-semantic-retrieval'],
  },
  {
    slug: 'chunking',
    title: 'Chunking 切分实验',
    titleEn: 'Chunking Lab',
    description:
      '并排查看固定长度、按段落、按标题层级三种切分结果，理解 chunk 边界如何影响检索命中。',
    category: '实验室',
    href: '/tools/chunking/',
    status: 'stable',
    runtime: 'browser',
    limitations: ['不生成真实向量，不执行检索', '切分规则是常见策略的简化实现'],
    related: ['chunking-in-practice'],
  },
  {
    slug: 'rag',
    title: 'RAG 检索流程可视化',
    titleEn: 'RAG Playground',
    description:
      '用一份内置语料演示查询理解、召回、重排、上下文构建与带引用的答案生成全过程。',
    category: '实验室',
    href: '/tools/rag/',
    status: 'stable',
    runtime: 'browser',
    limitations: [
      '不调用真实大模型，答案是语料片段的组合，用于说明引用来源如何产生',
      '语料规模极小，不能代表生产级检索质量',
    ],
    related: ['rag-architecture'],
  },
  {
    slug: 'entity',
    title: 'Entity 提取演示',
    titleEn: 'Entity Extractor',
    description:
      '从你的页面文本中提取品牌、组织、人物、产品与技术术语，检查 AI 能否识别页面的核心实体。',
    category: '分析',
    href: '/tools/entity/',
    status: 'beta',
    runtime: 'browser',
    limitations: [
      '基于规则与词表的识别，不是 NER 模型，长尾专有名词会漏检',
      '不判断实体之间的真实关系，只做共现统计',
    ],
    related: ['entity-understanding'],
  },
  {
    slug: 'schema',
    title: 'JSON-LD Schema 生成器',
    titleEn: 'Schema Generator',
    description:
      '按 Article / Organization / FAQPage 结构生成可校验的 JSON-LD，并提示常见填写错误。',
    category: '生成',
    href: '/tools/schema/',
    status: 'stable',
    runtime: 'browser',
    limitations: ['只生成结构化数据，不保证任何搜索或 AI 系统使用它', '不替代官方 Schema 校验工具'],
    related: ['structured-data'],
  },
  {
    slug: 'content-structure',
    title: '内容结构分析',
    titleEn: 'Content Analyzer',
    description:
      '统计标题层级、段落长度、可引用句、数据与来源密度，给出面向“可被摘取”的结构改进清单。',
    category: '分析',
    href: '/tools/content-structure/',
    status: 'stable',
    runtime: 'browser',
    limitations: ['只分析结构特征，不评估观点正确性', '评分是基于规则的启发式，不是排名预测'],
    related: ['ai-readable-content'],
  },
] as const;

export const TOOL_CATEGORIES: ToolCategory[] = ['诊断', '实验室', '分析', '生成'];

export function findTool(slug: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}
