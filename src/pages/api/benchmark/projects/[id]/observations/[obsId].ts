import type { APIRoute } from 'astro';
import { deleteObservation, getProject } from '@/lib/benchmark/db';
import { json, notFound } from '@/lib/benchmark/http';

export const prerender = false;

export const DELETE: APIRoute = ({ params }) => {
  const project = getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');
  const removed = deleteObservation(params.obsId ?? '');
  if (!removed) return notFound('记录不存在');
  return json({ deleted: true });
};
