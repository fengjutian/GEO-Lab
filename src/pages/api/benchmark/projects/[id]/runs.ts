import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import {
  addObservation,
  createRun,
  finishRun,
  getProject,
  listObservations,
  listRuns,
} from '@/lib/benchmark/db';
import { askModel, providerConfig, providerInfo } from '@/lib/benchmark/provider';
import { resolveEndpoint, endpointConfigured, defaultEndpoint } from '@/lib/benchmark/endpoints';
import { getEndpoint } from '@/lib/benchmark/db';
import { brandSentencePosition, detectMentions } from '@/lib/benchmark/metrics';
import { MAX_QUESTIONS_PER_RUN } from '@/lib/benchmark/questions';
import { badRequest, json, notFound, readJson, serverError } from '@/lib/benchmark/http';
import type { ProviderConfig } from '@/lib/benchmark/provider';
import type { Project, Question, Run } from '@/lib/benchmark/types';

export const prerender = false;

/** 一批里最多并行几个端点：控制成本与超时，超出请分两批。 */
const MAX_ENDPOINTS_PER_BATCH = 4;
/** 同一问题最多重复观测几次。生成式答案不稳定，重复 3 次足够看出抖动。 */
const MAX_REPEATS_PER_QUESTION = 3;
/** 一批最多发起多少次模型调用，避免误操作产生巨额账单。 */
const MAX_CALLS_PER_BATCH = 240;

export const GET: APIRoute = ({ params }) => {
  const project = await getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');

  const runs = await listRuns(project.id);
  const observations = await listObservations(project.id);
  return json({
    runs: runs.map((run) => ({
      ...run,
      observationCount: observations.filter((observation) => observation.runId === run.id).length,
    })),
  });
};

type RunBody = {
  mode?: unknown;
  label?: unknown;
  limit?: unknown;
  repeats?: unknown;
  endpoints?: unknown;
};

type EndpointSpec = {
  endpointId: string | null;
  name: string;
  providerName: string;
  model: string;
  config: ProviderConfig;
};

export const POST: APIRoute = async ({ params, request }) => {
  const project = await getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');

  const body = (await readJson<RunBody>(request)) ?? {};
  const mode = body.mode === 'manual' ? 'manual' : 'auto';
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const label =
    typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 80)
      : mode === 'auto'
        ? `自动运行 ${stamp}`
        : `手工记录 ${stamp}`;

  if (mode === 'manual') {
    const run = await createRun({
      projectId: project.id,
      label,
      provider: 'manual',
      model: '—',
      status: 'manual',
      note: '手工记录：答案由人工粘贴，指标由系统按同一口径计算。',
    });
    return json({ run, runs: [run] }, 201);
  }

  if (project.questions.length === 0) return badRequest('项目还没有问题，请先添加问题');

  const requestedLimit = Number(body.limit);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), MAX_QUESTIONS_PER_RUN)
      : Math.min(project.questions.length, MAX_QUESTIONS_PER_RUN);
  const questions = project.questions.slice(0, limit);

  const requestedRepeats = Number(body.repeats);
  const repeats =
    Number.isFinite(requestedRepeats) && requestedRepeats > 1
      ? Math.min(Math.floor(requestedRepeats), MAX_REPEATS_PER_QUESTION)
      : 1;

  /* 解析端点：显式指定则并行对比，否则退回默认单一端点 */
  const requestedIds = Array.isArray(body.endpoints)
    ? body.endpoints.map((value) => (typeof value === 'string' ? value : '')).filter(Boolean)
    : [];

  let specs: EndpointSpec[] = [];
  let batchId: string | null = null;

  if (requestedIds.length > 0) {
    if (requestedIds.length > MAX_ENDPOINTS_PER_BATCH) {
      return badRequest(`一批最多并行 ${MAX_ENDPOINTS_PER_BATCH} 个端点`);
    }
    const missing: string[] = [];
    const unknown: string[] = [];
    for (const id of requestedIds) {
      const endpoint = await getEndpoint(id);
      if (!endpoint) {
        unknown.push(id);
        continue;
      }
      if (!endpoint.enabled) continue;
      if (!endpointConfigured(endpoint)) {
        missing.push(`${endpoint.name}（缺少环境变量 ${endpoint.apiKeyEnv}）`);
        continue;
      }
      specs.push({
        endpointId: endpoint.id,
        name: endpoint.name,
        providerName: 'openai-compatible',
        model: endpoint.model,
        config: resolveEndpoint(endpoint),
      });
    }
    if (unknown.length > 0) return badRequest('包含不存在的端点 id');
    if (missing.length > 0) {
      return badRequest(`以下端点缺少密钥环境变量，无法运行：${missing.join('；')}`, { missing });
    }
    if (specs.length === 0) return badRequest('没有可用的端点（可能都被停用了）');
    batchId = randomUUID();
  } else {
    const fallback = defaultEndpoint();
    if (!fallback.info.configured) {
      return badRequest(
        '未配置模型端点，无法自动运行。请设置 GEO_LLM_API_KEY（可选 GEO_LLM_BASE_URL / GEO_LLM_MODEL），或改用「手工记录」。',
        { provider: fallback.info },
      );
    }
    specs = [
      {
        endpointId: null,
        name: '默认端点',
        providerName: 'openai-compatible',
        model: providerConfig().model,
        config: fallback.config,
      },
    ];
  }

  const totalCalls = specs.length * questions.length * repeats;
  if (totalCalls > MAX_CALLS_PER_BATCH) {
    return badRequest(
      `这一批将发起 ${totalCalls} 次模型调用，超过上限 ${MAX_CALLS_PER_BATCH}。请减少问题数、端点数或重复次数。`,
    );
  }

  const repeatSuffix = repeats > 1 ? ` · 重复 ${repeats} 次` : '';
  const batchLabel = `${specs.length > 1 ? `${label}（${specs.length} 端点对比）` : label}${repeatSuffix}`;
  const startedAt = Date.now();

  const results = await Promise.all(
    specs.map((spec) => runSingleEndpoint(project, spec, questions, batchId, batchLabel, repeats)),
  );

  const runs = results.map((result) => result.run);
  const success = results.reduce((sum, result) => sum + result.success, 0);
  const failures = results.reduce((sum, result) => sum + result.failures.length, 0);

  if (success === 0) {
    const sample = results
      .flatMap((result) => result.failures)
      .slice(0, 3)
      .join('；');
    return serverError(
      `本批全部请求失败（${failures} 条，耗时 ${Math.round((Date.now() - startedAt) / 1000)}s）。${sample}`,
    );
  }

  return json({ batchId, runs, success, failures, repeats, questions: questions.length }, 201);
};

