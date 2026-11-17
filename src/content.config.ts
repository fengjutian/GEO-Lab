import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 内容模型。知识库、研究、案例、工具四类内容共用一套基础字段，
 * 各自的分类枚举独立，避免一条内容到处都能放。
 */

const base = {
  title: z.string().max(120),
  description: z.string().min(20).max(300),
  /** 卡片与详情页的关键结论摘要，不是 SEO description 的复制 */
  summary: z.string().max(400).optional(),
  publishDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  author: z.string().default('GEO Lab Research'),
  cover: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** 证据等级：每条结论都要能说明它来自哪里 */
  evidence: z
    .enum(['official', 'paper', 'experiment', 'analysis', 'field'])
    .default('analysis'),
  featured: z.boolean().default(false),
  draft: z.boolean().default(false),
  /** 关联工具 slug，形成“知识 → 实验 → 研究 → 应用”的闭环 */
  tools: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
  references: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url().optional(),
        publisher: z.string().optional(),
        date: z.string().optional(),
      }),
    )
    .default([]),
  lang: z.enum(['zh', 'en']).default('zh'),
};

const knowledge = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/knowledge' }),
  schema: z.object({
    ...base,
    category: z.enum([
      '基础概念',
      'SEO 与 GEO',
      'AI 搜索原理',
      'RAG 与检索',
      'Embedding 与向量',
      '内容结构',
      '实体与知识图谱',
      '引用与可信度',
      '评估方法',
    ]),
    order: z.number().default(999),
  }),
});

const research = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/research' }),
  schema: z.object({
    ...base,
    category: z.enum(['论文解读', '实验报告', '技术趋势', '开源研究']),
    /** 实验类研究必须写明条件，避免把单次结果当成普遍规律 */
    methodology: z.string().optional(),
    sampleSize: z.string().optional(),
    testedAt: z.string().optional(),
    models: z.array(z.string()).default([]),
  }),
});

const cases = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/cases' }),
  schema: z.object({
    ...base,
    category: z.enum(['网站诊断', '内容优化', '实验对比', '企业 GEO']),
    site: z.string().optional(),
    industry: z.string().optional(),
    timeframe: z.string().optional(),
    /** 案例必须标明：结论是结构检查还是可见性测试 */
    scope: z.enum(['technical-audit', 'content-audit', 'visibility-test']).default('technical-audit'),
  }),
});

export const collections = { knowledge, research, cases };
