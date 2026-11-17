import type { Intent, Metrics, Observation, Project } from './types';

/** 从答案文本里提取被提及的品牌位置（第几句首次出现，1 起）。 */
export function brandSentencePosition(answer: string, brand: string): number | null {
  if (!brand.trim()) return null;
  const sentences = answer
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？；!?;])\s*/)
    .filter(Boolean);
  const needle = brand.toLowerCase();
  const index = sentences.findIndex((sentence) => sentence.toLowerCase().includes(needle));
  return index === -1 ? null : index + 1;
}

export function detectMentions(answer: string, names: string[]): Record<string, boolean> {
  const haystack = answer.toLowerCase();
  const result: Record<string, boolean> = {};
  for (const name of names) {
    if (!name.trim()) continue;
    result[name] = haystack.includes(name.toLowerCase());
  }
  return result;
}

export function extractCitations(answer: string): string[] {
  const urls = answer.match(/https?:\/\/[^\s<>"'）)】\]]+/g) ?? [];
  const cleaned = urls.map((url) => url.replace(/[.,;:!?、。；：！？]+$/, ''));
  return [...new Set(cleaned)];
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * 指标计算口径（与 /benchmark 方法论文档一致）：
 * - 提及率 = 提及品牌的答案数 / 记录数
 * - 引用率 = 引用中出现本站域名的记录数 / 记录数
 * - 来源份额 = 品牌被提及次数 / (品牌 + 各竞品被提及次数之和)
 * - 平均位置 = 品牌首次出现的句子序号均值（未提及不计入）
 */
export function computeMetrics(project: Project, observations: Observation[], questions?: { id: string; intent: Intent }[]): Metrics {
  const total = observations.length;
  const siteDomain = project.site ? domainOf(project.site) : '';

  const mentioned = observations.filter((observation) => observation.brandMentioned);
  const cited = observations.filter((observation) =>
    siteDomain
      ? observation.citations.some((citation) => domainOf(citation) === siteDomain)
      : false,
  );

  const positions = mentioned
    .map((observation) => observation.brandPosition)
    .filter((position): position is number => typeof position === 'number');
  const averagePosition = positions.length
    ? Number((positions.reduce((sum, position) => sum + position, 0) / positions.length).toFixed(2))
    : null;

  const competitorCounts = new Map<string, number>();
  for (const competitor of project.competitors) competitorCounts.set(competitor, 0);
  let competitorTotal = 0;
  for (const observation of observations) {
    for (const [name, present] of Object.entries(observation.competitorMentions)) {
      if (!present) continue;
      competitorCounts.set(name, (competitorCounts.get(name) ?? 0) + 1);
      competitorTotal += 1;
    }
  }
  const brandTotal = mentioned.length;
  const shareOfVoice = brandTotal + competitorTotal === 0 ? 0 : brandTotal / (brandTotal + competitorTotal);

  const intentById = new Map((questions ?? []).map((question) => [question.id, question.intent]));
  const intentBuckets = new Map<Intent, { total: number; mentioned: number }>();
  for (const observation of observations) {
    const intent = intentById.get(observation.questionId);
    if (!intent) continue;
    const bucket = intentBuckets.get(intent) ?? { total: 0, mentioned: 0 };
    bucket.total += 1;
    if (observation.brandMentioned) bucket.mentioned += 1;
    intentBuckets.set(intent, bucket);
  }

  const domainCounts = new Map<string, number>();
  for (const observation of observations) {
    for (const citation of observation.citations) {
      const domain = domainOf(citation);
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    }
  }

  return {
    total,
    mentionRate: total ? mentioned.length / total : 0,
    citationRate: total ? cited.length / total : 0,
    shareOfVoice,
    averagePosition,
    competitorRates: [...competitorCounts.entries()]
      .map(([name, count]) => ({ name, rate: total ? count / total : 0 }))
      .sort((a, b) => b.rate - a.rate),
    byIntent: [...intentBuckets.entries()].map(([intent, bucket]) => ({
      intent,
      total: bucket.total,
      mentionRate: bucket.total ? bucket.mentioned / bucket.total : 0,
    })),
    citationDomains: [...domainCounts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}

/** 按运行聚合，用于趋势图。 */
export function metricsByRun(
  project: Project,
  observations: Observation[],
): { runId: string; total: number; mentionRate: number; citationRate: number }[] {
  const groups = new Map<string, Observation[]>();
  for (const observation of observations) {
    const list = groups.get(observation.runId) ?? [];
    list.push(observation);
    groups.set(observation.runId, list);
  }
  return [...groups.entries()].map(([runId, list]) => {
    const metrics = computeMetrics(project, list);
    return {
      runId,
      total: metrics.total,
      mentionRate: metrics.mentionRate,
      citationRate: metrics.citationRate,
    };
  });
}
