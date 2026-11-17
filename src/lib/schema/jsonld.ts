import { SITE } from '../seo/site';
import { absoluteUrl } from '../seo/meta';

/**
 * JSON-LD 结构化数据。
 * 原则（写在文档里，也写在这里）：结构化数据帮助机器理解页面，
 * 但它不是 AI 引用保证。不生成虚假的 author、review 或 aggregateRating。
 */

export type JsonLd = Record<string, unknown>;

export function organizationSchema(): JsonLd {
  return {
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    description: SITE.description,
    email: SITE.organization.email,
    sameAs: SITE.organization.sameAs,
    knowsAbout: [
      'Generative Engine Optimization',
      'Retrieval-Augmented Generation',
      'AI Search',
      'Semantic Search',
      'Knowledge Graph',
      'Technical SEO',
    ],
  };
}

export function websiteSchema(): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    inLanguage: SITE.lang,
    publisher: { '@id': `${SITE.url}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE.url}/search/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function personSchema(name = SITE.author.name, role = SITE.author.role): JsonLd {
  return {
    '@type': 'Person',
    '@id': `${SITE.url}/about/#author`,
    name,
    jobTitle: role,
    url: absoluteUrl('/about/'),
    worksFor: { '@id': `${SITE.url}/#organization` },
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

export type ArticleSchemaInput = {
  title: string;
  description: string;
  url: string;
  published?: Date;
  modified?: Date;
  image?: string;
  author?: string;
  section?: string;
  tags?: string[];
};

export function articleSchema(input: ArticleSchemaInput): JsonLd {
  return {
    '@type': 'ScholarlyArticle',
    '@id': `${absoluteUrl(input.url)}#article`,
    headline: input.title,
    description: input.description,
    url: absoluteUrl(input.url),
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(input.url) },
    datePublished: input.published?.toISOString(),
    dateModified: (input.modified ?? input.published)?.toISOString(),
    image: absoluteUrl(input.image ?? SITE.defaultOgImage),
    author: { '@type': 'Person', name: input.author ?? SITE.author.name },
    publisher: { '@id': `${SITE.url}/#organization` },
    articleSection: input.section,
    keywords: input.tags?.join(', '),
    isAccessibleForFree: true,
    inLanguage: SITE.lang,
  };
}

export function softwareApplicationSchema(input: {
  name: string;
  description: string;
  url: string;
  category?: string;
}): JsonLd {
  return {
    '@type': 'SoftwareApplication',
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.url),
    applicationCategory: input.category ?? 'WebApplication',
    operatingSystem: 'Any modern browser',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    provider: { '@id': `${SITE.url}/#organization` },
  };
}

export function graph(nodes: JsonLd[]): JsonLd {
  return { '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) };
}
