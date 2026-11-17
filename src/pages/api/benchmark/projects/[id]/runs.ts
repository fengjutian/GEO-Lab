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
import { brandSentencePosition, detectMentions } from '@/lib/benchmark/metrics';
import { MAX_QUESTIONS_PER_RUN } from '@/lib/benchmark/questions';
import { badRequest, json, notFound, readJson, serverError } from '@/lib/benchmark/http';

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const project = getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');

  const runs = listRuns(project.id);
  const observations = listObservations(project.id);
  return json({
    runs: runs.map((run) => ({
      ...run,
      observationCount: observations.filter((observation) => observation.runId === run.id).length,
    })),
  });
};

type RunBody = { mode?: unknown; label?: unknown; limit?: unknown };

export const POST: APIRoute = async ({ params, request }) => {
  const project = getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');

  const body = (await readJson<RunBody>(request)) ?? {};
  const mode = body.mode === 'manual' ? 'manual' : 'auto';
  const info = providerInfo();

  const label =
    typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 80)
      : mode === 'auto'
        ? `自动运行 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
        : `手工记录 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

  if (mode === 'manual') {
    const run = createRun({
      projectId: project.id,
      label,
      provider: 'manual',
      model: '—',
      status: 'manual',
      note: '手工记录：答案由人工粘贴，指标由系统按同一口径计算。',
    });
    return json({ run }, 201);
  }

  if (!info.configured) {
    return badRequest(
      '未配置模型端点，无法自动运行。请设置 GEO_LLM_API_KEY（可选 GEO_LLM_BASE_URL / GEO_LLM_MODEL），或改用「手工记录」。',
      { provider: info },
    );
  }

  if (project.questions.length === 0) return badRequest('项目还没有问题，请先添加问题');

  const requestedLimit = Number(body.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), MAX_QUESTIONS_PER_RUN)
    : Math.min(project.questions.length, MAX_QUESTIONS_PER_RUN);
  const questions = project.questions.slice(0, limit);

  const config = providerConfig();
  const run = createRun({
    projectId: project.id,
    label,
    provider: 'openai-compatible',
    model: config.model,
    status: 'running',
  });

  const failures: string[] = [];
  let success = 0;
  let resolvedModel = config.model;

  for (const question of questions) {
    try {
      const result = await askModel(question.text, config);
      resolvedModel = result.model;
      addObservation({
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
      });
      success += 1;
    } catch (error) {
      failures.push(`${question.text}: ${(error as Error).message}`);
    }
  }

  const note =
    failures.length === 0
      ? `自动运行完成，成功 ${success} 条。模型 ${resolvedModel}，温度 0，逐条串行请求。`
      : `成功 ${success} 条，失败 ${failures.length} 条。失败示例：${failures.slice(0, 3).join('；')}`;

  if (success === 0) {
    finishRun(run.id, 'failed', note);
    return serverError(`全部 ${failures.length} 条请求失败。${note}`);
  }

  finishRun(run.id, failures.length > 0 ? 'failed' : 'completed', note);

  const runs = listRuns(project.id);
  const saved = runs.find((item) => item.id === run.id)!;
  return json({ run: saved, success, failures: failures.length }, 201);
};
