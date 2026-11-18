import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * 存储适配层。
 *
 * 两种后端跑同一套 SQL：
 * - sqlite：Node 内置 node:sqlite，单文件，本地/自托管默认
 * - libsql-http：Turso / libSQL 的 HTTP pipeline（纯 fetch，无原生依赖），
 *   用于 Netlify Function 这类只有 /tmp 可写的环境
 *
 * 选择顺序：GEO_BENCHMARK_DB_URL（libsql:// 或 https://）→ GEO_BENCHMARK_DB（文件路径）
 * → Serverless 环境下 /tmp/benchmark.db → 本地 data/benchmark.db。
 */

export type Row = Record<string, unknown>;
export type SqlValue = string | number | null;

export interface Store {
  readonly kind: 'sqlite' | 'libsql-http';
  readonly location: string;
  all(sql: string, args?: SqlValue[]): Promise<Row[]>;
  run(sql: string, args?: SqlValue[]): Promise<{ changes: number }>;
}

/* ---------- 本地 SQLite ---------- */

class SqliteStore implements Store {
  readonly kind = 'sqlite' as const;
  readonly location: string;
  private db: DatabaseSync;

  constructor(path: string) {
    this.location = path;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  async all(sql: string, args: SqlValue[] = []): Promise<Row[]> {
    return this.db.prepare(sql).all(...(args as never[])) as Row[];
  }

  async run(sql: string, args: SqlValue[] = []): Promise<{ changes: number }> {
    const result = this.db.prepare(sql).run(...(args as never[]));
    return { changes: Number(result.changes) };
  }
}

/* ---------- libSQL / Turso HTTP pipeline ---------- */

type LibsqlValue =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'text'; value: string };

function encodeValue(value: SqlValue): LibsqlValue {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  return { type: 'text', value: String(value) };
}

function decodeValue(value: LibsqlValue): unknown {
  if (!value || value.type === 'null') return null;
  if (value.type === 'integer') return Number(value.value);
  return value.value;
}

class LibsqlHttpStore implements Store {
  readonly kind = 'libsql-http' as const;
  readonly location: string;
  private endpoint: string;
  private token: string;

  constructor(url: string, token: string) {
    this.location = url;
    // libsql://<db>.turso.io → https://<db>.turso.io；也接受完整 https 地址
    const normalized = url.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
    this.endpoint = normalized.endsWith('/v2/pipeline')
      ? normalized
      : `${normalized}/v2/pipeline`;
    this.token = token;
  }

  private async execute(sql: string, args: SqlValue[]): Promise<{
    cols: { name: string }[];
    rows: LibsqlValue[][];
    affected: number;
  }> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql,
              args: args.map(encodeValue),
              named_args: [],
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `libSQL 端点返回 ${response.status}${text ? `：${text.slice(0, 200)}` : ''}`,
      );
    }

    const payload = (await response.json()) as {
      results?: {
        type: string;
        response?: {
          type?: string;
          result?: {
            cols?: { name: string }[];
            rows?: LibsqlValue[][];
            affected_row_count?: number;
          };
        };
        error?: { message?: string };
      }[];
      error?: { message?: string };
    };

    if (payload.error?.message) throw new Error(payload.error.message);
    const first = payload.results?.[0];
    if (!first) throw new Error('libSQL 响应为空');
    if (first.type === 'error') throw new Error(first.error?.message ?? 'libSQL 执行失败');

    const result = first.response?.result ?? {};
    return {
      cols: result.cols ?? [],
      rows: result.rows ?? [],
      affected: result.affected_row_count ?? 0,
    };
  }

  async all(sql: string, args: SqlValue[] = []): Promise<Row[]> {
    const { cols, rows } = await this.execute(sql, args);
    return rows.map((row) => {
      const record: Row = {};
      row.forEach((value, index) => {
        record[cols[index]?.name ?? `col_${index}`] = decodeValue(value);
      });
      return record;
    });
  }

  async run(sql: string, args: SqlValue[] = []): Promise<{ changes: number }> {
    const { affected } = await this.execute(sql, args);
    return { changes: affected };
  }
}

/* ---------- 选择后端 ---------- */

function resolveStore(): Store {
  const url = (process.env.GEO_BENCHMARK_DB_URL ?? '').trim();
  if (url) {
    return new LibsqlHttpStore(url, (process.env.GEO_BENCHMARK_DB_TOKEN ?? '').trim());
  }

  const configured = (process.env.GEO_BENCHMARK_DB ?? '').trim();
  if (configured) return new SqliteStore(resolve(configured));

  // Serverless（Netlify Function / AWS Lambda）只有 /tmp 可写
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY) {
    return new SqliteStore('/tmp/benchmark.db');
  }

  return new SqliteStore(resolve('data/benchmark.db'));
}

let store: Store | null = null;

export function getStore(): Store {
  if (!store) store = resolveStore();
  return store;
}

export function storeInfo(): { kind: Store['kind']; location: string } {
  const active = getStore();
  return { kind: active.kind, location: active.location };
}
