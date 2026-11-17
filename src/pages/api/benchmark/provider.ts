import type { APIRoute } from 'astro';
import { providerInfo } from '@/lib/benchmark/provider';
import { json } from '@/lib/benchmark/http';

export const prerender = false;

export const GET: APIRoute = () => json({ provider: providerInfo() });
