#!/usr/bin/env node
/**
 * 清空本地可见性监测数据库（data/benchmark.db）。
 * 会要求确认，除非传入 --yes。仅用于本地开发与回归测试。
 */
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

const target = resolve(process.env.GEO_BENCHMARK_DB ?? 'data/benchmark.db');
const confirmed = process.argv.includes('--yes');

if (!existsSync(target)) {
  console.log(`没有找到数据库：${target}（无需清理）`);
  process.exit(0);
}

if (!confirmed) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`将删除 ${target} 及其 WAL 文件，输入 yes 确认：`);
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('已取消。');
    process.exit(1);
  }
}

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${target}${suffix}`, { force: true });
}
console.log(`已删除数据库：${target}`);
