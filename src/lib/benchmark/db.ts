import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Intent, Observation, Project, Question, Run, RunStatus } from './types';

/**
 * 本地 SQLite 存储。刻意选择 node:sqlite（Node 22.5+ 内置）：
 * 不需要编译原生依赖，单文件数据库便于自托管与备份。
 * 数据库文件默认 data/benchmark.db，可用 GEO_BENCHMARK_DB 覆盖。
 */

let database: DatabaseSync | null = null;

function dbPath(): string {
  return resolve(process.env.GEO_BENCHMARK_DB ?? 'data/benchmark.db');
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
    note: row.note ?? undefined,
  };
}

export function listRuns(projectId: string): Run[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC')
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
}): Run {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO runs (id, project_id, label, provider, model, status, started_at, finished_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
}): Observation {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO observations
      (id, run_id, project_id, question_id, question_text, answer, citations, brand_mentioned, brand_position, competitor_mentions, mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
