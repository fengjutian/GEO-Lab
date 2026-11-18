import type { APIRoute } from 'astro';
import { addObservation, getProject, listObservations, listRuns } from '@/lib/benchmark/db';
import {
  brandSentencePosition,
  detectMentions,
  extractCitations,
} from '@/lib/benchmark/metrics';
import { asString, badRequest, json, notFound, readJson } from '@/lib/benchmark/http';

export const prerender = false;

export const GET: APIRoute = ({ params, url }) => {
  const project = await getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');
  const runId = url.searchParams.get('runId') ?? undefined;
  return json({ observations: listObservations(project.id, runId) });
};

type ObservationBody = {
  runId?: unknown;
  questionId?: unknown;
  questionText?: unknown;
  answer?: unknown;
  brandMentioned?: unknown;
  brandPosition?: unknown;
};

export const POST: APIRoute = async ({ params, request }) => {
  const project = await getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');

  const body = await readJson<ObservationBody>(request);
  if (!body) return badRequest('请求体必须是 JSON');

  const runId = asString(body.runId);
  if (!runId) return badRequest('缺少 runId：手工记录必须挂在某次运行下');
  const run = await listRuns(project.id).find((item) => item.id === runId);
  if (!run) return badRequest('runId 不属于该项目');

  const answer = asString(body.answer);
  if (answer.length < 10) return badRequest('答案内容过短（至少 10 字）');
  if (answer.length > 20000) return badRequest('答案内容过长（上限 20000 字）');

  const questionId = asString(body.questionId);
  const question = project.questions.find((item) => item.id === questionId);
  if (!question) return badRequest('questionId 不属于该项目的问题集');

  const citations = extractCitations(answer);
  const autoMentioned = answer.toLowerCase().includes(project.brand.toLowerCase());
  const brandMentioned = typeof body.brandMentioned === 'boolean' ? body.brandMentioned : autoMentioned;
  const autoPosition = brandSentencePosition(answer, project.brand);
  const brandPosition =
    typeof body.brandPosition === 'number' && Number.isFinite(body.brandPosition)
      ? Math.max(1, Math.floor(body.brandPosition))
      : autoPosition;

  const observation = await addObservation({
    runId,
    projectId: project.id,
    questionId: question.id,
    questionText: question.text,
    answer,
    citations,
    brandMentioned,
    brandPosition: brandMentioned ? brandPosition : null,
    competitorMentions: detectMentions(answer, project.competitors),
    mode: 'manual',
  });

  return json({ observation }, 201);
};
