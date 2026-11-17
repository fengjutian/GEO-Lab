import { useEffect, useMemo, useState } from 'react';
import { WorkbenchShell, Panel, Metric, Bar, Note } from '@/features/shared/ui';

type Level = 'pass' | 'warn' | 'fail';
type Layer = 'crawl' | 'understand' | 'trust';

type CheckResult = {
  id: string;
  title: string;
  layer: Layer;
  level: Level;
  detail: string;
  recommendation: string;
};

const LAYER_LABELS: Record<Layer, string> = {
  crawl: '可抓取',
  understand: '可理解',
  trust: '可信任',
};

const LAYER_DESCRIPTIONS: Record<Layer, string> = {
  crawl: '搜索与抓取系统能否获取并索引页面',
  understand: '内容结构与实体信息能否被正确解析',
  trust: '作者、组织与来源信号是否足够明确',
};

const DEMO_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>什么是 GEO</title>
    <meta name="description" content="介绍 GEO。" />
    <link rel="canonical" href="https://example.com/what-is-geo/" />
    <meta property="og:title" content="什么是 GEO" />
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Article","headline":"什么是 GEO","author":{"@type":"Person","name":"Example Author"}}
    </script>
  </head>
  <body>
    <h1>什么是 GEO</h1>
    <h3>检索过程</h3>
    <p>GEO 是生成式引擎优化。AI 搜索会先检索网页，再生成答案。</p>
    <p>这里是一段很长的内容，用来演示正文长度检查。</p>
    <h3>怎么优化</h3>
    <p>加结构化数据。</p>
    <img src="diagram.png" />
  </body>
