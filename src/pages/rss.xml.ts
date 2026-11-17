import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getAllContent, readingTime } from '@/lib/content/queries';
import { SITE } from '@/lib/seo/site';

export async function GET(context: APIContext) {
  const all = await getAllContent();

  return rss({
    title: `${SITE.name} · ${SITE.nameZh}`,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: all.slice(0, 40).map(({ entry, section, href }) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.publishDate,
      link: href,
      categories: [section, entry.data.category, ...entry.data.tags],
      author: entry.data.author,
      customData: `<language>zh-CN</language><readingTime>${readingTime(entry)}</readingTime>`,
    })),
    customData: `<language>zh-CN</language><copyright>CC BY 4.0 — ${SITE.name}</copyright>`,
  });
}
