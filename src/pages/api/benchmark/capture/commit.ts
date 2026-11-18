import type { APIRoute } from 'astro';
import {
  addObservation,
  createRun,
  getProject,
  listRuns,
} from '@/lib/benchmark/db';
import {
  brandSentencePosition,
  detectMentions,
  extractCitations,
} from '@/lib/benchmark/metrics';
import {
  captureEnabled,
  captureRunLabel,
  corsJson,
  corsPreflight,
  tokenMatches,
} from '@/lib/benchmark/capture';

export const prerender = false;

export const OPTIONS: APIRoute = () => corsPreflight();

type Body = {
  token?: unknown;
  projectId?: unknown;
  questionId?: unknown;
  answer?: unknown;
  endpointLabel?: unknown;
  sourceUrl?: unknown;
};

export const POST: APIRoute = async ({ request }) => {
  if (!captureEnabled()) {
    return corsJson({ error: '未启用浏览器采集：请在服务端设置 GEO_BENCHMARK_CAPTURE_TOKEN' }, 403);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return corsJson({ error: '请求体必须是 JSON' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token : request.headers.get('x-geo-token');
  if (!tokenMatches(token)) return corsJson({ error: '采集 token 不正确' }, 401);

  const project = await getProject(typeof body.projectId === 'string' ? body.projectId : '');
  if (!project) return corsJson({ error: '项目不存在' }, 404);

  const question = project.questions.find((item) => item.id === body.questionId);
  if (!question) return corsJson({ error: '问题不属于该项目' }, 400);

  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  if (answer.length < 10) return corsJson({ error: '答案内容过短（至少 10 字）' }, 400);

  const endpointLabel = typeof body.endpointLabel === 'string' ? body.endpointLabel : '';
  const label = captureRunLabel(endpointLabel);

  // 同一天、同一端点标签复用同一个运行，避免每次点击都生成新批次。
  const existing = (await listRuns(project.id)).find(
    (run) => run.label === label && run.provider === 'browser-capture',
  );
  const run =
    existing ??
    await createRun({
      projectId: project.id,
      label,
      provider: 'browser-capture',
      model: '—',
      status: 'manual',
      note: '浏览器采集：由书签小工具在第三方 AI 页面提交，答案原文由用户触发采集。',
    });

  const citations = extractCitations(answer);
  const brandMentioned = answer.toLowerCase().includes(project.brand.toLowerCase());
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.slice(0, 500) : '';

  const observation = await addObservation({
    runId: run.id,
    projectId: project.id,
    questionId: question.id,
    questionText: question.text,
    answer,
    citations,
    brandMentioned,
    brandPosition: brandSentencePosition(answer, project.brand),
    competitorMentions: detectMentions(answer, project.competitors),
    mode: 'manual',
  });

  return corsJson({
    observation,
    run: { id: run.id, label: run.label },
    project: { id: project.id, name: project.name },
    question: { id: question.id, text: question.text },
    brandMentioned,
    citationCount: citations.length,
    sourceUrl,
  }, 201);
};