</html>`;

function absolute(url: string): boolean {
  return /^https?:\/\/[^\s]+$/.test(url);
}

function parseJsonLd(doc: Document): { blocks: number; types: string[]; invalid: number; hasAuthor: boolean; hasOrganization: boolean } {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  const types: string[] = [];
  let invalid = 0;
  let hasAuthor = false;
  let hasOrganization = false;

  const collect = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record['@type'] === 'string') types.push(record['@type']);
    if (Array.isArray(record['@type'])) types.push(...(record['@type'] as string[]));
    if (record.author) hasAuthor = true;
    if (record['@type'] === 'Organization' || record.publisher) hasOrganization = true;
    if (record['@graph']) collect(record['@graph']);
  };

  for (const script of scripts) {
    try {
      collect(JSON.parse(script.textContent ?? ''));
    } catch {
      invalid += 1;
    }
  }
  return { blocks: scripts.length, types: [...new Set(types)], invalid, hasAuthor, hasOrganization };
}

function runAudit(html: string): CheckResult[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const results: CheckResult[] = [];

  const title = doc.querySelector('title')?.textContent?.trim() ?? '';
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? '';
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() ?? '';
  const robots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
  const lang = doc.documentElement.getAttribute('lang') ?? '';
  const h1s = doc.querySelectorAll('h1');
  const h2s = doc.querySelectorAll('h2');
  const h3s = doc.querySelectorAll('h3');
  const text = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const jsonLd = parseJsonLd(doc);
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '';
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '';
  const metaAuthor = doc.querySelector('meta[name="author"]')?.getAttribute('content') ?? '';
  const images = Array.from(doc.querySelectorAll('img'));
  const missingAlt = images.filter((image) => !image.getAttribute('alt')?.trim()).length;
  const links = Array.from(doc.querySelectorAll('a[href]'));
  const internal = links.filter((link) => {
    const href = link.getAttribute('href') ?? '';
    return href.startsWith('/') || href.startsWith('.') || href.startsWith('#');
  }).length;
  const external = links.length - internal;
  const hreflang = doc.querySelectorAll('link[rel="alternate"][hreflang]').length;
  const headingSkip = h3s.length > 0 && h2s.length === 0;

  results.push({
    id: 'title',
    title: '页面标题',
    layer: 'crawl',
    level: !title ? 'fail' : title.length < 10 || title.length > 60 ? 'warn' : 'pass',
    detail: title ? `“${title}”（${title.length} 字符）` : '没有 title 元素',
    recommendation: '标题应包含主题实体与限定词，20-40 个汉字或 10-60 个字符最稳妥。',
  });

  results.push({
    id: 'description',
    title: 'Meta 描述',
    layer: 'crawl',
    level: !description ? 'warn' : description.length < 40 || description.length > 200 ? 'warn' : 'pass',
    detail: description ? `${description.length} 字符` : '缺少 meta description',
    recommendation: '描述不直接影响排名，但影响摘要与点击；写成一句可独立理解的结论。',
  });

  results.push({
    id: 'canonical',
    title: 'Canonical',
    layer: 'crawl',
    level: !canonical ? 'warn' : absolute(canonical) ? 'pass' : 'fail',
    detail: canonical || '缺少 canonical',
    recommendation: '使用绝对地址，并确保与 sitemap 中的 URL 一致，避免重复内容分散权重。',
  });

  results.push({
    id: 'robots',
    title: '索引指令',
    layer: 'crawl',
    level: robots.includes('noindex') ? 'fail' : 'pass',
    detail: robots ? `meta robots: ${robots}` : '未设置 meta robots（默认允许索引）',
    recommendation: '确认没有误加 noindex；noindex 页面不应出现在 sitemap 中。',
  });

  results.push({
    id: 'lang',
    title: '页面语言声明',
    layer: 'understand',
    level: lang ? 'pass' : 'warn',
    detail: lang ? `lang="${lang}"` : 'html 元素缺少 lang 属性',
    recommendation: '声明主要语言，多语言页面配合 hreflang。',
  });

  results.push({
    id: 'h1',
    title: 'H1 唯一性',
    layer: 'understand',
    level: h1s.length === 1 ? 'pass' : h1s.length === 0 ? 'fail' : 'warn',
    detail: `检测到 ${h1s.length} 个 H1`,
    recommendation: '一个页面保留一个 H1，与 title 形成主次关系而不是重复。',
  });

  results.push({
    id: 'headings',
    title: '标题层级',
    layer: 'understand',
    level: headingSkip ? 'warn' : h2s.length >= 2 ? 'pass' : 'warn',
    detail: `H2 ${h2s.length} 个 / H3 ${h3s.length} 个${headingSkip ? '（层级跳跃）' : ''}`,
    recommendation: '用 H2 划分主题边界，H3 只做细化；层级跳跃会让解析器误判结构。',
  });

  results.push({
    id: 'jsonld',
    title: 'JSON-LD 结构化数据',
    layer: 'understand',
    level: jsonLd.invalid > 0 ? 'fail' : jsonLd.blocks === 0 ? 'warn' : 'pass',
    detail:
      jsonLd.blocks === 0
        ? '未检测到 JSON-LD'
        : `${jsonLd.blocks} 个块${jsonLd.types.length ? `，类型：${jsonLd.types.slice(0, 6).join('、')}` : ''}${jsonLd.invalid ? `，${jsonLd.invalid} 个解析失败` : ''}`,
    recommendation: '至少声明 WebPage/Article 与 Organization；错误的 JSON-LD 比没有更糟。',
  });

  results.push({
    id: 'heading-skip',
    title: '正文字数',
    layer: 'understand',
    level: text.length < 300 ? 'warn' : text.length > 800 ? 'pass' : 'warn',
    detail: `可见文本约 ${text.length} 字符`,
    recommendation: '核心主题页建议 800 字以上，但信息密度优先于长度。',
  });

  results.push({
    id: 'og',
    title: 'Open Graph',
    layer: 'trust',
    level: ogTitle && ogImage ? 'pass' : ogTitle ? 'warn' : 'warn',
    detail: `og:title ${ogTitle ? '有' : '无'} / og:image ${ogImage ? '有' : '无'}`,
    recommendation: '社交与聚合场景的展示依赖 OG；图片使用绝对地址。',
  });

  results.push({
    id: 'author',
    title: '作者信号',
    layer: 'trust',
    level: metaAuthor || jsonLd.hasAuthor ? 'pass' : 'warn',
    detail: metaAuthor
      ? `meta author: ${metaAuthor}`
      : jsonLd.hasAuthor
        ? 'JSON-LD 中声明了 author'
        : '未发现作者信息',
    recommendation: '技术内容应署名，并提供作者页面或简介链接。',
  });

  results.push({
    id: 'organization',
    title: '组织实体',
    layer: 'trust',
    level: jsonLd.hasOrganization ? 'pass' : 'warn',
    detail: jsonLd.hasOrganization ? 'JSON-LD 中声明了组织或 publisher' : '未发现组织实体声明',
    recommendation: '组织实体应站点级一致，并配合 sameAs 指向已知档案。',
  });

  results.push({
    id: 'alt',
    title: '图片替代文本',
    layer: 'trust',
    level: missingAlt === 0 ? 'pass' : missingAlt > 2 ? 'fail' : 'warn',
    detail: images.length === 0 ? '页面没有图片' : `${missingAlt}/${images.length} 张图片缺少 alt`,
    recommendation: '示意图的 alt 应说明它表达的关系，而不是“配图”。',
  });

  results.push({
    id: 'links',
    title: '链接结构',
    layer: 'trust',
    level: internal >= 2 ? 'pass' : 'warn',
    detail: `内部链接 ${internal} 个 / 外部链接 ${external} 个`,
    recommendation: '内部链接把主题相关的页面连接起来，帮助系统理解站点结构。',
  });

  results.push({
    id: 'hreflang',
    title: '多语言声明',
    layer: 'trust',
    level: hreflang > 0 ? 'pass' : 'warn',
    detail: hreflang > 0 ? `${hreflang} 条 hreflang` : '未声明 hreflang',
    recommendation: '单语站点可以忽略；双语站必备，否则容易被判为重复内容。',
  });

  return results;
}

const WEIGHTS: Record<Layer, number> = { crawl: 40, understand: 35, trust: 25 };

function layerScore(results: CheckResult[], layer: Layer): number {
  const scoped = results.filter((result) => result.layer === layer);
  if (scoped.length === 0) return 0;
  const earned = scoped.reduce(
    (sum, result) => sum + (result.level === 'pass' ? 1 : result.level === 'warn' ? 0.5 : 0),
    0,
  );
  return Math.round((earned / scoped.length) * WEIGHTS[layer]);
}

export default function SiteAudit() {
  const [html, setHtml] = useState(DEMO_HTML);
  /** DOMParser 只在浏览器存在：SSR 阶段不跑诊断，避免 hydration 不一致 */
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [mode, setMode] = useState<'paste' | 'remote'>('paste');
  const [status, setStatus] = useState<string>('');
  const [remoteMeta, setRemoteMeta] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setMounted(true), []);

  const results = useMemo(() => (mounted && html.trim() ? runAudit(html) : null), [mounted, html]);
  const overall = results
    ? layerScore(results, 'crawl') + layerScore(results, 'understand') + layerScore(results, 'trust')
    : 0;

  const fetchRemote = async () => {
    if (!url.trim() || !endpoint.trim()) {
      setStatus('远程模式需要填写一个允许跨域的服务端抓取端点。');
      return;
    }
    setLoading(true);
    setStatus('');
    setRemoteMeta(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw new Error(`端点返回 ${response.status}`);
      const payload = (await response.json()) as { html?: string; status?: number; headers?: Record<string, string> };
      if (!payload.html) throw new Error('端点没有返回 html 字段');
      setHtml(payload.html);
      setRemoteMeta({
        状态码: String(payload.status ?? '未知'),
        'content-type': payload.headers?.['content-type'] ?? '未知',
      });
      setStatus(`抓取成功：${new URL(url).hostname}`);
    } catch (error) {
      setStatus(`抓取失败：${(error as Error).message}。浏览器同源策略不允许直接读取他人站点 HTML。`);
    } finally {
      setLoading(false);
    }
  };

  const levelStyle = (level: Level) =>
    level === 'pass'
      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
      : level === 'warn'
        ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
        : 'border-rose-400/25 bg-rose-400/10 text-rose-200';

  return (
    <WorkbenchShell>
      <div className="flex flex-wrap items-center gap-2">
        {(['paste', 'remote'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
              mode === value
                ? 'border-brand-400 bg-brand-400/20 text-white'
                : 'border-white/15 text-white/60 hover:text-white'
            }`}
          >
            {value === 'paste' ? '粘贴 HTML 源码' : '远程抓取（需要端点）'}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-white/35">全部在浏览器内解析，不上传页面内容</span>
      </div>

      {mode === 'paste' ? (
        <Panel title="HTML 源码" hint={html ? `${html.length} 字符` : '在页面右键 → 查看源代码'}>
          <textarea
            value={html}
            onChange={(event) => setHtml(event.target.value)}
            rows={7}
            placeholder="粘贴完整 HTML 源码…"
            className="workbench-input resize-y font-mono !text-[11px]"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setHtml(DEMO_HTML)}
              className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60 hover:text-white"
            >
              重置为问题示例
            </button>
            <button
              type="button"
              onClick={() => {
                setHtml('');
                setRemoteMeta(null);
              }}
              className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60 hover:text-white"
            >
              清空
            </button>
          </div>
        </Panel>
      ) : (
        <Panel title="远程抓取">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/page/"
              className="workbench-input"
            />
            <input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="抓取端点，如 https://your-api.dev/fetch"
              className="workbench-input"
            />
            <button
              type="button"
              onClick={() => void fetchRemote()}
              disabled={loading}
              className="btn btn-accent !py-2 !text-xs disabled:opacity-50"
            >
              {loading ? '抓取中…' : '抓取并诊断'}
            </button>
          </div>
          {status && <p className="mt-2 text-[11px] leading-relaxed text-amber-200/80">{status}</p>}
          {remoteMeta && (
            <dl className="mt-2 flex flex-wrap gap-4">
              {Object.entries(remoteMeta).map(([key, value]) => (
                <div key={key}>
                  <dt className="workbench-label">{key}</dt>
                  <dd className="font-mono text-[11px] text-white/70">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      )}

      {results && (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <Metric
              label="综合得分"
              value={overall}
              unit="/100"
              tone={overall >= 80 ? 'good' : overall >= 60 ? 'warn' : 'bad'}
            />
            {(['crawl', 'understand', 'trust'] as Layer[]).map((layer) => (
              <Metric key={layer} label={LAYER_LABELS[layer]} value={layerScore(results, layer)} unit={`/${WEIGHTS[layer]}`} />
            ))}
          </div>

          <div className="mt-4 space-y-4">
            {(['crawl', 'understand', 'trust'] as Layer[]).map((layer) => (
              <Panel key={layer} title={LAYER_LABELS[layer]} hint={LAYER_DESCRIPTIONS[layer]}>
                <div className="mb-3">
                  <Bar value={layerScore(results, layer)} max={WEIGHTS[layer]} />
                </div>
                <ul className="grid gap-2 lg:grid-cols-2">
                  {results
                    .filter((result) => result.layer === layer)
                    .map((result) => (
                      <li key={result.id} className={`rounded-lg border p-2.5 ${levelStyle(result.level)}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[12px] font-medium">{result.title}</span>
                          <span className="shrink-0 font-mono text-[9px] uppercase opacity-70">
                            {result.level}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed opacity-85">{result.detail}</p>
                        {result.level !== 'pass' && (
                          <p className="mt-1 text-[10px] leading-relaxed text-white/45">{result.recommendation}</p>
                        )}
                      </li>
                    ))}
                </ul>
              </Panel>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 space-y-2">
        <Note tone="warn">
          这是静态结构检查，不是 AI 可见性测试。它不能告诉你“AI 会不会引用这个页面” ——
          引用取决于具体查询、检索结果与模型行为，只能通过可见性测试观测（见实验协议）。
          另外，粘贴模式无法检查 robots.txt、sitemap、HTTP 状态码与真实渲染结果。
        </Note>
        <Note>
          远程抓取模式不内置代理：请填写你自己的抓取端点（POST {'{ url }'}，返回 {'{ html, status, headers }'}）。
          GEO Lab 不在服务端保存你提交的 URL。
        </Note>
      </div>
    </WorkbenchShell>
  );
}
