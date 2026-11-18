import { randomUUID } from 'node:crypto';
import { getStore, type SqlValue } from './store';
import type { Endpoint, Intent, Observation, Project, Question, Run, RunStatus } from './types';

/**
 * 数据访问层。所有函数都是异步的：本地 SQLite 与远端 libSQL 共用同一套 SQL，
 * 只有底层的执行方式不同（见 store.ts）。
 */

const now = () => new Date().toISOString();

/* ---------- 迁移 ---------- */

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    site TEXT NOT NULL DEFAULT '',
    competitors TEXT NOT NULL DEFAULT '[]',
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    text TEXT NOT NULL,
    intent TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    label TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    note TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    answer TEXT NOT NULL,
    citations TEXT NOT NULL DEFAULT '[]',
    brand_mentioned INTEGER NOT NULL DEFAULT 0,
    brand_position INTEGER,
    competitor_mentions TEXT NOT NULL DEFAULT '{}',
    mode TEXT NOT NULL,
    repeat_index INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS endpoints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key_env TEXT NOT NULL DEFAULT '',
    extra_body TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_questions_project ON questions(project_id)',
  'CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id)',
  'CREATE INDEX IF NOT EXISTS idx_runs_batch ON runs(batch_id)',
  'CREATE INDEX IF NOT EXISTS idx_obs_run ON observations(run_id)',
  'CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project_id)',
];

/** 旧库增量迁移：列不存在时补上（SQLite 与 libSQL 都支持 PRAGMA table_info）。 */
const COLUMN_MIGRATIONS: { table: string; column: string; definition: string }[] = [
  { table: 'runs', column: 'batch_id', definition: 'TEXT' },
  { table: 'runs', column: 'endpoint_id', definition: 'TEXT' },
  { table: 'runs', column: 'endpoint_name', definition: 'TEXT' },
  { table: 'observations', column: 'repeat_index', definition: 'INTEGER NOT NULL DEFAULT 1' },
];

let migration: Promise<void> | null = null;

async function ensureMigrated(): Promise<void> {
  if (!migration) {
    migration = (async () => {
      const store = getStore();
      for (const statement of SCHEMA) {
        // 索引依赖后补的列：失败时留到列补齐后重建
        try {
          await store.run(statement);
        } catch (error) {
          if (!String((error as Error).message).includes('no such column')) throw error;
        }
      }
      for (const item of COLUMN_MIGRATIONS) {
        const columns = await store.all(`PRAGMA table_info(${item.table})`);
        if (!columns.some((column) => column.name === item.column)) {
          await store.run(`ALTER TABLE ${item.table} ADD COLUMN ${item.column} ${item.definition}`);
        }
      }
      await store.run('CREATE INDEX IF NOT EXISTS idx_runs_batch ON runs(batch_id)');
    })().catch((error) => {
      migration = null;
      throw error;
    });
  }
  return migration;
}

/** 统一的查询入口：先确保表结构存在。 */
async function all(sql: string, args: SqlValue[] = []) {
  await ensureMigrated();
  return getStore().all(sql, args);
}

async function run(sql: string, args: SqlValue[] = []) {
  await ensureMigrated();
  return getStore().run(sql, args);
}

/* ---------- 项目 ---------- */

type ProjectRow = {
  id: string;
  name: string;
  brand: string;
  site: string;
  competitors: string;
  is_demo: number;
  created_at: string;
  updated_at: string;
};

function toProject(row: ProjectRow, questions: Question[]): Project {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    site: row.site,
    competitors: JSON.parse(row.competitors) as string[],
    questions,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjects(): Promise<Project[]> {
  const rows = (await all('SELECT * FROM projects ORDER BY created_at DESC')) as ProjectRow[];
  return Promise.all(rows.map(async (row) => toProject(row, await listQuestions(row.id))));
}

export async function getProject(id: string): Promise<Project | null> {
  const row = (await all('SELECT * FROM projects WHERE id = ?', [id]))[0] as ProjectRow | undefined;
  if (!row) return null;
  return toProject(row, await listQuestions(id));
}

export async function createProject(input: {
  name: string;
  brand: string;
  site?: string;
  competitors?: string[];
  isDemo?: boolean;
}): Promise<Project> {
  const id = randomUUID();
  const timestamp = now();
  await run(
    'INSERT INTO projects (id, name, brand, site, competitors, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      input.name,
      input.brand,
      input.site ?? '',
      JSON.stringify(input.competitors ?? []),
      input.isDemo ? 1 : 0,
      timestamp,
      timestamp,
    ],
  );
  return (await getProject(id))!;
}

