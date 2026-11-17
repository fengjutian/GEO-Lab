import type { APIRoute } from 'astro';
import { SESSION_COOKIE } from '@/lib/benchmark/auth';

export const prerender = false;

/** 登出：清除会话 Cookie 后回到登录页。 */
export const GET: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect('/benchmark/login', 303);
};

export const POST = GET;
