import type { APIRoute } from 'astro';
import { getProject, replaceQuestions } from '@/lib/benchmark/db';
import { INTENTS, type Intent } from '@/lib/benchmark/types';
import { badRequest, json, notFound, readJson } from '@/lib/benchmark/http';

export const prerender = false;

const MAX_QUESTIONS = 50;

type QuestionInput = { text?: unknown; intent?: unknown };

function normalize(items: unknown): { text: string; intent: Intent }[] {
  if (!Array.isArray(items)) return [];
  const result: { text: string; intent: Intent }[] = [];
  for (const item of items as QuestionInput[]) {
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    if (!text) continue;
    const intent = INTENTS.includes(item?.intent as Intent) ? (item.intent as Intent) : '认知';
    result.push({ text: text.slice(0, 200), intent });
  }
  return result.slice(0, MAX_QUESTIONS);
}

export const PUT: APIRoute = async ({ params, request }) => {
  const project = getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');

  const body = await readJson<{ questions?: unknown }>(request);
  if (!body) return badRequest('请求体必须是 JSON');

  const questions = normalize(body.questions);
  if (questions.length === 0) return badRequest('至少保留一个问题');
  if (questions.length > MAX_QUESTIONS) return badRequest(`问题数量不能超过 ${MAX_QUESTIONS}`);

  const saved = replaceQuestions(project.id, questions);
  return json({ questions: saved });
};

export const POST: APIRoute = async ({ params, request }) => {
  const project = getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');

  const body = await readJson<QuestionInput>(request);
  if (!body) return badRequest('请求体必须是 JSON');

  const next = normalize([...project.questions, body]);
  if (next.length === project.questions.length) return badRequest('问题内容为空');
  if (next.length > MAX_QUESTIONS) return badRequest(`问题数量不能超过 ${MAX_QUESTIONS}`);

  const saved = replaceQuestions(project.id, next);
  return json({ questions: saved }, 201);
};