export async function updateProject(
  id: string,
  input: { name?: string; brand?: string; site?: string; competitors?: string[] },
): Promise<Project | null> {
  const existing = await getProject(id);
  if (!existing) return null;
  await run(
    'UPDATE projects SET name = ?, brand = ?, site = ?, competitors = ?, updated_at = ? WHERE id = ?',
    [
      input.name ?? existing.name,
      input.brand ?? existing.brand,
      input.site ?? existing.site,
      JSON.stringify(input.competitors ?? existing.competitors),
      now(),
      id,
    ],
  );
  return getProject(id);
}

export async function deleteProject(id: string): Promise<boolean> {
  // 子表没有外键级联（远端 libSQL 默认关闭外键），这里显式清理
  await run('DELETE FROM observations WHERE project_id = ?', [id]);
  await run('DELETE FROM runs WHERE project_id = ?', [id]);
  await run('DELETE FROM questions WHERE project_id = ?', [id]);
  const result = await run('DELETE FROM projects WHERE id = ?', [id]);
  return result.changes > 0;
}

/* ---------- 问题集 ---------- */

type QuestionRow = { id: string; text: string; intent: string; created_at: string };

export async function listQuestions(projectId: string): Promise<Question[]> {
  const rows = (await all(
    'SELECT * FROM questions WHERE project_id = ? ORDER BY created_at ASC, rowid ASC',
    [projectId],
  )) as QuestionRow[];
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    intent: row.intent as Intent,
    createdAt: row.created_at,
  }));
}

export async function replaceQuestions(
  projectId: string,
  questions: { text: string; intent: Intent }[],
): Promise<Question[]> {
  await run('DELETE FROM questions WHERE project_id = ?', [projectId]);
  const timestamp = now();
  for (const question of questions) {
    await run(
      'INSERT INTO questions (id, project_id, text, intent, created_at) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), projectId, question.text.trim(), question.intent, timestamp],
    );
  }
  await run('UPDATE projects SET updated_at = ? WHERE id = ?', [timestamp, projectId]);
  return listQuestions(projectId);
}

/* ---------- 运行 ---------- */

type RunRow = {
  id: string;
  project_id: string;
  label: string;
  provider: string;
  model: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  note: string | null;
  batch_id: string | null;
  endpoint_id: string | null;
  endpoint_name: string | null;
};

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    provider: row.provider,
    model: row.model,
    status: row.status as RunStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    batchId: row.batch_id ?? null,
    endpointId: row.endpoint_id ?? null,
    endpointName: row.endpoint_name ?? null,
    note: row.note ?? undefined,
  };
}

export async function listRuns(projectId: string): Promise<Run[]> {
  const rows = (await all(
    // 同一秒内创建的多条运行按插入顺序倒序，保证“最新运行”稳定可预期
    'SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC, rowid DESC',
    [projectId],
  )) as RunRow[];
  return rows.map(toRun);
}

export async function getRun(id: string): Promise<Run | null> {
  const row = (await all('SELECT * FROM runs WHERE id = ?', [id]))[0] as RunRow | undefined;
  return row ? toRun(row) : null;
}

export async function createRun(input: {
  projectId: string;
  label: string;
  provider: string;
  model: string;
  status: RunStatus;
  note?: string;
  batchId?: string | null;
  endpointId?: string | null;
  endpointName?: string | null;
}): Promise<Run> {
  const id = randomUUID();
  await run(
    `INSERT INTO runs
      (id, project_id, label, provider, model, status, started_at, finished_at, note, batch_id, endpoint_id, endpoint_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.projectId,
      input.label,
      input.provider,
      input.model,
      input.status,
      now(),
      input.status === 'running' ? null : now(),
      input.note ?? null,
      input.batchId ?? null,
      input.endpointId ?? null,
      input.endpointName ?? null,
    ],
  );
  return (await getRun(id))!;
}

export async function finishRun(id: string, status: RunStatus, note?: string): Promise<void> {
  await run('UPDATE runs SET status = ?, finished_at = ?, note = ? WHERE id = ?', [
    status,
    now(),
    note ?? null,
    id,
  ]);
}

/* ---------- 观测记录 ---------- */

type ObservationRow = {
  id: string;
  run_id: string;
  project_id: string;
  question_id: string;
  question_text: string;
  answer: string;
  citations: string;
  brand_mentioned: number;
  brand_position: number | null;
  competitor_mentions: string;
  mode: string;
  repeat_index: number;
  created_at: string;
};

function toObservation(row: ObservationRow): Observation {
  return {
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    questionId: row.question_id,
    questionText: row.question_text,
    answer: row.answer,
    citations: JSON.parse(row.citations) as string[],
    brandMentioned: row.brand_mentioned === 1,
    brandPosition: row.brand_position,
    competitorMentions: JSON.parse(row.competitor_mentions) as Record<string, boolean>,
    mode: row.mode as 'auto' | 'manual',
    repeatIndex: row.repeat_index ?? 1,
    createdAt: row.created_at,
  };
}

export async function addObservation(input: {
  runId: string;
  projectId: string;
  questionId: string;
  questionText: string;
  answer: string;
  citations?: string[];
  brandMentioned?: boolean;
  brandPosition?: number | null;
  competitorMentions?: Record<string, boolean>;
  mode: 'auto' | 'manual';
  repeatIndex?: number;
}): Promise<Observation> {
  const id = randomUUID();
  await run(
    `INSERT INTO observations
      (id, run_id, project_id, question_id, question_text, answer, citations, brand_mentioned, brand_position, competitor_mentions, mode, repeat_index, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.runId,
      input.projectId,
      input.questionId,
      input.questionText,
      input.answer,
      JSON.stringify(input.citations ?? []),
      input.brandMentioned ? 1 : 0,
      input.brandPosition ?? null,
      JSON.stringify(input.competitorMentions ?? {}),
      input.mode,
      Math.max(1, input.repeatIndex ?? 1),
      now(),
    ],
  );
  const row = (await all('SELECT * FROM observations WHERE id = ?', [id]))[0] as ObservationRow;
  return toObservation(row);
}

