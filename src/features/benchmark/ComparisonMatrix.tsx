import { useMemo, useState } from 'react';
import type { Observation, Project, Run } from '@/lib/benchmark/types';
import { consistencyReport } from '@/lib/benchmark/consistency';
import { Note, Panel } from '@/features/shared/ui';

type Batch = { batchId: string; label: string; createdAt: string; runCount: number };

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function ComparisonMatrix({
  project,
  runs,
  observations,
  batches,
}: {
  project: Project;
  runs: Run[];
  observations: Observation[];
  batches: Batch[];
}) {
  const [selected, setSelected] = useState<string>(batches[0]?.batchId ?? '');

  const report = useMemo(() => {
    if (!selected) return null;
    return consistencyReport(project, runs, observations, selected);
  }, [project, runs, observations, selected]);

  if (batches.length === 0) {
    return (
      <Panel title="跨端点对比">
        <p className="text-[11px] leading-relaxed text-white/45">
          还没有对比批次。在「运行」面板里选中两个以上端点并点击「并行运行」，这里会出现一致性矩阵。
        </p>
        <div className="mt-3">
          <Note>
            对比的目的不是选出“正确答案”，而是看清分歧：哪些问题只有部分模型提及你的品牌、哪些来源被某个端点独占。
          </Note>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="跨端点对比" hint={`${batches.length} 批`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="workbench-label">批次</span>
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="workbench-input !w-auto !py-1 !text-[11px]"
        >
          {batches.map((batch) => (
            <option key={batch.batchId} value={batch.batchId}>
              {batch.label} · {batch.runCount} 端点 · {batch.createdAt.slice(0, 16).replace('T', ' ')}
            </option>
          ))}
        </select>
        {report && (
          <span className="ml-auto font-mono text-[10px] text-white/35">
            {report.summary.questions} 题 · {report.summary.endpointCount} 端点
          </span>
        )}
      </div>

      {!report ? (
        <p className="mt-3 text-[11px] text-white/40">批次数据缺失。</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-2">
              <p className="workbench-label">全一致</p>
              <p className="mt-0.5 font-display text-lg text-emerald-300">{report.summary.fullAgreement}</p>
              <p className="text-[9px] text-white/35">所有端点都提及</p>
            </div>
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-2">
              <p className="workbench-label">分歧</p>
              <p className="mt-0.5 font-display text-lg text-amber-300">{report.summary.partialAgreement}</p>
              <p className="text-[9px] text-white/35">部分端点提及</p>
            </div>
            <div className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-2.5 py-2">
              <p className="workbench-label">全未提及</p>
              <p className="mt-0.5 font-display text-lg text-rose-300">{report.summary.noneAgreement}</p>
              <p className="text-[9px] text-white/35">所有端点都没提</p>
            </div>
          </div>

          {/* 端点概览 */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {report.endpoints.map((endpoint) => (
              <div key={endpoint.runId} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] text-white/80">{endpoint.endpointName}</span>
                  <span
                    className={`shrink-0 font-mono text-[9px] uppercase ${
                      endpoint.status === 'completed'
                        ? 'text-emerald-300'
                        : endpoint.status === 'failed'
                          ? 'text-rose-300'
                          : 'text-white/40'
                    }`}
                  >
                    {endpoint.status}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[9px] text-white/30">{endpoint.model}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10px] text-white/50">
                  <span>{endpoint.total} 条</span>
                  <span>提及 {percent(endpoint.mentionRate)}</span>
                  <span>引用 {percent(endpoint.citationRate)}</span>
                  <span>{endpoint.uniqueDomains} 个来源</span>
                  {endpoint.stability !== null && <span>稳定 {percent(endpoint.stability)}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* 矩阵 */}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[11px]">
              <thead>
                <tr className="text-left text-white/35">
                  <th className="pb-1 font-normal">问题</th>
                  {report.endpoints.map((endpoint) => (
                    <th key={endpoint.runId} className="pb-1 text-center font-normal">
                      {endpoint.endpointName}
                    </th>
                  ))}
                  <th className="pb-1 text-right font-normal">一致</th>
                </tr>
              </thead>
              <tbody className="text-white/70">
                {report.rows.map((row) => (
                  <tr key={row.questionId} className="border-t border-white/5">
                    <td className="max-w-[260px] py-1.5 pr-2">
                      <span className="block truncate" title={row.questionText}>
                        {row.questionText}
                      </span>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.runId} className="py-1.5 text-center">
                        <span
                          className={`inline-flex min-w-[34px] items-center justify-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                            cell.mentioned
                              ? 'bg-emerald-400/15 text-emerald-200'
                              : 'bg-white/5 text-white/35'
                          }`}
                          title={
                            cell.mentioned
                              ? `提及 ${cell.mentionCount}/${cell.repeatCount} 次${cell.position ? `，首次在第 ${cell.position} 句` : ''} · ${cell.citationCount} 个来源`
                              : `提及 ${cell.mentionCount}/${cell.repeatCount} 次 · ${cell.citationCount} 个来源`
                          }
                        >
                          {cell.mentioned ? '●' : '○'}
                          {cell.repeatCount > 1 && (
                            <span className="opacity-70">
                              {cell.mentionCount}/{cell.repeatCount}
                            </span>
                          )}
                          {cell.repeatCount === 1 && cell.citationCount > 0 && (
                            <span className="opacity-60">{cell.citationCount}</span>
                          )}
                        </span>
                      </td>
                    ))}
                    <td className="py-1.5 text-right">
                      <span
                        className={`font-mono text-[10px] ${
                          row.agreement === 'all'
                            ? 'text-emerald-300'
                            : row.agreement === 'partial'
                              ? 'text-amber-300'
                              : 'text-rose-300'
                        }`}
                      >
                        {row.agreement === 'all' ? '全提及' : row.agreement === 'partial' ? `${row.mentionedCount}/${row.cells.length}` : '无'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 来源重叠 */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="workbench-label">来源重叠（Jaccard）</p>
              <ul className="mt-1.5 space-y-1">
                {report.pairwise.map((pair) => (
                  <li key={`${pair.a}-${pair.b}`} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] text-white/60">
                      {pair.a} vs {pair.b}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-white/45">
                      {percent(pair.jaccard)} · {pair.shared}
                    </span>
                  </li>
                ))}
                {report.pairwise.length === 0 && <li className="text-[11px] text-white/35">需要至少两个端点。</li>}
              </ul>
            </div>

            <div>
              <p className="workbench-label">各端点独占来源</p>
              <ul className="mt-1.5 space-y-1.5">
                {report.exclusiveDomains.map((item) => (
                  <li key={item.endpoint}>
                    <span className="text-[11px] text-white/60">{item.endpoint}</span>
                    <span className="ml-2 font-mono text-[10px] text-white/35">
                      {item.domains.length > 0 ? item.domains.join(', ') : '无独占'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {report.sharedDomains.length > 0 && (
            <div className="mt-3">
              <p className="workbench-label">被多个端点共同引用</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {report.sharedDomains.map((item) => (
                  <li
                    key={item.domain}
                    className="rounded border border-brand-400/30 bg-brand-400/10 px-2 py-0.5 font-mono text-[10px] text-brand-100"
                    title={item.endpoints.join(' / ')}
                  >
                    {item.domain}
                    <span className="ml-1 text-white/35">×{item.endpoints.length}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3">
            <Note tone="warn">
              一致性低不代表某个端点“错”，只说明结果依赖模型与检索来源。矩阵单元格：● 提及（数字为引用条数）、○ 未提及；
              全一致只表示所有端点都提到了品牌，不表示描述准确。
            </Note>
          </div>
        </>
      )}
    </Panel>
  );
}
