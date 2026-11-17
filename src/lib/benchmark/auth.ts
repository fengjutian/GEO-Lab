import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 可选访问控制。
 *
 * 设计原则：
 * - 只有设置 GEO_BENCHMARK_ADMIN_TOKEN 才启用；未设置时行为与之前一致（本地开发友好）。
 * - 会话 Cookie 不是明文 token，而是用 token 作为密钥的 HMAC，避免 Cookie 泄露等价于泄露管理口令。
 * - 采集接口（/api/benchmark/capture/*）走自己的 token + CORS，不参与这套 Cookie 鉴权。
 */

export const SESSION_COOKIE = 'geo_benchmark_admin';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** 不参与登录保护的路径：登录页、登录/登出接口、浏览器采集接口。 */
const PUBLIC_PATHS = ['/benchmark/login', '/api/benchmark/auth/', '/api/benchmark/capture/'];

export function adminToken(): string {
  return (process.env.GEO_BENCHMARK_ADMIN_TOKEN ?? '').trim();
}

export function authRequired(): boolean {
  return adminToken().length > 0;
}

export function sessionValue(): string {
  const token = adminToken();
  if (!token) return '';
  return createHmac('sha256', token).update('geo-lab-admin-session-v1').digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifySession(candidate: string | undefined | null): boolean {
  if (!authRequired()) return true;
  if (!candidate) return false;
  return safeEqual(candidate, sessionValue());
}

export function verifyToken(candidate: string | undefined | null): boolean {
  const token = adminToken();
  if (!token) return true;
  if (!candidate) return false;
  return safeEqual(candidate.trim(), token);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/** 需要保护的前缀：工作台页面与数据接口。 */
export function isProtectedPath(pathname: string): boolean {
  if (isPublicPath(pathname)) return false;
  return (
    pathname === '/benchmark' ||
    pathname.startsWith('/benchmark/') ||
    pathname.startsWith('/api/benchmark')
  );
}

/** 只允许跳回站内的 benchmark 路径，避免开放重定向。 */
export function safeNext(next: string | null): string {
  if (!next) return '/benchmark/';
  if (!next.startsWith('/benchmark')) return '/benchmark/';
  if (next.startsWith('//')) return '/benchmark/';
  return next;
}

export function sessionCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: import.meta.env.PROD,
    maxAge: SESSION_MAX_AGE,
  };
}
