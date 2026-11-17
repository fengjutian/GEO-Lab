import type { APIRoute } from 'astro';
import {
  deleteProject,
  getProject,
  listObservations,
  listRuns,
  updateProject,
} from '@/lib/benchmark/db';
import { computeMetrics } from '@/lib/benchmark/metrics';
import { asString, asStringArray, badRequest, json, notFound, readJson } from '@/lib/benchmark/http';

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const project = getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');

  const runs = listRuns(project.id);
  const observations = listObservations(project.id);
  const latestRun = runs[0];
  const latestObservations = latestRun
    ? observations.filter((observation) => observation.runId === latestRun.id)
    : [];

  return json({
    project,
    runs,
    observations,
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

  const existing = getProject(params.id ?? '');
  if (!existing) return notFound('项目不存在');

  const name = body.name === undefined ? undefined : asString(body.name);
  if (name !== undefined && !name) return badRequest('项目名称不能为空');

  const updated = updateProject(existing.id, {
    name,
    brand: body.brand === undefined ? undefined : asString(body.brand),
    site: body.site === undefined ? undefined : asString(body.site),
    competitors: body.competitors === undefined ? undefined : asStringArray(body.competitors),
  });
  return json({ project: updated });
};

export const DELETE: APIRoute = ({ params }) => {
  const existing = getProject(params.id ?? '');
  if (!existing) return notFound('项目不存在');
  deleteProject(existing.id);
  return json({ deleted: true });
};