async function runSingleEndpoint(
  project: Project,
  spec: EndpointSpec,
  questions: Question[],
  batchId: string | null,
  batchLabel: string,
  repeats: number,
): Promise<{ run: Run; success: number; failures: string[] }> {
  const run = await createRun({
    projectId: project.id,
    label: batchLabel,
    provider: spec.providerName,
    model: spec.model,
    status: 'running',
    batchId,
    endpointId: spec.endpointId,
    endpointName: spec.name,
  });

  const failures: string[] = [];
  let success = 0;
  let resolvedModel = spec.model;

  // 单端点内串行：避免同一账号触发限流；端点之间并行（外层 Promise.all）。
  // 重复观测紧挨着同一问题执行，这样多次采样反映的是同一条件下的抖动，
  // 而不是把不同问题的差异混进稳定性指标。
  for (const question of questions) {
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      try {
        const result = await askModel(question.text, spec.config);
        resolvedModel = result.model;
        await addObservation({
          runId: run.id,
          projectId: project.id,
          questionId: question.id,
          questionText: question.text,
          answer: result.answer,
          citations: result.citations,
          brandMentioned: result.answer.toLowerCase().includes(project.brand.toLowerCase()),
          brandPosition: brandSentencePosition(result.answer, project.brand),
          competitorMentions: detectMentions(result.answer, project.competitors),
          mode: 'auto',
          repeatIndex: repeat,
        });
        success += 1;
      } catch (error) {
        failures.push(`${question.text}: ${(error as Error).message}`);
      }
    }
  }

  const note =
    failures.length === 0
      ? `自动运行完成，成功 ${success} 条。端点 ${spec.name}，模型 ${resolvedModel}，温度 0，逐条串行请求${repeats > 1 ? `，每题重复 ${repeats} 次` : ''}。`
      : `成功 ${success} 条，失败 ${failures.length} 条。失败示例：${failures.slice(0, 3).join('；')}`;

  await finishRun(run.id, success === 0 ? 'failed' : 'completed', note);
  const saved = await listRuns(project.id).find((item) => item.id === run.id) ?? run;
  return { run: saved, success, failures };
}
