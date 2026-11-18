#!/usr/bin/env node
/**
 * 本地 mock 的 libSQL / Turso HTTP pipeline 端点，用于在没有云端数据库时验证
 * 远端存储适配层。真实执行由 node:sqlite 完成，因此 SQL 与迁移逻辑会被真正跑一遍。
 *
 *   node scripts/mock-libsql.mjs 4400
 *
 * 协议：POST /v2/pipeline
 *   { requests: [{ type: 'execute', stmt: { sql, args: [{type,value}] } }, { type: 'close' }] }
 */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.argv[2] ?? 4400);
const expectedToken = process.env.MOCK_LIBSQL_TOKEN ?? '';

const db = new DatabaseSync(':memory:');

function decodeArg(arg) {
  if (!arg || arg.type === 'null') return null;
  if (arg.type === 'integer') return Number(arg.value);
  return arg.value;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  if (value instanceof Uint8Array) {
    return { type: 'blob', base64: Buffer.from(value).toString('base64') };
  }
  return { type: 'text', value: String(value) };
}

function execute(sql, args) {
  const trimmed = sql.trim();
  if (/^(select|pragma|with)\b/i.test(trimmed)) {
    const statement = db.prepare(trimmed);
    const rows = statement.all(...args);
    const cols = rows.length > 0 ? Object.keys(rows[0]).map((name) => ({ name, decltype: null })) : [];
    return {
      cols,
      rows: rows.map((row) => Object.values(row).map(encodeValue)),
      affected_row_count: 0,
    };
  }

  const result = db.prepare(trimmed).run(...args);
  return {
    cols: [],
    rows: [],
    affected_row_count: Number(result.changes),
    last_insert_rowid: String(result.lastInsertRowid ?? 0),
  };
}

const server = createServer((request, response) => {
  if (request.method !== 'POST' || !request.url?.endsWith('/v2/pipeline')) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  if (expectedToken) {
    const authorization = request.headers.authorization ?? '';
    if (authorization !== `Bearer ${expectedToken}`) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
  }

  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
  });
  request.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'bad json' }));
      return;
    }

    const results = [];
    try {
      for (const item of payload.requests ?? []) {
        if (item.type === 'close') {
          results.push({ type: 'ok', response: { type: 'close' } });
          continue;
        }
        if (item.type !== 'execute') {
          results.push({ type: 'error', error: { message: `unsupported request ${item.type}` } });
          continue;
        }
        const sql = String(item.stmt?.sql ?? '');
        const args = (item.stmt?.args ?? []).map(decodeArg);
        const result = execute(sql, args);
        results.push({
          type: 'ok',
          response: { type: 'execute', result },
        });
      }
    } catch (error) {
      results.push({ type: 'error', error: { message: (error).message } });
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ results, baton: null }));
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mock libSQL pipeline on http://127.0.0.1:${port}/v2/pipeline`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
