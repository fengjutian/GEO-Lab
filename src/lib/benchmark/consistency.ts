import type { Intent, Observation, Project, Run } from './types';
import { domainOf } from './metrics';

/**
 * 跨端点一致性分析。
 *
 * 目的不是给出“谁更准”，而是回答三个可核验的问题：
 * 1. 同一问题下，不同端点是否都提到了品牌（一致 / 分歧）。
 * 2. 各端点引用来源的重叠程度（Jaccard）。
 * 3. 哪些来源只被某一个端点引用（独占来源）——这通常是可操作的优化线索。
 */

export type MatrixCell = {
  runId: string;
  endpointId: string | null;
  endpointName: string;
  model: string;
  mentioned: boolean;
  position: number | null;
  citationCount: number;
  citations: string[];
};

export type MatrixRow = {
  questionId: string;
  questionText: string;
  intent: Intent | null;
  cells: MatrixCell[];
  mentionedCount: number;
  total: number;
  agreement: 'all' | 'none' | 'partial';
};

export type EndpointColumn = {
  runId: string;
  endpointId: string | null;
  endpointName: string;
  model: string;
  status: Run['status'];
  startedAt: string;
  total: number;
  mentionRate: number;
  citationRate: number;
  uniqueDomains: number;
  note?: string;
};

export type ConsistencyReport = {
  batchId: string;
  label: string;
  createdAt: string;
  endpoints: EndpointColumn[];
  rows: MatrixRow[];
  summary: {
    questions: number;
    endpointCount: number;
    fullAgreement: number;
    partialAgreement: number;
    noneAgreement: number;
  };
  pairwise: { a: string; b: string; jaccard: number; shared: number }[];
  exclusiveDomains: { endpoint: string; domains: string[] }[];
  sharedDomains: { domain: string; endpoints: string[] }[];
};

export function groupBatches(runs: Run[]): { batchId: string; label: string; createdAt: string; runCount: number }[] {
  const batches = new Map<string, Run[]>();
  for (const run of runs) {
    if (!run.batchId) continue;
    const list = batches.get(run.batchId) ?? [];
    list.push(run);
    batches.set(run.batchId, list);
  }
  return [...batches.entries()]
    .map(([batchId, list]) => ({
      batchId,
      label: list[0]?.label ?? batchId,
      createdAt: list.map((run) => run.startedAt).sort()[0] ?? '',
      runCount: list.length,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function jaccard(a: Set<string>, b: Set<string>): { value: number; shared: number } {
  if (a.size === 0 && b.size === 0) return { value: 0, shared: 0 };
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  const union = a.size + b.size - shared;
  return { value: union === 0 ? 0 : shared / union, shared };
}

export function consistencyReport(
  project: Project,
  runs: Run[],
  observations: Observation[],
  batchId: string,
): ConsistencyReport | null {
  const batchRuns = runs.filter((run) => run.batchId === batchId);
  if (batchRuns.length === 0) return null;

  const domainByEndpoint = new Map<string, Set<string>>();
  const endpoints: EndpointColumn[] = batchRuns.map((run) => {
    const scoped = observations.filter((observation) => observation.runId === run.id);
    const mentioned = scoped.filter((observation) => observation.brandMentioned);
    const siteDomain = project.site ? domainOf(project.site) : '';
    const cited = siteDomain
      ? scoped.filter((observation) =>
          observation.citations.some((citation) => domainOf(citation) === siteDomain),
        )
      : [];
    const domains = new Set<string>();
    for (const observation of scoped) {
      for (const citation of observation.citations) domains.add(domainOf(citation));
    }
    domainByEndpoint.set(run.id, domains);
    return {
      runId: run.id,
      endpointId: run.endpointId,
      endpointName: run.endpointName ?? run.provider,
      model: run.model,
      status: run.status,
      startedAt: run.startedAt,
      total: scoped.length,
      mentionRate: scoped.length ? mentioned.length / scoped.length : 0,
      citationRate: scoped.length ? cited.length / scoped.length : 0,
      uniqueDomains: domains.size,
      note: run.note,
    };
  });

  const rows: MatrixRow[] = project.questions.map((question) => {
    const cells: MatrixCell[] = batchRuns.map((run) => {
      const observation = observations.find(
        (item) => item.runId === run.id && item.questionId === question.id,
      );
      return {
        runId: run.id,
        endpointId: run.endpointId,
        endpointName: run.endpointName ?? run.provider,
        model: run.model,
        mentioned: observation?.brandMentioned ?? false,
        position: observation?.brandPosition ?? null,
        citationCount: observation?.citations.length ?? 0,
        citations: observation?.citations ?? [],
      };
    });
    const answered = cells.filter((cell) => cell.citationCount > 0 || cell.mentioned);
    const mentionedCount = cells.filter((cell) => cell.mentioned).length;
    const agreement: MatrixRow['agreement'] =
      mentionedCount === 0
        ? 'none'
        : mentionedCount === cells.length
          ? 'all'
          : 'partial';
    return {
      questionId: question.id,
      questionText: question.text,
      intent: question.intent ?? null,
      cells,
      mentionedCount,
      total: answered.length,
      agreement,
    };
  });

  const pairwise: ConsistencyReport['pairwise'] = [];
  for (let i = 0; i < batchRuns.length; i += 1) {
    for (let j = i + 1; j < batchRuns.length; j += 1) {
      const a = batchRuns[i];
      const b = batchRuns[j];
      const result = jaccard(domainByEndpoint.get(a.id) ?? new Set(), domainByEndpoint.get(b.id) ?? new Set());
      pairwise.push({
        a: a.endpointName ?? a.provider,
        b: b.endpointName ?? b.provider,
        jaccard: result.value,
        shared: result.shared,
      });
    }
  }

  const domainOwners = new Map<string, Set<string>>();
  for (const run of batchRuns) {
    const name = run.endpointName ?? run.provider;
    for (const domain of domainByEndpoint.get(run.id) ?? []) {
      const owners = domainOwners.get(domain) ?? new Set<string>();
      owners.add(name);
      domainOwners.set(domain, owners);
    }
  }

  const exclusiveDomains = batchRuns.map((run) => {
    const name = run.endpointName ?? run.provider;
    const domains = [...(domainByEndpoint.get(run.id) ?? [])].filter(
      (domain) => (domainOwners.get(domain)?.size ?? 0) === 1,
    );
    return { endpoint: name, domains: domains.slice(0, 20) };
  });

  const sharedDomains = [...domainOwners.entries()]
    .filter(([, owners]) => owners.size >= 2)
    .map(([domain, owners]) => ({ domain, endpoints: [...owners] }))
    .sort((a, b) => b.endpoints.length - a.endpoints.length)
    .slice(0, 20);

  return {
    batchId,
    label: batchRuns[0]?.label ?? batchId,
    createdAt: batchRuns.map((run) => run.startedAt).sort()[0] ?? '',
    endpoints,
    rows,
    summary: {
      questions: rows.length,
      endpointCount: batchRuns.length,
      fullAgreement: rows.filter((row) => row.agreement === 'all').length,
      partialAgreement: rows.filter((row) => row.agreement === 'partial').length,
      noneAgreement: rows.filter((row) => row.agreement === 'none').length,
    },
    pairwise,
    exclusiveDomains,
    sharedDomains,
  };
}
