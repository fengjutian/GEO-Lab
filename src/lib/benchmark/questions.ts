import type { Intent } from './types';

/**
 * 默认问题集模板。
 * 设计要点：按搜索意图分层，避免 20 个几乎同样的问题。
 * 品牌名与竞品名会替换进模板，竞品不足时退化为“同类产品”。
 */
export function defaultQuestions(input: {
  brand: string;
  competitors: string[];
}): { text: string; intent: Intent }[] {
  const brand = input.brand.trim() || '你的品牌';
  const [first = '同类产品 A', second = '同类产品 B'] = input.competitors;

  const templates: { text: string; intent: Intent }[] = [
    { text: `${brand} 是什么？`, intent: '认知' },
    { text: `${brand} 是做什么的？`, intent: '认知' },
    { text: `介绍一下 ${brand}`, intent: '认知' },
    { text: `${brand} 的主要产品有哪些？`, intent: '认知' },
    { text: `${brand} 属于哪个行业？`, intent: '认知' },

    { text: `${brand} 和 ${first} 有什么区别？`, intent: '比较' },
    { text: `${brand} 和 ${second} 哪个更好？`, intent: '比较' },
    { text: `${brand}、${first}、${second} 怎么选？`, intent: '比较' },
    { text: `${brand} 相比同类产品有什么优势？`, intent: '比较' },
    { text: `有哪些 ${brand} 的替代方案？`, intent: '比较' },

    { text: `${brand} 值得购买吗？`, intent: '决策' },
    { text: `${brand} 的价格是多少？`, intent: '决策' },
    { text: `${brand} 适合什么规模的团队？`, intent: '决策' },
    { text: `如何评估 ${brand} 是否适合我们？`, intent: '决策' },
    { text: `${brand} 的售后服务怎么样？`, intent: '决策' },

    { text: `${brand} 登录不上怎么办？`, intent: '问题排查' },
    { text: `${brand} 如何联系客服？`, intent: '问题排查' },
    { text: `${brand} 数据导出失败怎么解决？`, intent: '问题排查' },
    { text: `${brand} 支持哪些集成？`, intent: '问题排查' },
    { text: `${brand} 的 API 文档在哪里？`, intent: '问题排查' },
  ];

  return templates;
}

export const MAX_QUESTIONS_PER_RUN = 30;
