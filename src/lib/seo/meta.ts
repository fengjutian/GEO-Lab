import { SITE } from './site';

export type MetaInput = {
  title: string;
  description: string;
  /** 相对路径或绝对 URL；内部页面传 pathname 会更安全 */
  canonical?: string;
  image?: string;
  type?: 'website' | 'article' | 'profile';
  publishedTime?: Date;
  modifiedTime?: Date;
  author?: string;
  tags?: string[];
  noindex?: boolean;
};

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const base = SITE.url.replace(/\/$/, '');
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function buildMeta(input: MetaInput) {
  const canonical = absoluteUrl(input.canonical ?? '/');
  const image = absoluteUrl(input.image ?? SITE.defaultOgImage);
  const fullTitle =
    input.title === SITE.name ? `${SITE.name} · ${SITE.nameZh}` : `${input.title} | ${SITE.name}`;

  return {
    title: fullTitle,
    description: input.description,
    canonical,
    image,
    type: input.type ?? 'website',
    publishedTime: input.publishedTime?.toISOString(),
    modifiedTime: input.modifiedTime?.toISOString(),
    author: input.author ?? SITE.author.name,
    tags: input.tags ?? [],
    noindex: input.noindex ?? false,
  };
}
