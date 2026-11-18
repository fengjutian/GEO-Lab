import type { APIRoute } from 'astro';
import { getProject, listObservations, listRuns } from '@/lib/benchmark/db';
import { computeMetrics } from '@/lib/benchmark/metrics';
import { notFound } from '@/lib/benchmark/http';

export const prerender = false;

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export const GET: APIRoute = async ({ params, url }) => {
  const project = await getProject(params.id ?? '');
  if (!project) return notFound('项目不存在');

  const format = url.searchParams.get('format') === 'md' ? 'md' : 'csv';
  const runId = url.searchParams.get('runId') ?? undefined;
  const runs = await listRuns(project.id);
  const run = runId ? runs.find((item) => item.id === runId) : runs[0];
  const observations = await listObservations(project.id, run?.id);
  const metrics = computeMetrics(project, observations, project.questions);
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

  if (format === 'md') {
    const lines = [
      `# ${project.name} — 可见性测试报告`,
      '',
      `- 品牌：${project.brand}`,
      `- 站点：${project.site || '未填写'}`,
      `- 竞品：${project.competitors.join('、') || '未填写'}`,
      `- 运行：${run ? `${run.label}（${run.startedAt}）` : '暂无运行'}`,
      `- 记录数：${metrics.total}`,
      '',
      '## 指标（口径见 /benchmark/ 方法说明）',
      '',
      '| 指标 | 数值 |',
      '| --- | --- |',
      `| 提及率 | ${percent(metrics.mentionRate)} |`,
      `| 引用率 | ${percent(metrics.citationRate)} |`,
      `| 来源份额 | ${percent(metrics.shareOfVoice)} |`,
      `| 平均出现位置 | ${metrics.averagePosition ?? '—'} |`,
      `| 重复观测稳定性 | ${metrics.stability === null ? '未做重复观测' : percent(metrics.stability)} |`,
      `| 每题观测次数 | ${metrics.repeatCount} |`,
      '',
      '## 按意图分层',
      '',
      '| 意图 | 记录数 | 提及率 |',
      '| --- | --- | --- |',
      ...metrics.byIntent.map((item) => `| ${item.intent} | ${item.total} | ${percent(item.mentionRate)} |`),
      '',
      '## 引用来源分布',
      '',
      '| 域名 | 次数 |',
      '| --- | --- |',
      ...metrics.citationDomains.map((item) => `| ${item.domain} | ${item.count} |`),
      '',
      '## 逐条记录',
      '',
      ...observations.map(
        (observation, index) =>
          [
            `### ${index + 1}. ${observation.questionText}`,
            '',
            `- 提及品牌：${observation.brandMentioned ? '是' : '否'}${observation.brandPosition ? `（第 ${observation.brandPosition} 句）` : ''}`,
            `- 引用：${observation.citations.join(' ') || '无'}`,
            `- 记录方式：${observation.mode === 'auto' ? '自动' : '手工'}`,
            '',
            '```text',
            observation.answer,
            '```',
            '',
          ].join('\n'),
      ),
      '',
      '> 本报告由 GEO Lab 可见性工作台生成。指标只反映本次记录，不代表排名或引用概率；请同时记录模型版本、时间与问题集。',
    ];

    return new Response(lines.join('\n'), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="geo-benchmark-${project.id.slice(0, 8)}.md"`,
        'cache-control': 'no-store',
      },
    });
  }

  const header = [
    'question_id',
    'question',
    'repeat_index',
    'brand_mentioned',
    'brand_position',
    'competitors',
    'citations',
    'mode',
    'run_id',
    'run_label',
    'answer',
  ];
  const rows = observations.map((observation) =>
    [
      observation.questionId,
      observation.questionText,
      observation.repeatIndex,
      observation.brandMentioned ? '1' : '0',
      observation.brandPosition ?? '',
      Object.entries(observation.competitorMentions)
        .filter(([, present]) => present)
        .map(([name]) => name)
        .join('|'),
      observation.citations.join('|'),
      observation.mode,
      observation.runId,
      run?.label ?? '',
      observation.answer.replace(/\s+/g, ' '),
    ]
      .map(csvCell)
      .join(','),
  );

  // BOM 让 Excel 正确识别 UTF-8 中文
  const body = `\uFEFF${[header.map(csvCell).join(','), ...rows].join('\r\n')}`;

  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="geo-benchmark-${project.id.slice(0, 8)}.csv"`,
      'cache-control': 'no-store',
    },
  });
};
