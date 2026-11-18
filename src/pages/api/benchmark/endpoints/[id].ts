import type { APIRoute } from 'astro';
import { deleteEndpoint, getEndpoint, updateEndpoint } from '@/lib/benchmark/db';
import { endpointStatus } from '@/lib/benchmark/endpoints';
import { asString, badRequest, json, notFound, readJson } from '@/lib/benchmark/http';

export const prerender = false;

type Body = {
  name?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKeyEnv?: unknown;
  extraBody?: unknown;
  enabled?: unknown;
};

export const GET: APIRoute = ({ params }) => {
  const endpoint = await getEndpoint(params.id ?? '');
  if (!endpoint) return notFound('端点不存在');
  return json({ endpoint: endpointStatus(endpoint) });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const existing = await getEndpoint(params.id ?? '');
  if (!existing) return notFound('端点不存在');

  const body = await readJson<Body>(request);
  if (!body) return badRequest('请求体必须是 JSON');

  const baseUrl = body.baseUrl === undefined ? undefined : asString(body.baseUrl);
  if (baseUrl !== undefined && !/^https?:\/\/[^\s]+$/.test(baseUrl)) {
    return badRequest('baseUrl 需要以 http(s):// 开头');
  }

  const extraBody =
    body.extraBody === undefined
      ? undefined
      : typeof body.extraBody === 'object' && body.extraBody !== null && !Array.isArray(body.extraBody)
        ? (body.extraBody as Record<string, unknown>)
        : null;
  if (extraBody === null) return badRequest('extraBody 必须是 JSON 对象');

  try {
    const updated = await updateEndpoint(existing.id, {
      name: body.name === undefined ? undefined : asString(body.name),
      baseUrl,
      model: body.model === undefined ? undefined : asString(body.model),
      apiKeyEnv: body.apiKeyEnv === undefined ? undefined : asString(body.apiKeyEnv),
      extraBody,
      enabled: body.enabled === undefined ? undefined : body.enabled !== false,
    });
    if (!updated) return notFound('端点不存在');
    return json({ endpoint: endpointStatus(updated) });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('UNIQUE')) return badRequest('端点名称已存在');
    return badRequest(message);
  }
};

export const DELETE: APIRoute = ({ params }) => {
  const existing = await getEndpoint(params.id ?? '');
  if (!existing) return notFound('端点不存在');
  await deleteEndpoint(existing.id);
  return json({ deleted: true });
};
