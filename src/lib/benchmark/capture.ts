import type { Project, Question } from './types';
import { tokenize } from '@/features/shared/text';

/**
 * 浏览器采集（书签小工具）的服务端支持。
 *
 * 书签运行在第三方页面上（例如 ChatGPT、Perplexity），因此：
 * - 接口需要允许跨域（CORS），并用一个共享 token 鉴权；
 * - 答案文本里没有可靠的问题 id，只能按词面重叠给出候选，由用户确认；
 * - 采集结果进入「浏览器采集 · <端点> · <日期>」运行，与自动/手工记录同一口径。
 */

export function captureToken(): string {
  return (process.env.GEO_BENCHMARK_CAPTURE_TOKEN ?? '').trim();
}

export function captureEnabled(): boolean {
  return captureToken().length > 0;
}

export function tokenMatches(candidate: string | null | undefined): boolean {
  const expected = captureToken();
  if (!expected) return false;
  return typeof candidate === 'string' && candidate === expected;
}

export type QuestionCandidate = {
  questionId: string;
  text: string;
  intent: string;
  score: number;
};

/** 词面重叠打分：不调用模型，可解释、离线可复现。 */
export function matchQuestions(project: Project, answer: string, limit = 3): QuestionCandidate[] {
  const answerTerms = new Set(tokenize(answer));
  if (answerTerms.size === 0) return [];

  return project.questions
    .map((question: Question) => {
      const terms = [...new Set(tokenize(question.text))];
      if (terms.length === 0) return { questionId: question.id, text: question.text, intent: question.intent, score: 0 };
      const hits = terms.filter((term) => answerTerms.has(term)).length;
      return {
        questionId: question.id,
        text: question.text,
        intent: question.intent,
        score: Number((hits / terms.length).toFixed(3)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function captureRunLabel(endpointLabel: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const label = endpointLabel.trim().slice(0, 30) || '未标注';
  return `浏览器采集 · ${label} · ${date}`;
}

export const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-geo-token',
  'access-control-max-age': '86400',
};

export function corsJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
