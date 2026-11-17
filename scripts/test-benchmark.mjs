#!/usr/bin/env node
/**
 * 可见性工作台端到端测试（需要先启动服务端）。
 *
 *   GEO_BENCHMARK_CAPTURE_TOKEN=test-capture-token pnpm dev
 *   GEO_TEST_CAPTURE_TOKEN=test-capture-token node scripts/test-benchmark.mjs http://localhost:4321
 *
 * 启用访问控制后再加：
 *   GEO_BENCHMARK_ADMIN_TOKEN=test-admin-token pnpm dev
 *   GEO_TEST_ADMIN_TOKEN=test-admin-token node scripts/test-benchmark.mjs http://localhost:4321
 *
 * 覆盖：鉴权、示例项目、指标口径、手工记录、问题集、导出、多端点并行与一致性、浏览器采集、删除。
 * 多端点部分会自行启动 scripts/mock-llm.mjs（端口 4399），不调用真实模型。
 */
import { spawn } from 'node:child_process';

const base = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const adminToken = process.env.GEO_TEST_ADMIN_TOKEN ?? '';
let failures = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** 启用鉴权时，脚本用请求头访问（与 Cookie 会话等价）。 */
function authHeaders() {
  return adminToken ? { 'x-geo-admin-token': adminToken } : {};
}

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...authHeaders(),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

console.log(`测试目标：${base}${adminToken ? '（已启用访问控制）' : ''}\n`);

/* 0. 访问控制 */
if (adminToken) {
  console.log('0. 访问控制');
  const anonymous = await fetch(`${base}/api/benchmark/projects`);
  check('未登录访问 API 返回 401', anonymous.status === 401, `status=${anonymous.status}`);

  const wrongHeader = await fetch(`${base}/api/benchmark/projects`, {
    headers: { 'x-geo-admin-token': 'wrong-token' },
  });
  check('错误口令仍返回 401', wrongHeader.status === 401, `status=${wrongHeader.status}`);

  const badLogin = await fetch(`${base}/api/benchmark/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'wrong-token' }),
    redirect: 'manual',
  });
  check('错误口令登录被拒绝（303 回错误页）', badLogin.status === 303, `status=${badLogin.status}`);
  check(
    '错误跳转带 error=1',
    (badLogin.headers.get('location') ?? '').includes('error=1'),
    badLogin.headers.get('location') ?? '',
  );

  const login = await fetch(`${base}/api/benchmark/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: adminToken, next: '/benchmark/' }),
  });
  const setCookie = login.headers.get('set-cookie') ?? '';
  check('正确口令登录返回 200', login.status === 200, `status=${login.status}`);
  check('登录下发 HttpOnly 会话 Cookie', /geo_benchmark_admin=/i.test(setCookie) && /httponly/i.test(setCookie));

  const cookieValue = setCookie.split(';')[0];
  const withCookie = await fetch(`${base}/api/benchmark/projects`, {
    headers: { cookie: cookieValue },
  });
  check('携带会话 Cookie 可访问 API', withCookie.status === 200, `status=${withCookie.status}`);

  const page = await fetch(`${base}/benchmark/`, { redirect: 'manual' });
  check('未登录访问工作台页面被重定向', page.status === 303 || page.status === 302, `status=${page.status}`);
  check(
    '重定向到登录页并带 next',
    (page.headers.get('location') ?? '').includes('/benchmark/login?next='),
    page.headers.get('location') ?? '',
  );

  const loginPage = await fetch(`${base}/benchmark/login`);
  check('登录页本身可访问', loginPage.status === 200, `status=${loginPage.status}`);
} else {
  console.log('0. 访问控制（未设置 GEO_TEST_ADMIN_TOKEN，跳过）');
}


/* 1. 端点状态 */
console.log('1. 模型端点状态');
const provider = await api('/api/benchmark/provider');
check('GET /api/benchmark/provider 返回 200', provider.status === 200);
check('返回 configured 字段', typeof provider.body?.provider?.configured === 'boolean');

/* 2. 创建示例项目 */
console.log('\n2. 示例项目');
const demo = await api('/api/benchmark/projects', {
  method: 'POST',
  body: JSON.stringify({ demo: true }),
});
check('创建示例项目返回 201', demo.status === 201, `status=${demo.status}`);
const projectId = demo.body?.project?.id;
check('返回项目 id', Boolean(projectId));
check('项目标记为示例', demo.body?.project?.isDemo === true);
check('自动生成了 20 个问题', demo.body?.project?.questions?.length === 20);

