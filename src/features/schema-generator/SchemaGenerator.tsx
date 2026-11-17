import { useMemo, useState } from 'react';
import { WorkbenchShell, Panel, Note, CopyButton } from '@/features/shared/ui';

type SchemaType = 'Article' | 'Organization' | 'FAQPage';

const TYPES: { value: SchemaType; label: string; hint: string }[] = [
  { value: 'Article', label: 'Article', hint: '技术文章、研究报告、案例分析' },
  { value: 'Organization', label: 'Organization', hint: '组织与品牌实体' },
  { value: 'FAQPage', label: 'FAQPage', hint: '常见问题集合' },
];

type ArticleState = {
  headline: string;
  description: string;
  url: string;
  author: string;
  publisher: string;
  datePublished: string;
  dateModified: string;
  image: string;
  keywords: string;
};

type OrganizationState = {
  name: string;
  url: string;
  logo: string;
  description: string;
  sameAs: string;
  email: string;
};

type FaqItem = { question: string; answer: string };

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/.test(value);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

export default function SchemaGenerator() {
  const [type, setType] = useState<SchemaType>('Article');
  const [article, setArticle] = useState<ArticleState>({
    headline: '什么是 GEO？完整技术介绍',
    description: '从检索、理解到引用，解释生成式引擎优化实际影响的技术环节。',
    url: 'https://example.com/knowledge/what-is-geo/',
    author: 'GEO Lab Research',
    publisher: 'GEO Lab',
    datePublished: '2026-09-02',
    dateModified: '2026-11-10',
    image: 'https://example.com/images/og-geo.png',
    keywords: 'GEO, 生成式引擎优化, RAG',
  });
  const [organization, setOrganization] = useState<OrganizationState>({
    name: 'GEO Lab',
    url: 'https://example.com/',
    logo: 'https://example.com/images/logo.png',
    description: 'GEO 技术研究、实验工具与企业诊断服务。',
    sameAs: 'https://github.com/example\nhttps://www.linkedin.com/company/example',
    email: 'research@example.com',
  });
  const [faqs, setFaqs] = useState<FaqItem[]>([
    { question: 'GEO 会取代 SEO 吗？', answer: '不会。GEO 依赖可抓取、可理解的页面基础，这些正是 SEO 的工作范围。' },
    { question: '添加 JSON-LD 就能被 AI 引用吗？', answer: '不能。结构化数据是理解层的辅助信号，不决定检索命中与引用。' },
  ]);

  const { json, warnings } = useMemo(() => {
    const issues: string[] = [];
    let payload: Record<string, unknown> = { '@context': 'https://schema.org' };

    if (type === 'Article') {
      if (!article.headline.trim()) issues.push('headline 为空：Article 必须有标题。');
      if (!isAbsoluteUrl(article.url)) issues.push('url 必须是绝对地址（含 https://）。');
      if (!isIsoDate(article.datePublished)) issues.push('datePublished 需为 YYYY-MM-DD。');
      if (article.dateModified && new Date(article.dateModified) < new Date(article.datePublished)) {
        issues.push('dateModified 早于 datePublished，通常是错误。');
      }
      if (article.image && !isAbsoluteUrl(article.image)) issues.push('image 建议使用绝对地址。');
      if (!article.author.trim()) issues.push('author 为空会削弱作者信号。');

      payload = {
        ...payload,
        '@type': 'Article',
        headline: article.headline,
        description: article.description,
        url: article.url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': article.url },
        datePublished: article.datePublished,
        dateModified: article.dateModified || article.datePublished,
        image: article.image ? [article.image] : undefined,
        author: { '@type': 'Person', name: article.author },
        publisher: { '@type': 'Organization', name: article.publisher },
        keywords: article.keywords
          ? article.keywords.split(/[,，]/).map((value) => value.trim()).filter(Boolean)
          : undefined,
        inLanguage: 'zh-CN',
      };
    } else if (type === 'Organization') {
      if (!organization.name.trim()) issues.push('name 为空：Organization 必须有名称。');
      if (!isAbsoluteUrl(organization.url)) issues.push('url 必须是绝对地址。');
      if (organization.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(organization.email)) {
        issues.push('email 格式不正确。');
      }
      const sameAs = organization.sameAs
        .split(/\n|[,，]/)
        .map((value) => value.trim())
        .filter(Boolean);
      const invalidSameAs = sameAs.filter((value) => !isAbsoluteUrl(value));
      if (invalidSameAs.length > 0) issues.push(`sameAs 中有 ${invalidSameAs.length} 条不是绝对地址。`);

      payload = {
        ...payload,
        '@type': 'Organization',
        name: organization.name,
        url: organization.url,
        logo: organization.logo || undefined,
        description: organization.description || undefined,
        email: organization.email || undefined,
        sameAs: sameAs.length > 0 ? sameAs : undefined,
      };
    } else {
      if (faqs.length === 0) issues.push('至少需要一个问题。');
      faqs.forEach((faq, index) => {
        if (!faq.question.trim()) issues.push(`第 ${index + 1} 个问题为空。`);
        if (!faq.answer.trim()) issues.push(`第 ${index + 1} 个答案为空。`);
        if (faq.answer.length < 40) issues.push(`第 ${index + 1} 个答案少于 40 字，FAQ 内容过薄。`);
      });
      payload = {
        ...payload,
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      };
    }

    const cleaned = JSON.parse(
      JSON.stringify(payload, (_key, value) => (value === undefined || value === '' ? undefined : value)),
    );
    return { json: JSON.stringify(cleaned, null, 2), warnings: issues };
  }, [type, article, organization, faqs]);

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { type?: 'text' | 'date' | 'textarea'; placeholder?: string } = {},
  ) => (
    <label className="block">
      <span className="workbench-label">{label}</span>
      {options.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          placeholder={options.placeholder}
          className="workbench-input mt-1 resize-y text-[12px]"
        />
      ) : (
        <input
          type={options.type ?? 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={options.placeholder}
          className="workbench-input mt-1 text-[12px]"
        />
      )}
    </label>
  );

  return (
    <WorkbenchShell>
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setType(item.value)}
            className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
              type === item.value
                ? 'border-brand-400 bg-brand-400/20 text-white'
                : 'border-white/15 text-white/60 hover:text-white'
            }`}
          >
            {item.label}
            <span className="ml-1.5 text-[10px] text-white/35">{item.hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="填写字段">
          {type === 'Article' && (
            <div className="grid gap-3">
              {field('headline', article.headline, (value) => setArticle({ ...article, headline: value }))}
              {field('description', article.description, (value) => setArticle({ ...article, description: value }), { type: 'textarea' })}
              {field('url', article.url, (value) => setArticle({ ...article, url: value }))}
              <div className="grid gap-3 sm:grid-cols-2">
                {field('author', article.author, (value) => setArticle({ ...article, author: value }))}
                {field('publisher', article.publisher, (value) => setArticle({ ...article, publisher: value }))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {field('datePublished', article.datePublished, (value) => setArticle({ ...article, datePublished: value }), { type: 'date' })}
                {field('dateModified', article.dateModified, (value) => setArticle({ ...article, dateModified: value }), { type: 'date' })}
              </div>
              {field('image', article.image, (value) => setArticle({ ...article, image: value }))}
              {field('keywords', article.keywords, (value) => setArticle({ ...article, keywords: value }), { placeholder: '用逗号分隔' })}
            </div>
          )}

          {type === 'Organization' && (
            <div className="grid gap-3">
              {field('name', organization.name, (value) => setOrganization({ ...organization, name: value }))}
              {field('url', organization.url, (value) => setOrganization({ ...organization, url: value }))}
              {field('logo', organization.logo, (value) => setOrganization({ ...organization, logo: value }))}
              {field('description', organization.description, (value) => setOrganization({ ...organization, description: value }), { type: 'textarea' })}
              {field('sameAs（每行一个）', organization.sameAs, (value) => setOrganization({ ...organization, sameAs: value }), { type: 'textarea' })}
              {field('email', organization.email, (value) => setOrganization({ ...organization, email: value }))}
            </div>
          )}

          {type === 'FAQPage' && (
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <div key={index} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="workbench-label">问题 {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => setFaqs(faqs.filter((_, position) => position !== index))}
                      className="text-[10px] text-rose-300/70 hover:text-rose-200"
                    >
                      删除
                    </button>
                  </div>
                  <input
                    value={faq.question}
                    onChange={(event) =>
                      setFaqs(faqs.map((item, position) => (position === index ? { ...item, question: event.target.value } : item)))
                    }
                    className="workbench-input mt-1.5 text-[12px]"
                    placeholder="问题"
                  />
                  <textarea
                    value={faq.answer}
                    onChange={(event) =>
                      setFaqs(faqs.map((item, position) => (position === index ? { ...item, answer: event.target.value } : item)))
                    }
                    rows={3}
                    className="workbench-input mt-1.5 resize-y text-[12px]"
                    placeholder="答案，建议 60-160 字"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFaqs([...faqs, { question: '', answer: '' }])}
                className="w-full rounded-lg border border-dashed border-white/20 py-2 text-[11px] text-white/50 hover:border-brand-400 hover:text-white"
              >
                + 添加问题
              </button>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="JSON-LD 输出" hint="复制到 <head> 中的 script 标签">
            <pre className="max-h-[380px] overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-emerald-100/90">
              {json}
            </pre>
            <div className="mt-2 flex items-center gap-2">
              <CopyButton text={json} label="复制 JSON" />
              <span className="text-[10px] text-white/35">{json.length} 字符</span>
            </div>
          </Panel>

          <Panel title="校验提示">
            {warnings.length === 0 ? (
              <p className="text-[12px] text-emerald-300">结构完整，没有发现明显的填写问题。</p>
            ) : (
              <ul className="space-y-1.5">
                {warnings.map((warning) => (
                  <li key={warning} className="flex gap-2 text-[11px] leading-relaxed text-amber-200/80">
                    <span aria-hidden="true">!</span>
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <Note tone="warn">
          结构化数据帮助机器确认实体与属性，但它不是排名因子，也不是 AI 引用的开关。
          写错比不写更糟：错误的 author、日期或 sameAs 会造成实体冲突。发布前请用官方的富媒体结果测试工具校验。
        </Note>
      </div>
    </WorkbenchShell>
  );
}
