import type { APIRoute } from 'astro';
import { createProject, listProjects, listRuns } from '@/lib/benchmark/db';
import { asString, asStringArray, badRequest, json, readJson } from '@/lib/benchmark/http';
import { seedDemoProject } from '@/lib/benchmark/demo';
import { defaultQuestions } from '@/lib/benchmark/questions';
import { replaceQuestions } from '@/lib/benchmark/db';

export const prerender = false;

export const GET: APIRoute = () => {
  const projects = listProjects().map((project) => {
    const runs = listRuns(project.id);
    return {
      id: project.id,
      name: project.name,
      brand: project.brand,
      site: project.site,
      isDemo: project.isDemo,
      createdAt: project.createdAt,
      questionCount: project.questions.length,
      runCount: runs.length,
      lastRunAt: runs[0]?.startedAt ?? null,
    };
  });
  return json({ projects });
};

type CreateBody = {
  name?: unknown;
  brand?: unknown;
  site?: unknown;
  competitors?: unknown;
  demo?: unknown;
  seedQuestions?: unknown;
};

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<CreateBody>(request);
  if (!body) return badRequest('请求体必须是 JSON');

  if (body.demo === true) {
    const project = seedDemoProject();
    return json({ project }, 201);
  }

  const name = asString(body.name);
  const brand = asString(body.brand);
  const site = asString(body.site);
  const competitors = asStringArray(body.competitors);

  if (!name) return badRequest('项目名称不能为空');
  if (name.length > 80) return badRequest('项目名称请控制在 80 字以内');
  if (!brand) return badRequest('品牌名不能为空');
  if (brand.length > 60) return badRequest('品牌名请控制在 60 字以内');
  if (site && !/^https?:\/\/[^\s]+$/.test(site)) return badRequest('站点需要以 http(s):// 开头的完整网址');

  const project = createProject({ name, brand, site, competitors });

  if (body.seedQuestions !== false) {
    replaceQuestions(project.id, defaultQuestions({ brand, competitors }));
  }

  // 重新读取：createProject 返回的是写入问题集之前的快照
  return json({ project: getProject(project.id) ?? project }, 201);
};
