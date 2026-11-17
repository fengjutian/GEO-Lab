#!/usr/bin/env node
/**
 * 构建产物校验：SEO 基础项、结构化数据可解析性、站内链接完整性、内容 frontmatter 约束。
 *
 * 用法：pnpm build && node scripts/check-site.mjs
 * 任何 error 都会让进程以退出码 1 结束，可以直接接入 CI。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const DIST = resolve(ROOT, 'dist');
const EVIDENCE = new Set(['official', 'paper', 'experiment', 'analysis', 'field']);
const SECTIONS = new Set(['knowledge', 'research', 'cases']);

const errors = [];
const warnings = [];

async function walk(dir, filter) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'pagefind' || entry.name === '_astro') continue;
      out.push(...(await walk(full, filter)));
    } else if (filter(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function decode(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fileExists(path) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function resolveInternalLink(href) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || clean === '/') return 'index.html';
  if (clean.startsWith('/')) {
    const path = clean.replace(/^\//, '');
    if (/\.[a-z0-9]+$/i.test(path)) return path;
    return `${path.replace(/\/$/, '')}/index.html`;
  }
  return null;
}

/* ---------- 1. 构建产物检查 ---------- */

const pages = await walk(DIST, (name) => name.endsWith('.html'));
if (pages.length === 0) {
  console.error('dist/ 中没有 HTML，请先运行 pnpm build');
  process.exit(1);
}

const linkCache = new Map();

for (const page of pages) {
  const rel = relative(DIST, page).replaceAll('\\', '/');
  const html = await readFile(page, 'utf8');

  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  const canonical = /rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  const noindex = /<meta name="robots" content="noindex/.test(html);
  const h1Count = [...html.matchAll(/<h1[\s>]/g)].length;
  const ogImage = /property="og:image" content="([^"]+)"/.exec(html)?.[1];

  if (!title) errors.push(`${rel}: 缺少 <title>`);
  else if (decode(title).length > 70) warnings.push(`${rel}: title 偏长（${decode(title).length} 字符）`);

  if (!noindex) {
    if (!description) errors.push(`${rel}: 缺少 meta description`);
    else if (description.length < 40) warnings.push(`${rel}: description 过短（${description.length}）`);
    if (!canonical) errors.push(`${rel}: 缺少 canonical`);
    if (!ogImage) warnings.push(`${rel}: 缺少 og:image`);
  }

  if (!rel.startsWith('404') && h1Count !== 1) {
    warnings.push(`${rel}: H1 数量为 ${h1Count}`);
  }

  // JSON-LD 必须可解析
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(decode(match[1]));
    } catch (error) {
      errors.push(`${rel}: JSON-LD 解析失败（${error.message}）`);
    }
  }

  // 站内链接
  for (const match of html.matchAll(/href="(\/[^"]*)"/g)) {
    const href = decode(match[1]);
    if (href.startsWith('/pagefind') || href.startsWith('/_astro')) continue;
    const target = await resolveInternalLink(href);
    if (!target) continue;
    if (!linkCache.has(target)) linkCache.set(target, await fileExists(join(DIST, target)));
    if (!linkCache.get(target)) {
      errors.push(`${rel}: 站内链接指向不存在的页面 ${href}`);
    }
  }
}

/* ---------- 2. 内容 frontmatter 检查 ---------- */

const contentFiles = await walk(resolve(ROOT, 'src/content'), (name) => name.endsWith('.md') || name.endsWith('.mdx'));

for (const file of contentFiles) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const raw = await readFile(file, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) {
    errors.push(`${rel}: 缺少 frontmatter`);
    continue;
  }
  const front = match[1];
  const body = raw.slice(match[0].length);

  const field = (name) => new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(front)?.[1]?.replace(/^["']|["']$/g, '');
  const title = field('title');
  const description = field('description');
  const evidence = field('evidence');
  const category = field('category');

  if (!title) errors.push(`${rel}: 缺少 title`);
  else if (title.length > 70) warnings.push(`${rel}: title 偏长（${title.length}）`);

  if (!description) errors.push(`${rel}: 缺少 description`);
  else if (description.length < 20 || description.length > 320) {
    errors.push(`${rel}: description 长度 ${description.length} 超出 20-320`);
  }

  if (!evidence || !EVIDENCE.has(evidence)) {
    errors.push(`${rel}: evidence 取值非法（${evidence ?? '空'}）`);
  }

  if (!category) errors.push(`${rel}: 缺少 category`);

  if (!/^publishDate:/m.test(front)) errors.push(`${rel}: 缺少 publishDate`);

  if (/^#\s/m.test(body.trimStart().split('\n')[0] ?? '')) {
    errors.push(`${rel}: 正文不应使用一级标题`);
  }

  const section = rel.split('/')[2];
  if (SECTIONS.has(section)) {
    const references = (front.match(/^\s{2}- title:/gm) ?? []).length;
    if (references === 0 && section !== 'cases') {
      warnings.push(`${rel}: 没有参考资料`);
    }
  }
}

/* ---------- 输出 ---------- */

const uniqueErrors = [...new Set(errors)];
const uniqueWarnings = [...new Set(warnings)];

console.log(`检查了 ${pages.length} 个页面、${contentFiles.length} 篇内容\n`);

if (uniqueWarnings.length > 0) {
  console.log(`警告（${uniqueWarnings.length}）`);
  for (const warning of uniqueWarnings.slice(0, 40)) console.log(`  · ${warning}`);
  if (uniqueWarnings.length > 40) console.log(`  … 另有 ${uniqueWarnings.length - 40} 条`);
  console.log('');
}

if (uniqueErrors.length > 0) {
  console.log(`错误（${uniqueErrors.length}）`);
  for (const error of uniqueErrors) console.log(`  ✗ ${error}`);
  process.exit(1);
}

console.log('✓ 所有检查通过');
