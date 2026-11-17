import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Endpoint, Intent, Observation, Project, Question, Run, RunStatus } from './types';

/**
 * 本地 SQLite 存储。刻意选择 node:sqlite（Node 22.5+ 内置）：
 * 不需要编译原生依赖，单文件数据库便于自托管与备份。
 * 数据库文件默认 data/benchmark.db，可用 GEO_BENCHMARK_DB 覆盖。
 */

let database: DatabaseSync | null = null;

function dbPath(): string {
  const configured = process.env.GEO_BENCHMARK_DB;
  if (configured) return resolve(configured);
  // Serverless（Netlify Function / AWS Lambda）里只有 /tmp 可写，部署包目录是只读的。
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY) return '/tmp/benchmark.db';
  return resolve('data/benchmark.db');
}

export function getDb(): DatabaseSync {
  if (database) return database;
  const path = dbPath();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  database = new DatabaseSync(path);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA foreign_keys = ON');
  migrate(database);
  return database;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      site TEXT NOT NULL DEFAULT '',
      competitors TEXT NOT NULL DEFAULT '[]',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      intent TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key_env TEXT NOT NULL DEFAULT '',
      extra_body TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      answer TEXT NOT NULL,
      citations TEXT NOT NULL DEFAULT '[]',
      brand_mentioned INTEGER NOT NULL DEFAULT 0,
      brand_position INTEGER,
      competitor_mentions TEXT NOT NULL DEFAULT '{}',
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_questions_project ON questions(project_id);
    CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
    CREATE INDEX IF NOT EXISTS idx_obs_run ON observations(run_id);
    CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project_id);
  `);

  // 旧库增量迁移：对比运行需要 batch / endpoint 字段。
  ensureColumn(db, 'runs', 'batch_id', 'TEXT');
  ensureColumn(db, 'runs', 'endpoint_id', 'TEXT');
  ensureColumn(db, 'runs', 'endpoint_name', 'TEXT');
  // 重复观测：同一问题的第 n 次记录
  ensureColumn(db, 'observations', 'repeat_index', 'INTEGER NOT NULL DEFAULT 1');
  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_batch ON runs(batch_id)');
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const now = () => new Date().toISOString();

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

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];
  return rows.map((row) => toProject(row, listQuestions(row.id)));
}

export function getProject(id: string): Project | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  if (!row) return null;
  return toProject(row, listQuestions(id));
}

export function createProject(input: {
  name: string;
  brand: string;
  site?: string;
  competitors?: string[];
  isDemo?: boolean;
}): Project {
  const db = getDb();
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    'INSERT INTO projects (id, name, brand, site, competitors, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    input.name,
    input.brand,
    input.site ?? '',
    JSON.stringify(input.competitors ?? []),
    input.isDemo ? 1 : 0,
    timestamp,
    timestamp,
  );
  return getProject(id)!;
}

export function updateProject(
  id: string,
  input: { name?: string; brand?: string; site?: string; competitors?: string[] },
): Project | null {
  const existing = getProject(id);
  if (!existing) return null;
  const db = getDb();
  db.prepare(
    'UPDATE projects SET name = ?, brand = ?, site = ?, competitors = ?, updated_at = ? WHERE id = ?',
  ).run(
    input.name ?? existing.name,
    input.brand ?? existing.brand,
    input.site ?? existing.site,
    JSON.stringify(input.competitors ?? existing.competitors),
    now(),
    id,
  );
  return getProject(id);
}

export function deleteProject(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

/* ---------- 问题集 ---------- */

type QuestionRow = { id: string; text: string; intent: string; created_at: string };

export function listQuestions(projectId: string): Question[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM questions WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId) as QuestionRow[];
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    intent: row.intent as Intent,
    createdAt: row.created_at,
  }));
}

export function replaceQuestions(
  projectId: string,
  questions: { text: string; intent: Intent }[],
): Question[] {
  const db = getDb();
  db.prepare('DELETE FROM questions WHERE project_id = ?').run(projectId);
  const insert = db.prepare(
    'INSERT INTO questions (id, project_id, text, intent, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const timestamp = now();
  for (const question of questions) {
    insert.run(randomUUID(), projectId, question.text.trim(), question.intent, timestamp);
  }
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(timestamp, projectId);
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

export function listRuns(projectId: string): Run[] {
  const db = getDb();
  const rows = db
    // 同一秒内创建的多条运行按插入顺序倒序，保证“最新运行”稳定可预期
    .prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC, rowid DESC')
    .all(projectId) as RunRow[];
  return rows.map(toRun);
}

export function getRun(id: string): Run | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined;
  return row ? toRun(row) : null;
}

export function createRun(input: {
  projectId: string;
  label: string;
  provider: string;
  model: string;
  status: RunStatus;
  note?: string;
  batchId?: string | null;
  endpointId?: string | null;
  endpointName?: string | null;
}): Run {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO runs
      (id, project_id, label, provider, model, status, started_at, finished_at, note, batch_id, endpoint_id, endpoint_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  );
  return getRun(id)!;
}

export function finishRun(id: string, status: RunStatus, note?: string) {
  const db = getDb();
  db.prepare('UPDATE runs SET status = ?, finished_at = ?, note = ? WHERE id = ?').run(
    status,
    now(),
    note ?? null,
    id,
  );
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

export function addObservation(input: {
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
}): Observation {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO observations
      (id, run_id, project_id, question_id, question_text, answer, citations, brand_mentioned, brand_position, competitor_mentions, mode, repeat_index, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  );
  const row = db.prepare('SELECT * FROM observations WHERE id = ?').get(id) as ObservationRow;
  return toObservation(row);
}

export function listObservations(projectId: string, runId?: string): Observation[] {
  const db = getDb();
  const rows = runId
    ? (db
        .prepare('SELECT * FROM observations WHERE project_id = ? AND run_id = ? ORDER BY created_at ASC')
        .all(projectId, runId) as ObservationRow[])
    : (db
        .prepare('SELECT * FROM observations WHERE project_id = ? ORDER BY created_at ASC')
        .all(projectId) as ObservationRow[]);
  return rows.map(toObservation);
}

export function deleteObservation(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM observations WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

/** 测试用：整体清空。仅在 GEO_BENCHMARK_ALLOW_RESET=1 时开放接口。 */
export function resetDatabase() {
  const db = getDb();
  db.exec('DELETE FROM observations; DELETE FROM runs; DELETE FROM questions; DELETE FROM projects;');
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

export function listEndpoints(): Endpoint[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM endpoints ORDER BY created_at ASC')
    .all() as EndpointRow[];
  return rows.map(toEndpoint);
}

export function getEndpoint(id: string): Endpoint | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM endpoints WHERE id = ?').get(id) as EndpointRow | undefined;
  return row ? toEndpoint(row) : null;
}

export function findEndpointByName(name: string): Endpoint | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM endpoints WHERE name = ?')
    .get(name) as EndpointRow | undefined;
  return row ? toEndpoint(row) : null;
}

export function createEndpoint(input: {
  name: string;
  baseUrl: string;
  model: string;
  apiKeyEnv?: string;
  extraBody?: Record<string, unknown>;
  enabled?: boolean;
}): Endpoint {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO endpoints (id, name, base_url, model, api_key_env, extra_body, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.baseUrl,
    input.model,
    input.apiKeyEnv ?? '',
    JSON.stringify(input.extraBody ?? {}),
    input.enabled === false ? 0 : 1,
    now(),
  );
  return getEndpoint(id)!;
}

export function updateEndpoint(
  id: string,
  input: {
    name?: string;
    baseUrl?: string;
    model?: string;
    apiKeyEnv?: string;
    extraBody?: Record<string, unknown>;
    enabled?: boolean;
  },
): Endpoint | null {
  const existing = getEndpoint(id);
  if (!existing) return null;
  const db = getDb();
  db.prepare(
    'UPDATE endpoints SET name = ?, base_url = ?, model = ?, api_key_env = ?, extra_body = ?, enabled = ? WHERE id = ?',
  ).run(
    input.name ?? existing.name,
    input.baseUrl ?? existing.baseUrl,
    input.model ?? existing.model,
    input.apiKeyEnv ?? existing.apiKeyEnv,
    JSON.stringify(input.extraBody ?? existing.extraBody),
    (input.enabled ?? existing.enabled) ? 1 : 0,
    id,
  );
  return getEndpoint(id);
}

export function deleteEndpoint(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM endpoints WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}