export async function listObservations(projectId: string, runId?: string): Promise<Observation[]> {
  const rows = runId
    ? ((await all(
        'SELECT * FROM observations WHERE project_id = ? AND run_id = ? ORDER BY created_at ASC, rowid ASC',
        [projectId, runId],
      )) as ObservationRow[])
    : ((await all(
        'SELECT * FROM observations WHERE project_id = ? ORDER BY created_at ASC, rowid ASC',
        [projectId],
      )) as ObservationRow[]);
  return rows.map(toObservation);
}

export async function deleteObservation(id: string): Promise<boolean> {
  const result = await run('DELETE FROM observations WHERE id = ?', [id]);
  return result.changes > 0;
}

/** 测试用：整体清空。 */
export async function resetDatabase(): Promise<void> {
  await run('DELETE FROM observations');
  await run('DELETE FROM runs');
  await run('DELETE FROM questions');
  await run('DELETE FROM projects');
}

/* ---------- 端点配置 ---------- */

type EndpointRow = {
  id: string;
  name: string;
  base_url: string;
  model: string;
  api_key_env: string;
  extra_body: string;
  enabled: number;
  created_at: string;
};

function toEndpoint(row: EndpointRow): Endpoint {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    model: row.model,
    apiKeyEnv: row.api_key_env,
    extraBody: JSON.parse(row.extra_body) as Record<string, unknown>,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

export async function listEndpoints(): Promise<Endpoint[]> {
  const rows = (await all('SELECT * FROM endpoints ORDER BY created_at ASC, rowid ASC')) as EndpointRow[];
  return rows.map(toEndpoint);
}

export async function getEndpoint(id: string): Promise<Endpoint | null> {
  const row = (await all('SELECT * FROM endpoints WHERE id = ?', [id]))[0] as EndpointRow | undefined;
  return row ? toEndpoint(row) : null;
}

export async function findEndpointByName(name: string): Promise<Endpoint | null> {
  const row = (await all('SELECT * FROM endpoints WHERE name = ?', [name]))[0] as
    | EndpointRow
    | undefined;
  return row ? toEndpoint(row) : null;
}

export async function createEndpoint(input: {
  name: string;
  baseUrl: string;
  model: string;
  apiKeyEnv?: string;
  extraBody?: Record<string, unknown>;
  enabled?: boolean;
}): Promise<Endpoint> {
  const id = randomUUID();
  await run(
    `INSERT INTO endpoints (id, name, base_url, model, api_key_env, extra_body, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.baseUrl,
      input.model,
      input.apiKeyEnv ?? '',
      JSON.stringify(input.extraBody ?? {}),
      input.enabled === false ? 0 : 1,
      now(),
    ],
  );
  return (await getEndpoint(id))!;
}

export async function updateEndpoint(
  id: string,
  input: {
    name?: string;
    baseUrl?: string;
    model?: string;
    apiKeyEnv?: string;
    extraBody?: Record<string, unknown>;
    enabled?: boolean;
  },
): Promise<Endpoint | null> {
  const existing = await getEndpoint(id);
  if (!existing) return null;
  await run(
    'UPDATE endpoints SET name = ?, base_url = ?, model = ?, api_key_env = ?, extra_body = ?, enabled = ? WHERE id = ?',
    [
      input.name ?? existing.name,
      input.baseUrl ?? existing.baseUrl,
      input.model ?? existing.model,
      input.apiKeyEnv ?? existing.apiKeyEnv,
      JSON.stringify(input.extraBody ?? existing.extraBody),
      (input.enabled ?? existing.enabled) ? 1 : 0,
      id,
    ],
  );
  return getEndpoint(id);
}

export async function deleteEndpoint(id: string): Promise<boolean> {
  const result = await run('DELETE FROM endpoints WHERE id = ?', [id]);
  return result.changes > 0;
}
