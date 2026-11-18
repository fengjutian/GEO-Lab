#!/usr/bin/env node
/**
 * 远端存储（libSQL HTTP）端到端测试。
 *
 *   node scripts/test-store.mjs
 *
 * 会自行启动：
 *   - scripts/mock-libsql.mjs（端口 4400，内部用 node:sqlite 真实执行 SQL）
 *   - astro dev（端口 4322，GEO_BENCHMARK_DB_URL 指向 mock）
 *
 * 验证的是“同一套业务代码换成 HTTP 存储后仍然工作”，包含迁移、CRUD、指标、导出与采集。
 */
import { spawn } from 'node:child_process';

const APP_PORT = Number(process.env.GEO_STORE_TEST_PORT ?? 4322);
const base = `http://localhost:${APP_PORT}`;
const adminToken = 'store-test-admin';
const captureToken = 'store-test-capture';
let failures = 0;

function check(name, condition, detail = '') {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const headers = { 'content-type': 'application/json', 'x-geo-admin-token': adminToken };
async function api(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return true;
    } catch {
      /* not ready */
    }
    await sleep(1000);
  }
  return false;
}

console.log('启动 mock libSQL 与 dev server…');
const mock = spawn(process.execPath, ['scripts/mock-libsql.mjs', '4400'], { stdio: 'ignore' });
const app = spawn(
  process.execPath,
  ['node_modules/astro/astro.js', 'dev', '--port', String(APP_PORT)],
  {
    stdio: 'ignore',
    env: {
      ...process.env,
      GEO_BENCHMARK_DB_URL: 'http://127.0.0.1:4400',
      GEO_BENCHMARK_DB_TOKEN: 'store-test-token',
      GEO_BENCHMARK_ADMIN_TOKEN: adminToken,
      GEO_BENCHMARK_CAPTURE_TOKEN: captureToken,
      MOCK_LIBSQL_TOKEN: '',
    },
  },
);

// mock 端点上加了 token 校验时会有 401，这里显式关闭，便于简化测试
const cleanup = () => {
  app.kill();
  mock.kill();
};
process.on('exit', cleanup);

const ready = await waitFor(`${base}/api/benchmark/provider`, 90);
if (!ready) {
  console.log('dev server 未就绪，测试中止。');
  cleanup();
  process.exit(1);
}

console.log('\n1. 存储后端');
const list = await api('/api/benchmark/projects');
check('项目列表可访问', list.status === 200, `status=${list.status}`);
check('使用 libsql-http 后端', list.body?.store?.kind === 'libsql-http', JSON.stringify(list.body?.store));
check('存储位置指向 mock 端点', (list.body?.store?.location ?? '').includes('127.0.0.1:4400'));

console.log('\n2. 项目 CRUD 经 HTTP 存储');
const created = await api('/api/benchmark/projects', {
  method: 'POST',
  body: JSON.stringify({
    name: '远端存储测试项目',
    brand: 'GEO Lab',
    site: 'https://geolab.dev',
    competitors: ['Surfer'],
  }),
});
const projectId = created.body?.project?.id;
check('创建项目返回 201', created.status === 201, `status=${created.status} ${created.body?.error ?? ''}`);
check('创建时生成 20 个问题', created.body?.project?.questions?.length === 20);

const detail = await api(`/api/benchmark/projects/${projectId}`);
check('读取详情返回 200', detail.status === 200);
check('问题集从远端读回', detail.body?.project?.questions?.length === 20);

const renamed = await api(`/api/benchmark/projects/${projectId}`, {
  method: 'PATCH',
  body: JSON.stringify({ name: '远端存储测试项目（改名）' }),
});
check('更新项目名称', renamed.body?.project?.name === '远端存储测试项目（改名）');

console.log('\n3. 手工记录与指标');
const run = await api(`/api/benchmark/projects/${projectId}/runs`, {
  method: 'POST',
  body: JSON.stringify({ mode: 'manual' }),
});
const runId = run.body?.run?.id;
const questionId = detail.body?.project?.questions?.[0]?.id;
const observation = await api(`/api/benchmark/projects/${projectId}/observations`, {
  method: 'POST',
  body: JSON.stringify({
    runId,
    questionId,
    answer:
      'GEO Lab 是一个研究 GEO 的平台。来源：https://geolab.dev/about/ 与 https://www.surfer.com/',
  }),
});
check('写入手工记录', observation.status === 201, `status=${observation.status}`);
check('提及与引用解析正确', observation.body?.observation?.brandMentioned === true && observation.body?.observation?.citations?.length === 2);

const withMetrics = await api(`/api/benchmark/projects/${projectId}`);
check('指标计算正常', Math.abs((withMetrics.body?.metrics?.mentionRate ?? 0) - 1) < 0.001);
check('记录数正确', withMetrics.body?.metrics?.total === 1);

console.log('\n4. 问题集替换');
const replaced = await api(`/api/benchmark/projects/${projectId}/questions`, {
  method: 'PUT',
  body: JSON.stringify({ questions: [{ text: '远端问题一？', intent: '认知' }] }),
});
check('替换问题集', replaced.body?.questions?.length === 1);

console.log('\n5. 导出与采集');
const csv = await fetch(`${base}/api/benchmark/projects/${projectId}/export?format=csv`, { headers });
const csvBytes = new Uint8Array(await csv.arrayBuffer());
check('CSV 导出返回 200', csv.status === 200);
check('CSV 带 BOM', csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf);

const match = await fetch(`${base}/api/benchmark/capture/match`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    token: captureToken,
    projectId,
    answer: '远端问题一的回答。来源：https://geolab.dev/',
  }),
});
const matchBody = await match.json();
check('采集候选匹配返回 200', match.status === 200, `status=${match.status}`);

const commit = await fetch(`${base}/api/benchmark/capture/commit`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    token: captureToken,
    projectId,
    questionId: matchBody?.candidates?.[0]?.questionId ?? replaced.body?.questions?.[0]?.id,
    answer: '远端问题一的回答。来源：https://geolab.dev/',
    endpointLabel: 'Perplexity',
  }),
});
check('采集写入返回 201', commit.status === 201, `status=${commit.status}`);

console.log('\n6. 删除与清理');
const removed = await api(`/api/benchmark/projects/${projectId}`, { method: 'DELETE' });
check('删除项目返回 200', removed.status === 200);
const gone = await api(`/api/benchmark/projects/${projectId}`);
check('删除后读取返回 404', gone.status === 404);
const finalList = await api('/api/benchmark/projects');
check('项目列表为空', (finalList.body?.projects ?? []).length === 0);

console.log(failures === 0 ? '\n全部通过。' : `\n${failures} 项失败。`);
cleanup();
process.exit(failures === 0 ? 0 : 1);
