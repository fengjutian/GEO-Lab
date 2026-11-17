/**
 * 站点级常量。SEO、JSON-LD、RSS、导航都从这里取，避免多处硬编码。
 */
export const SITE = {
  name: 'GEO Lab',
  legalName: 'GEO Lab · Generative Engine Optimization Laboratory',
  nameZh: '生成式引擎优化实验室',
  url: 'https://geolab.dev',
  slogan: 'Research. Optimize. Get Cited.',
  tagline: '让 AI 看见你的内容。',
  taglineEn: 'Make Your Content Visible to AI.',
  description:
    'GEO Lab 研究 AI 如何发现、理解、检索和引用互联网内容，并把研究成果转化为知识体系、在线实验工具与企业 GEO 诊断服务。',
  lang: 'zh-CN',
  locale: 'zh_CN',
  defaultOgImage: '/images/og-default.svg',
  author: {
    name: 'GEO Lab Research',
    role: 'GEO 技术研究',
    url: 'https://geolab.dev/about/',
  },
  organization: {
    name: 'GEO Lab',
    email: 'research@geolab.dev',
    sameAs: ['https://github.com/geolab-dev'],
  },
} as const;

export type NavItem = {
  title: string;
  titleEn: string;
  href: string;
  description: string;
};

export const NAV: NavItem[] = [
  { title: '首页', titleEn: 'Home', href: '/', description: 'GEO Lab 概览与研究入口' },
  {
    title: '知识库',
    titleEn: 'Knowledge',
    href: '/knowledge/',
    description: '系统学习 GEO 技术体系',
  },
  {
    title: '技术研究',
    titleEn: 'Research',
    href: '/research/',
    description: '论文、实验与技术趋势',
  },
  { title: '工具箱', titleEn: 'Tools', href: '/tools/', description: '浏览器端 GEO 分析与实验工具' },
  {
    title: '可见性',
    titleEn: 'Benchmark',
    href: '/benchmark/',
    description: '固定问题集 + 多模型记录的 AI 可见性监测',
  },
  { title: '案例库', titleEn: 'Cases', href: '/cases/', description: '诊断与优化案例记录' },
  { title: '企业服务', titleEn: 'Services', href: '/services/', description: 'GEO 诊断、优化与监测' },
  { title: '关于', titleEn: 'About', href: '/about/', description: '研究方法论与团队' },
];

/**
 * 统一的证据等级标注：GEO 领域最常见的问题是结论没有可核验的来源。
 * 所有文章、案例、工具结论都应该带一个等级。
 */
export const EVIDENCE_LEVELS = {
  official: {
    label: '官方文档',
    labelEn: 'Official',
    description: '来自搜索引擎或模型厂商的公开文档与规范。',
    tone: 'green',
  },
  paper: {
    label: '同行评审论文',
    labelEn: 'Peer-reviewed',
    description: '学术会议或期刊发表的研究成果。',
    tone: 'blue',
  },
  experiment: {
    label: '自有实验',
    labelEn: 'Experiment',
    description: 'GEO Lab 控制条件下的可复现实验，公开样本与时间。',
    tone: 'orange',
  },
  analysis: {
    label: '技术分析',
    labelEn: 'Analysis',
    description: '基于公开技术资料与代码阅读的推断，不代表官方结论。',
    tone: 'gray',
  },
  field: {
    label: '行业经验',
    labelEn: 'Field note',
    description: '来自实践的经验性观察，证据强度最低。',
    tone: 'gray',
  },
} as const;

export type EvidenceLevel = keyof typeof EVIDENCE_LEVELS;
