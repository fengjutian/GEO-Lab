/** API 响应助手：统一 JSON 结构与错误码，避免每个路由各写一套。 */

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function badRequest(message: string, details?: unknown): Response {
  return json({ error: message, details }, 400);
}

export function notFound(message = '资源不存在'): Response {
  return json({ error: message }, 404);
}

export function serverError(message: string): Response {
  return json({ error: message }, 500);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 12);
}