if (!projectId) {
  console.log('\n项目创建失败，后续测试跳过。');
  process.exit(1);
}

/* 3. 详情与指标 */
console.log('\n3. 项目详情与指标');
const detail = await api(`/api/benchmark/projects/${projectId}`);
check('GET 详情返回 200', detail.status === 200);
const metrics = detail.body?.metrics;
check('包含 metrics', Boolean(metrics));
check('记录数 > 0', (metrics?.total ?? 0) > 0);
check('提及率在 0-1 之间', metrics?.mentionRate >= 0 && metrics?.mentionRate <= 1);
check('引用率在 0-1 之间', metrics?.citationRate >= 0 && metrics?.citationRate <= 1);
check('引用率大于 0（示例含 geolab.dev 链接）', metrics?.citationRate > 0);
check('按意图分层有数据', (metrics?.byIntent?.length ?? 0) > 0);
check('引用域名里有 geolab.dev', (metrics?.citationDomains ?? []).some((item) => item.domain === 'geolab.dev'));
check('latest 指向最近一次运行', Boolean(detail.body?.latest?.run?.id));

/* 4. 手工记录 */
console.log('\n4. 手工记录');
const manualRun = await api(`/api/benchmark/projects/${projectId}/runs`, {
  method: 'POST',
  body: JSON.stringify({ mode: 'manual', label: '测试手工批次' }),
});
check('创建手工批次返回 201', manualRun.status === 201, `status=${manualRun.status}`);
const runId = manualRun.body?.run?.id;
const questionId = detail.body?.project?.questions?.[0]?.id;

const manualObservation = await api(`/api/benchmark/projects/${projectId}/observations`, {
  method: 'POST',
  body: JSON.stringify({
    runId,
    questionId,
    answer:
      'GEO Lab 是一个研究 GEO 的平台，提供可见性测试方法。来源：https://geolab.dev/benchmark/ 与 https://www.clearscope.io/',
  }),
});
check('保存手工记录返回 201', manualObservation.status === 201, `status=${manualObservation.status}`);
check('识别出品牌提及', manualObservation.body?.observation?.brandMentioned === true);
check('解析出 2 条引用', manualObservation.body?.observation?.citations?.length === 2);
check('识别出竞品提及', manualObservation.body?.observation?.competitorMentions?.Clearscope === true);
check('记录方式为 manual', manualObservation.body?.observation?.mode === 'manual');

const tooShort = await api(`/api/benchmark/projects/${projectId}/observations`, {
  method: 'POST',
  body: JSON.stringify({ runId, questionId, answer: '太短' }),
});
check('过短答案被拒绝（400）', tooShort.status === 400);

const wrongRun = await api(`/api/benchmark/projects/${projectId}/observations`, {
  method: 'POST',
  body: JSON.stringify({ runId: 'not-a-run', questionId, answer: '这是一段足够长的测试答案内容。' }),
});
check('非法 runId 被拒绝（400）', wrongRun.status === 400);

/* 5. 问题集 */
console.log('\n5. 问题集保存');
const saved = await api(`/api/benchmark/projects/${projectId}/questions`, {
  method: 'PUT',
  body: JSON.stringify({
    questions: [
      { text: 'GEO Lab 是什么？', intent: '认知' },
      { text: 'GEO Lab 和 Surfer 怎么选？', intent: '比较' },
    ],
  }),
});
check('PUT 问题集返回 200', saved.status === 200, `status=${saved.status}`);
check('问题数量变为 2', saved.body?.questions?.length === 2);

const emptyQuestions = await api(`/api/benchmark/projects/${projectId}/questions`, {
  method: 'PUT',
  body: JSON.stringify({ questions: [] }),
});
check('空问题集被拒绝（400）', emptyQuestions.status === 400);

/* 6. 自动运行降级 */
console.log('\n6. 自动运行（未配置密钥时应降级）');
const autoRun = await api(`/api/benchmark/projects/${projectId}/runs`, {
  method: 'POST',
  body: JSON.stringify({ mode: 'auto' }),
});
check('未配置时返回 400', autoRun.status === 400, `status=${autoRun.status}`);
check('错误信息说明如何配置', /GEO_LLM_API_KEY/.test(autoRun.body?.error ?? ''));

