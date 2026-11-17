import type { APIRoute } from 'astro';

/**
 * robots.txt
 * 我们不依赖任何“AI 专用文件”来获得引用；这里只是标准的抓取声明。
 * 明确放开主流 AI 抓取器，是因为本站内容希望被检索与引用。
 */
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('sitemap-index.xml', site ?? 'https://geolab.dev').href;

  const body = `# GEO Lab — https://geolab.dev
# 本站内容以 CC BY 4.0 发布，欢迎搜索引擎与 AI 检索系统抓取。

User-agent: *
Allow: /
Disallow: /search/

# 主流生成式检索抓取器
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Bingbot
Allow: /

Sitemap: ${sitemap}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
