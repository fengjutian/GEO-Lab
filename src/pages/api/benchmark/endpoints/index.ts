import type { APIRoute } from 'astro';
import { createEndpoint, listEndpoints } from '@/lib/benchmark/db';
import { listEndpointStatuses } from '@/lib/benchmark/endpoints';
import { asString, badRequest, json, readJson } from '@/lib/benchmark/http';

export const prerender = false;

export const GET: APIRoute = async () => {
  const endpoints = await listEndpoints();
  return json({
    endpoints: listEndpointStatuses(endpoints),
    captureEnabled: Boolean((process.env.GEO_BENCHMARK_CAPTURE_TOKEN ?? '').trim()),
  });
};

type Body = {
  name?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKeyEnv?: unknown;
  extraBody?: unknown;
  enabled?: unknown;
};

const ENV_NAME = /^[A-Z][A-Z0-9_]{2,63}$/;

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<Body>(request);
  if (!body) return badRequest('请求体必须是 JSON');

  const name = asString(body.name);
  const baseUrl = asString(body.baseUrl);
  const model = asString(body.model);
  const apiKeyEnv = asString(body.apiKeyEnv);

  if (!name) return badRequest('端点名称不能为空');
  if (name.length > 40) return badRequest('端点名称请控制在 40 字以内');
  if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) return badRequest('baseUrl 需要以 http(s):// 开头');
  if (!model) return badRequest('模型名不能为空');
  if (apiKeyEnv && !ENV_NAME.test(apiKeyEnv)) {
    return badRequest('apiKeyEnv 必须是环境变量名，例如 OPENAI_API_KEY');
  }

  let extraBody: Record<string, unknown> = {};
  if (body.extraBody !== undefined) {
    if (typeof body.extraBody !== 'object' || body.extraBody === null || Array.isArray(body.extraBody)) {
      return badRequest('extraBody 必须是 JSON 对象');
    }
    extraBody = body.extraBody as Record<string, unknown>;
  }

  try {
    const endpoint = await createEndpoint({
      name,
      baseUrl,
      model,
      apiKeyEnv,
      extraBody,
      enabled: body.enabled !== false,
    });
    return json({ endpoint: listEndpointStatuses([endpoint])[0] }, 201);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('UNIQUE')) return badRequest('端点名称已存在');
    return badRequest(message);
  }
};
