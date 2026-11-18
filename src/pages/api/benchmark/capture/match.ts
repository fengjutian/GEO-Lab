import type { APIRoute } from 'astro';
import { getProject } from '@/lib/benchmark/db';
import {
  captureEnabled,
  corsJson,
  corsPreflight,
  matchQuestions,
  tokenMatches,
} from '@/lib/benchmark/capture';

export const prerender = false;

export const OPTIONS: APIRoute = () => corsPreflight();

type Body = { token?: unknown; projectId?: unknown; answer?: unknown };

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

  const headerToken = request.headers.get('x-geo-token');
  const token = typeof body.token === 'string' ? body.token : headerToken;
  if (!tokenMatches(token)) return corsJson({ error: '采集 token 不正确' }, 401);

  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const project = await getProject(projectId);
  if (!project) return corsJson({ error: '项目不存在' }, 404);

  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  if (answer.length < 10) return corsJson({ error: '答案内容过短（至少 10 字）' }, 400);
  if (answer.length > 20000) return corsJson({ error: '答案内容过长（上限 20000 字）' }, 400);

  return corsJson({
    project: { id: project.id, name: project.name, brand: project.brand },
    candidates: matchQuestions(project, answer),
  });
};
