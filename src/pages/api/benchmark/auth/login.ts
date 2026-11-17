import type { APIRoute } from 'astro';
import {
  SESSION_COOKIE,
  authRequired,
  safeNext,
  sessionCookieOptions,
  sessionValue,
  verifyToken,
} from '@/lib/benchmark/auth';

export const prerender = false;

/**
 * 登录：支持普通表单（浏览器）与 JSON（脚本）。
 * 成功后写入 HMAC 会话 Cookie，然后 303 跳回 next。
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!authRequired()) return redirect('/benchmark/', 303);

  const contentType = request.headers.get('content-type') ?? '';
  let token = '';
  let next = '/benchmark/';

  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as { token?: unknown; next?: unknown };
    token = typeof body.token === 'string' ? body.token : '';
    next = typeof body.next === 'string' ? body.next : next;
  } else {
    const form = await request.formData().catch(() => null);
    token = String(form?.get('token') ?? '');
    next = String(form?.get('next') ?? next);
  }

  const target = safeNext(next);

  if (!verifyToken(token)) {
    return redirect(`/benchmark/login?error=1&next=${encodeURIComponent(target)}`, 303);
  }

  cookies.set(SESSION_COOKIE, sessionValue(), sessionCookieOptions());

  if (contentType.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true, next: target }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return redirect(target, 303);
};
