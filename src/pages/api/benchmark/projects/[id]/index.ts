import type { APIRoute } from 'astro';
import {
  deleteProject,
  getProject,
  listObservations,
  listRuns,
  updateProject,
} from '@/lib/benchmark/db';
import { computeMetrics } from '@/lib/benchmark/metrics';
import { groupBatches } from '@/lib/benchmark/consistency';
import { asString, asStringArray, badRequest, json, notFound, readJson } from '@/lib/benchmark/http';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const project = await getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');

  const runs = await listRuns(project.id);
  const observations = await listObservations(project.id);
  const latestRun = runs[0];
  const latestObservations = latestRun
    ? observations.filter((observation) => observation.runId === latestRun.id)
    : [];

  return json({
    project,
    runs,
    observations,
    batches: groupBatches(runs),
    metrics: computeMetrics(project, observations, project.questions),
    latest: latestRun
      ? {
          run: latestRun,
          metrics: computeMetrics(project, latestObservations, project.questions),
        }
      : null,
  });
};

type PatchBody = { name?: unknown; brand?: unknown; site?: unknown; competitors?: unknown };

export const PATCH: APIRoute = async ({ params, request }) => {
  const body = await readJson<PatchBody>(request);
  if (!body) return badRequest('请求体必须是 JSON');

  const existing = await getProject(params.id ?? '');
  if (!existing) return notFound('项目不存在');

  const name = body.name === undefined ? undefined : asString(body.name);
  if (name !== undefined && !name) return badRequest('项目名称不能为空');

  const updated = await updateProject(existing.id, {
    name,
    brand: body.brand === undefined ? undefined : asString(body.brand),
    site: body.site === undefined ? undefined : asString(body.site),
    competitors: body.competitors === undefined ? undefined : asStringArray(body.competitors),
  });
  return json({ project: updated });
};

export const DELETE: APIRoute = async ({ params }) => {
  const existing = await getProject(params.id ?? '');
  if (!existing) return notFound('项目不存在');
  await deleteProject(existing.id);
  return json({ deleted: true });
};