/* 7. 导出 */
console.log('\n7. 导出');
const csv = await fetch(`${base}/api/benchmark/projects/${projectId}/export?format=csv`, {
  headers: authHeaders(),
});
const csvBytes = new Uint8Array(await csv.arrayBuffer());
const csvText = new TextDecoder('utf-8').decode(csvBytes);
check('CSV 返回 200', csv.status === 200);
check(
  'CSV 以 UTF-8 BOM 开头（Excel 兼容）',
  csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf,
);
check('CSV 含问题列', csvText.includes('question_id'));
check('CSV 含记录', csvText.includes('GEO Lab'));

const md = await fetch(`${base}/api/benchmark/projects/${projectId}/export?format=md`, {
  headers: authHeaders(),
});
const mdText = await md.text();
check('Markdown 报告返回 200', md.status === 200);
check('报告含指标表', mdText.includes('| 提及率 |'));
check('报告含免责声明', mdText.includes('不代表排名或引用概率'));

/* 8. 删除 */
console.log('\n8. 删除');
const observationId = manualObservation.body?.observation?.id;
const deletedObservation = await api(
  `/api/benchmark/projects/${projectId}/observations/${observationId}`,
  { method: 'DELETE' },
);
check('删除记录返回 200', deletedObservation.status === 200);

const deletedProject = await api(`/api/benchmark/projects/${projectId}`, { method: 'DELETE' });
check('删除项目返回 200', deletedProject.status === 200);

const gone = await api(`/api/benchmark/projects/${projectId}`);
check('删除后详情返回 404', gone.status === 404);

/* 9. 页面可访问 */
console.log('\n9. 页面');
for (const path of ['/benchmark/', `/benchmark/${projectId}/`, '/benchmark/capture/']) {
  const response = await fetch(`${base}${path}`, { headers: authHeaders() });
  check(`GET ${path} 返回 200`, response.status === 200 || response.status === 404);
}

/* 10. 多端点：配置 / 并行调度 / 一致性 */
console.log('\n10. 多端点并行与一致性');

const mock = spawn(process.execPath, ['scripts/mock-llm.mjs', '4399'], { stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 700));

const multi = await api('/api/benchmark/projects', {
  method: 'POST',
  body: JSON.stringify({
    name: '测试：多端点对比',
    brand: 'GEO Lab',
    site: 'https://geolab.dev',
    competitors: ['Surfer'],
  }),
});
const multiId = multi.body?.project?.id;
check('创建多端点测试项目', multi.status === 201 && Boolean(multiId), `status=${multi.status}`);

const endpointA = await api('/api/benchmark/endpoints', {
  method: 'POST',
  body: JSON.stringify({
    name: `Mock Cited ${Date.now()}`,
    baseUrl: 'http://127.0.0.1:4399/v1',
    model: 'mock-cited',
    apiKeyEnv: '',
  }),
});
const endpointB = await api('/api/benchmark/endpoints', {
  method: 'POST',
  body: JSON.stringify({
    name: `Mock Silent ${Date.now() + 1}`,
    baseUrl: 'http://127.0.0.1:4399/v1',
    model: 'mock-silent',
    apiKeyEnv: '',
  }),
});
check('创建端点 A', endpointA.status === 201, `status=${endpointA.status}`);
check('创建端点 B', endpointB.status === 201, `status=${endpointB.status}`);
check('无鉴权端点视为已配置', endpointA.body?.endpoint?.configured === true);

const endpointList = await api('/api/benchmark/endpoints');
check('端点列表包含两个端点', (endpointList.body?.endpoints ?? []).length >= 2);

const duplicate = await api('/api/benchmark/endpoints', {
  method: 'POST',
  body: JSON.stringify({ name: endpointA.body?.endpoint?.name, baseUrl: 'http://127.0.0.1:4399/v1', model: 'x' }),
});
check('重名端点被拒绝（400）', duplicate.status === 400);

const idA = endpointA.body?.endpoint?.id;
const idB = endpointB.body?.endpoint?.id;

const parallel = await api(`/api/benchmark/projects/${multiId}/runs`, {
  method: 'POST',
  body: JSON.stringify({ mode: 'auto', endpoints: [idA, idB], limit: 4 }),
});
check('并行运行返回 201', parallel.status === 201, `status=${parallel.status} ${parallel.body?.error ?? ''}`);
check('生成一个 batchId', Boolean(parallel.body?.batchId));
check('产生 2 个 run', (parallel.body?.runs ?? []).length === 2);
check('两个 run 共享 batchId', (parallel.body?.runs ?? []).every((run) => run.batchId === parallel.body?.batchId));
check(
  'run 上记录了端点名',
  (parallel.body?.runs ?? []).every((run) => typeof run.endpointName === 'string' && run.endpointName.length > 0),
);

