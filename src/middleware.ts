import { defineMiddleware } from 'astro:middleware';
import {
  SESSION_COOKIE,
  authRequired,
  isProtectedPath,
  safeNext,
  verifySession,
  verifyToken,
} from '@/lib/benchmark/auth';

/**
 * 只在启用了 GEO_BENCHMARK_ADMIN_TOKEN 时生效：
 * - 工作台页面：无有效会话则跳转到 /benchmark/login?next=...
 * - 工作台 API：返回 401 JSON，避免前端拿到 HTML 登录页而解析失败
 * - 采集接口与登录接口保持公开（各自有自己的 token 校验）
 *
 * 也接受 x-geo-admin-token 请求头，便于脚本与 CI 自动化。
 */
export const onRequest = defineMiddleware((context, next) => {
  if (!authRequired()) return next();

  const { pathname } = context.url;
  if (!isProtectedPath(pathname)) return next();

  const cookie = context.cookies.get(SESSION_COOKIE)?.value;
  const header = context.request.headers.get('x-geo-admin-token');
  if (verifySession(cookie) || verifyToken(header)) return next();

  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: '需要登录：未检测到有效的工作台会话' }), {
      status: 401,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  const nextPath = safeNext(`${pathname}${context.url.search}`);
  return context.redirect(`/benchmark/login?next=${encodeURIComponent(nextPath)}`, 303);
});
