import { useEffect, useMemo, useState } from 'react';
import type {
  Intent,
  Metrics,
  Observation,
  Project,
  ProviderInfo,
  Run,
} from '@/lib/benchmark/types';
import { INTENTS } from '@/lib/benchmark/types';
import { computeMetrics } from '@/lib/benchmark/metrics';
import { Note, Panel, Metric, Bar, WorkbenchShell } from '@/features/shared/ui';

type Detail = {
  project: Project;
  runs: Run[];
  observations: Observation[];
  metrics: Metrics;
  latest: { run: Run; metrics: Metrics } | null;
};

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const shortDate = (iso?: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');

export default function BenchmarkProject({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<string>('all');
  const [manual, setManual] = useState({ runId: '', questionId: '', answer: '' });
  const [draftQuestions, setDraftQuestions] = useState<{ text: string; intent: Intent }[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async (keepNotice = false) => {
    try {
      const [detailResponse, providerResponse] = await Promise.all([
        fetch(`/api/benchmark/projects/${id}`),
        fetch('/api/benchmark/provider'),
      ]);
      if (!detailResponse.ok) {
        const payload = (await detailResponse.json()) as { error?: string };
        throw new Error(payload.error ?? '项目加载失败');
      }
      const detail = (await detailResponse.json()) as Detail;
      const providerPayload = (await providerResponse.json()) as { provider: ProviderInfo };
      setData(detail);
      setProvider(providerPayload.provider ?? null);
      if (!keepNotice) setError('');
      setManual((previous) => ({
        ...previous,
        runId:
          previous.runId ||
          detail.runs.find((run) => run.status === 'manual')?.id ||
          detail.runs[0]?.id ||
          '',
        questionId: previous.questionId || detail.project.questions[0]?.id || '',
      }));
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const scopedObservations = useMemo(() => {
    if (!data) return [];
    if (scope === 'all') return data.observations;
    return data.observations.filter((observation) => observation.runId === scope);
  }, [data, scope]);

  const metrics = useMemo(() => {
    if (!data) return null;
    if (scope === 'all') return data.metrics;
    return computeMetrics(data.project, scopedObservations, data.project.questions);
  }, [data, scope, scopedObservations]);

  const runTrend = useMemo(() => {
    if (!data) return [];
    return [...data.runs]
      .reverse()
      .map((run) => {
        const scoped = data.observations.filter((observation) => observation.runId === run.id);
        const computed = computeMetrics(data.project, scoped, data.project.questions);
        return { run, total: scoped.length, mentionRate: computed.mentionRate };
      })
      .filter((item) => item.total > 0);
  }, [data]);

  const post = async (url: string, body: unknown, successMessage: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? '请求失败');
      await load(true);
      setNotice(successMessage);
      return true;
    } catch (requestError) {
      setError((requestError as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startRun = async (mode: 'auto' | 'manual') => {
    await post(
      `/api/benchmark/projects/${id}/runs`,
      { mode },
      mode === 'auto'
        ? '自动运行已开始并完成，数据已刷新。'
        : '已创建手工记录批次，可在下方逐条录入答案。',
    );
  };

  const submitObservation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manual.runId || !manual.questionId) {
      setError('请选择批次与问题');
      return;
    }
    if (manual.answer.trim().length < 10) {
      setError('答案内容过短');
      return;
    }
    const ok = await post(
      `/api/benchmark/projects/${id}/observations`,
      {
        runId: manual.runId,
        questionId: manual.questionId,
        answer: manual.answer,
      },
      '记录已保存，指标已更新。',
    );
    if (ok) setManual((previous) => ({ ...previous, answer: '' }));
  };

  const removeObservation = async (observationId: string) => {
    if (!window.confirm('删除这条记录？')) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/benchmark/projects/${id}/observations/${observationId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('删除失败');
      await load(true);
      setNotice('记录已删除。');
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveQuestions = async () => {
    if (!draftQuestions) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/benchmark/projects/${id}/questions`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questions: draftQuestions }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? '保存失败');
      setDraftQuestions(null);
      await load(true);
      setNotice('问题集已保存。');
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <WorkbenchShell>
        <p className="text-[12px] text-white/50">{error || '加载中…'}</p>
        {error && (
          <a href="/benchmark/" className="mt-3 inline-block text-[12px] text-brand-300 hover:text-white">
            返回项目列表 →
          </a>
        )}
      </WorkbenchShell>
    );
  }

  const { project, runs, observations } = data;
  const questions = draftQuestions ?? project.questions;

  return (
    <WorkbenchShell>
      {/* 项目抬头 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl text-white">{project.name}</h2>
            {project.isDemo && (
              <span className="rounded border border-amber-300/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-amber-200">
                示例数据
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap gap-x-4 font-mono text-[10px] text-white/40">
            <span>品牌 {project.brand}</span>
            {project.site && <span>{project.site}</span>}
            <span>竞品 {project.competitors.join('、') || '未设置'}</span>
            <span>创建 {shortDate(project.createdAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/benchmark/projects/${project.id}/export?format=csv`}
            className="rounded border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-white/70 hover:border-brand-400 hover:text-white"
          >
            导出 CSV
          </a>
          <a
            href={`/api/benchmark/projects/${project.id}/export?format=md`}
            className="rounded border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-white/70 hover:border-brand-400 hover:text-white"
          >
            导出报告
          </a>
          <a href="/benchmark/" className="text-[11px] text-white/50 hover:text-white">
            全部项目
          </a>
        </div>
      </div>

      {project.isDemo && (
        <div className="mt-3">
          <Note tone="warn">
            这是示例数据：答案由固定文案生成，仅用于演示工作台与指标口径，不能作为任何效果结论，也不代表真实 AI 回答。
          </Note>
        </div>
      )}

      {(error || notice) && (
        <p className={`mt-3 text-[11px] ${error ? 'text-rose-300' : 'text-emerald-300'}`}>{error || notice}</p>
      )}

      {/* 指标 */}
      {metrics && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="记录数" value={metrics.total} />
          <Metric label="提及率" value={percent(metrics.mentionRate)} tone={metrics.mentionRate > 0.5 ? 'good' : 'warn'} />
          <Metric label="引用率" value={percent(metrics.citationRate)} tone={metrics.citationRate > 0.3 ? 'good' : 'warn'} />
          <Metric label="来源份额" value={percent(metrics.shareOfVoice)} />
          <Metric label="平均出现位置" value={metrics.averagePosition ?? '—'} unit={metrics.averagePosition ? '句' : ''} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="workbench-label">统计范围</span>
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          className="workbench-input !w-auto !py-1 !text-[11px]"
        >
          <option value="all">全部记录（{observations.length}）</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {run.label}（{observations.filter((observation) => observation.runId === run.id).length}）
            </option>
          ))}
        </select>
        <span className="ml-auto text-[10px] text-white/35">
          口径：提及率 = 提及品牌的答案数 / 记录数；引用率 = 引用含本站域名的记录数 / 记录数
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 左列：趋势 + 分层 + 引用来源 */}
        <div className="space-y-4">
          <Panel title="各次运行提及率" hint={`${runTrend.length} 次有数据`}>
            {runTrend.length === 0 ? (
              <p className="text-[11px] text-white/40">还没有记录。先创建一次运行。</p>
            ) : (
              <ul className="space-y-2.5">
                {runTrend.map((item) => (
                  <li key={item.run.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11px] text-white/70">
                        {item.run.label}
                        <span className="ml-2 font-mono text-[9px] text-white/30">{shortDate(item.run.startedAt)}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-white/50">
                        {percent(item.mentionRate)} · {item.total} 条
                      </span>
                    </div>
                    <div className="mt-1">
                      <Bar
                        value={item.mentionRate}
                        max={1}
                        tone={item.run.status === 'failed' ? 'muted' : 'brand'}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid gap-4 sm:grid-cols-2">
            <Panel title="按意图分层">
              {metrics && metrics.byIntent.length > 0 ? (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-white/35">
                      <th className="pb-1 font-normal">意图</th>
                      <th className="pb-1 text-right font-normal">记录</th>
                      <th className="pb-1 text-right font-normal">提及率</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/70">
                    {metrics.byIntent.map((row) => (
                      <tr key={row.intent} className="border-t border-white/5">
                        <td className="py-1.5">{row.intent}</td>
                        <td className="py-1.5 text-right font-mono">{row.total}</td>
                        <td className="py-1.5 text-right font-mono">{percent(row.mentionRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-[11px] text-white/40">暂无数据。</p>
              )}
            </Panel>

            <Panel title="引用来源分布" hint="取前 12">
              {metrics && metrics.citationDomains.length > 0 ? (
                <ul className="space-y-1.5">
                  {metrics.citationDomains.map((item) => (
                    <li key={item.domain} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-[10px] text-white/60">{item.domain}</span>
                      <span className="shrink-0 font-mono text-[10px] text-white/40">×{item.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-white/40">记录里没有出现链接。</p>
              )}
            </Panel>
          </div>

          {/* 记录表 */}
          <Panel title="记录" hint={`${scopedObservations.length} 条`}>
            {scopedObservations.length === 0 ? (
              <p className="text-[11px] text-white/40">当前范围没有记录。</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {scopedObservations.map((observation) => (
                  <li key={observation.id} className="py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === observation.id ? null : observation.id)}
                      className="flex w-full items-start gap-2 text-left"
                    >
                      <span
                        className={`mt-0.5 size-1.5 shrink-0 rounded-full ${
                          observation.brandMentioned ? 'bg-emerald-400' : 'bg-rose-400/60'
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-white/80">{observation.questionText}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[9px] text-white/35">
                          <span>{observation.brandMentioned ? '提及' : '未提及'}</span>
                          {observation.brandPosition && <span>第 {observation.brandPosition} 句</span>}
                          <span>{observation.citations.length} 个来源</span>
                          <span>{observation.mode === 'auto' ? '自动' : '手工'}</span>
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[9px] text-white/25">
                        {expanded === observation.id ? '−' : '+'}
                      </span>
                    </button>
                    {expanded === observation.id && (
                      <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
                        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-white/60">
                          {observation.answer}
                        </p>
                        {observation.citations.length > 0 && (
                          <ul className="space-y-0.5">
                            {observation.citations.map((citation) => (
                              <li key={citation}>
                                <a
                                  href={citation}
                                  target="_blank"
                                  rel="noopener noreferrer nofollow"
                                  className="break-all font-mono text-[10px] text-brand-300 hover:text-white"
                                >
                                  {citation}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button
                          type="button"
                          onClick={() => void removeObservation(observation.id)}
                          className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-rose-300/70 hover:border-rose-400/40 hover:text-rose-200"
                        >
                          删除记录
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* 右列：运行 + 录入 + 问题集 */}
        <div className="space-y-4">
          <Panel title="运行" hint={`${runs.length} 次`}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startRun('auto')}
                disabled={busy || !provider?.configured}
                title={provider?.configured ? '逐条调用模型并记录' : '未配置模型端点'}
                className="rounded border border-brand-400/40 bg-brand-400/10 px-2.5 py-1.5 text-[11px] text-brand-100 hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                自动运行
              </button>
              <button
                type="button"
                onClick={() => void startRun('manual')}
                disabled={busy}
                className="rounded border border-white/15 px-2.5 py-1.5 text-[11px] text-white/70 hover:border-white/30 disabled:opacity-40"
              >
                新建手工批次
              </button>
            </div>
            {!provider?.configured && (
              <p className="mt-2 text-[10px] leading-relaxed text-amber-200/70">
                未配置 GEO_LLM_API_KEY：自动运行不可用，但手工记录完全可用。
              </p>
            )}
            <ul className="mt-3 divide-y divide-white/5">
              {runs.map((run) => (
                <li key={run.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] text-white/75">{run.label}</span>
                    <span
                      className={`shrink-0 font-mono text-[9px] uppercase ${
                        run.status === 'completed'
                          ? 'text-emerald-300'
                          : run.status === 'failed'
                            ? 'text-rose-300'
                            : 'text-white/40'
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[9px] text-white/30">
                    <span>{shortDate(run.startedAt)}</span>
                    <span>{run.model}</span>
                    <span>{observations.filter((observation) => observation.runId === run.id).length} 条</span>
                  </p>
                  {run.note && <p className="mt-1 text-[10px] leading-relaxed text-white/35">{run.note}</p>}
                </li>
              ))}
              {runs.length === 0 && <li className="py-2 text-[11px] text-white/40">还没有运行记录。</li>}
            </ul>
          </Panel>

          <Panel title="手工录入答案" hint="从任意 AI 产品复制">
            <form onSubmit={submitObservation} className="space-y-2">
              <label className="block">
                <span className="workbench-label">批次</span>
                <select
                  value={manual.runId}
                  onChange={(event) => setManual({ ...manual, runId: event.target.value })}
                  className="workbench-input mt-1 !py-1 !text-[11px]"
                >
                  <option value="">选择批次…</option>
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="workbench-label">问题</span>
                <select
                  value={manual.questionId}
                  onChange={(event) => setManual({ ...manual, questionId: event.target.value })}
                  className="workbench-input mt-1 !py-1 !text-[11px]"
                >
                  <option value="">选择问题…</option>
                  {project.questions.map((question) => (
                    <option key={question.id} value={question.id}>
                      [{question.intent}] {question.text}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="workbench-label">答案全文（含来源链接）</span>
                <textarea
                  value={manual.answer}
                  onChange={(event) => setManual({ ...manual, answer: event.target.value })}
                  rows={6}
                  className="workbench-input mt-1 resize-y text-[11px] leading-relaxed"
                  placeholder="粘贴完整回答，包含末尾的来源列表。系统会自动识别品牌提及、位置与引用链接。"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded border border-brand-400/40 bg-brand-400/10 py-1.5 text-[11px] text-brand-100 hover:border-brand-400 disabled:opacity-50"
              >
                保存记录
              </button>
            </form>
          </Panel>

          <Panel title="问题集" hint={`${questions.length} 个`}>
            <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
              {questions.map((question, index) => (
                <div key={index} className="flex items-start gap-1.5">
                  <select
                    value={question.intent}
                    onChange={(event) => {
                      const next = [...questions];
                      next[index] = { ...question, intent: event.target.value as Intent };
                      setDraftQuestions(next);
                    }}
                    className="workbench-input !w-[74px] shrink-0 !px-1 !py-0.5 !text-[10px]"
                  >
                    {INTENTS.map((intent) => (
                      <option key={intent} value={intent}>
                        {intent}
                      </option>
                    ))}
                  </select>
                  <input
                    value={question.text}
                    onChange={(event) => {
                      const next = [...questions];
                      next[index] = { ...question, text: event.target.value };
                      setDraftQuestions(next);
                    }}
                    className="workbench-input !py-0.5 !text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={() => setDraftQuestions(questions.filter((_, position) => position !== index))}
                    className="mt-0.5 shrink-0 text-[10px] text-rose-300/60 hover:text-rose-200"
                    aria-label="删除问题"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setDraftQuestions([...questions, { text: '', intent: '认知' }])}
                className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/60 hover:text-white"
              >
                + 添加
              </button>
              <button
                type="button"
                onClick={() => void saveQuestions()}
                disabled={busy || !draftQuestions}
                className="rounded border border-brand-400/40 bg-brand-400/10 px-2 py-0.5 text-[10px] text-brand-100 disabled:opacity-40"
              >
                保存问题集
              </button>
              {draftQuestions && (
                <button
                  type="button"
                  onClick={() => setDraftQuestions(null)}
                  className="text-[10px] text-white/40 hover:text-white"
                >
                  取消
                </button>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <Note tone="warn">
          指标只描述“这一次记录”：生成式答案每次都可能不同。要得到可比较的结论，需要固定问题集、同一模型版本、重复观测，
          并同时记录时间与时区。单次运行的高提及率不代表稳定优势。
        </Note>
      </div>
    </WorkbenchShell>
  );
}
