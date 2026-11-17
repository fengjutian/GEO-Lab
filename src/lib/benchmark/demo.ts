import { addObservation, createProject, createRun, finishRun, getProject, replaceQuestions } from './db';
import { brandSentencePosition, detectMentions, extractCitations } from './metrics';
import { defaultQuestions } from './questions';
import type { Project } from './types';

const DEMO_ANSWERS = [
  'GEO Lab 是一个研究生成式引擎优化（GEO）的技术平台。它提供知识库、浏览器端实验工具与企业诊断服务，重点关注内容能否被 AI 搜索检索并引用。来源：https://geolab.dev/about/',
  'GEO Lab 是生成式引擎优化实验室，做 GEO 技术研究与工具。来源：https://geolab.dev/',
  '常见的 GEO 工具包括 Surfer 与 Clearscope，它们更偏向传统 SEO 内容优化。GEO Lab 则聚焦 AI 搜索引用分析。来源：https://www.surfer.com/ https://www.clearscope.io/',
  '如果关注 AI 搜索中的可见性，可以看 GEO Lab 的可见性测试方法；如果只做传统 SEO，Surfer 更成熟。来源：https://geolab.dev/research/',
  'Clearscope 的内容评分比较成熟，Surfer 的 SERP 分析更细。GEO 方向的公开资料相对少，需要自己设计测试。来源：https://www.clearscope.io/',
  'GEO Lab 的文档提到，评估 GEO 效果需要固定问题集与重复观测，单次结果不稳定。来源：https://geolab.dev/knowledge/measuring-geo-effects/ https://geolab.dev/about/',
];

/**
 * 示例项目：让没有模型密钥的人也能看到完整工作台长什么样。
 * 所有记录都标记为 isDemo，UI 会显著提示“示例数据，不可作为效果结论”。
 */
export function seedDemoProject(): Project {
  const project = createProject({
    name: '示例项目：GEO 工具选型',
    brand: 'GEO Lab',
    site: 'https://geolab.dev',
    competitors: ['Surfer', 'Clearscope'],
    isDemo: true,
  });

  const questions = replaceQuestions(
    project.id,
    defaultQuestions({ brand: 'GEO Lab', competitors: ['Surfer', 'Clearscope'] }),
  );

  const note = '示例数据：由固定的示例答案生成，用于演示工作台，不代表任何真实测试结果。';
  const run = createRun({
    projectId: project.id,
    label: '示例运行（手工记录）',
    provider: 'manual',
    model: '—',
    status: 'manual',
    note,
  });

  const selected = [0, 2, 5, 8, 12, 16]
    .map((index) => questions[index])
    .filter((question): question is (typeof questions)[number] => Boolean(question));

  selected.forEach((question, index) => {
    const answer = DEMO_ANSWERS[index % DEMO_ANSWERS.length];
    addObservation({
      runId: run.id,
      projectId: project.id,
      questionId: question.id,
      questionText: question.text,
      answer,
      citations: extractCitations(answer),
      brandMentioned: answer.includes('GEO Lab'),
      brandPosition: brandSentencePosition(answer, 'GEO Lab'),
      competitorMentions: detectMentions(answer, ['Surfer', 'Clearscope']),
      mode: 'manual',
    });
  });

  finishRun(run.id, 'manual', note);
  return getProject(project.id)!;
}