const multiDetail = await api(`/api/benchmark/projects/${multiId}`);
check('详情返回 batches', (multiDetail.body?.batches ?? []).some((batch) => batch.batchId === parallel.body?.batchId));
const batchRuns = (multiDetail.body?.runs ?? []).filter((run) => run.batchId === parallel.body?.batchId);
const batchObs = (multiDetail.body?.observations ?? []).filter((observation) =>
  batchRuns.some((run) => run.id === observation.runId),
);
check('每端点各 4 条记录', batchObs.length === 8, `actual=${batchObs.length}`);
const firstQuestionId = multiDetail.body?.project?.questions?.[0]?.id;
const cells = batchObs.filter((observation) => observation.questionId === firstQuestionId);
check('同一问题在两个端点各有一条记录', cells.length === 2, `actual=${cells.length}`);
check(
  '制造出了提及分歧（一真一假）',
  cells.some((cell) => cell.brandMentioned) && cells.some((cell) => !cell.brandMentioned),
);
check(
  '提及的端点解析出引用链接',
  cells.some((cell) => cell.brandMentioned && cell.citations.length > 0),
);

const badEndpoint = await api(`/api/benchmark/projects/${multiId}/runs`, {
  method: 'POST',
  body: JSON.stringify({ mode: 'auto', endpoints: ['00000000-0000-0000-0000-000000000000'] }),
});
check('不存在的端点被拒绝（400）', badEndpoint.status === 400);

/* 11. 浏览器采集（书签） */
console.log('\n11. 浏览器采集');
const captureToken = process.env.GEO_TEST_CAPTURE_TOKEN ?? 'test-capture-token';

const match = await api('/api/benchmark/capture/match', {
  method: 'POST',
  body: JSON.stringify({
    token: captureToken,
    projectId: multiId,
    answer: 'GEO Lab 是一个研究 GEO 的平台。来源：https://geolab.dev/about/',
  }),
});
check('match 返回 200', match.status === 200, `status=${match.status} ${match.body?.error ?? ''}`);
check('返回候选问题', (match.body?.candidates ?? []).length > 0);
check('候选带匹配度分数', typeof match.body?.candidates?.[0]?.score === 'number');

const commit = await api('/api/benchmark/capture/commit', {
  method: 'POST',
  body: JSON.stringify({
    token: captureToken,
    projectId: multiId,
    questionId: match.body?.candidates?.[0]?.questionId,
    answer: 'GEO Lab 是一个研究 GEO 的平台。来源：https://geolab.dev/about/',
    endpointLabel: 'ChatGPT',
    sourceUrl: 'https://chat.openai.com/c/abc',
  }),
});
check('commit 返回 201', commit.status === 201, `status=${commit.status} ${commit.body?.error ?? ''}`);
check('采集记录识别品牌提及', commit.body?.brandMentioned === true);
check('采集记录解析出引用', (commit.body?.citationCount ?? 0) >= 1);
check('采集运行标签含来源与日期', /^浏览器采集 · ChatGPT · \d{4}-\d{2}-\d{2}$/.test(commit.body?.run?.label ?? ''));
check(
  '采集响应包含 CORS 头',
  commit.headers.get('access-control-allow-origin') === '*',
);

const wrongToken = await api('/api/benchmark/capture/commit', {
  method: 'POST',
  body: JSON.stringify({ token: 'wrong', projectId: multiId, questionId: match.body?.candidates?.[0]?.questionId, answer: '这是一段足够长的答案文本。' }),
});
check('错误 token 返回 401', wrongToken.status === 401);

const preflight = await fetch(`${base}/api/benchmark/capture/match`, { method: 'OPTIONS' });
check('OPTIONS 预检返回 204', preflight.status === 204);
check(
  '预检声明允许 POST',
  (preflight.headers.get('access-control-allow-methods') ?? '').includes('POST'),
);

/* 12. 清理 */
console.log('\n12. 清理');
for (const endpointId of [idA, idB]) {
  const removed = await api(`/api/benchmark/endpoints/${endpointId}`, { method: 'DELETE' });
  check('删除测试端点', removed.status === 200);
}
const deletedMulti = await api(`/api/benchmark/projects/${multiId}`, { method: 'DELETE' });
check('删除多端点测试项目', deletedMulti.status === 200);
mock.kill();

console.log(
  failures === 0 ? '\n全部通过。' : `\n${failures} 项失败。`,
);
process.exit(failures === 0 ? 0 : 1);
