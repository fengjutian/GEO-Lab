import { useEffect, useState } from 'react';
import type { ProviderInfo } from '@/lib/benchmark/types';
import { Note, Panel, WorkbenchShell } from '@/features/shared/ui';

type ProjectSummary = {
  id: string;
  name: string;
  brand: string;
  site: string;
  isDemo: boolean;
  createdAt: string;
  questionCount: number;
  runCount: number;
  lastRunAt: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}

export default function BenchmarkDashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', brand: '', site: '', competitors: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [listResponse, providerResponse] = await Promise.all([
        fetch('/api/benchmark/projects'),
        fetch('/api/benchmark/provider'),
      ]);
      const list = (await listResponse.json()) as { projects: ProjectSummary[] };
      const providerPayload = (await providerResponse.json()) as { provider: ProviderInfo };
      setProjects(list.projects ?? []);
      setProvider(providerPayload.provider ?? null);
    } catch (loadError) {
      setError(`加载失败：${(loadError as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim() || !form.brand.trim()) {
      setError('项目名称与品牌名必填');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/benchmark/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          brand: form.brand,
          site: form.site,
          competitors: form.competitors.split(/[,，、\n]/).map((value) => value.trim()).filter(Boolean),
        }),
      });
      const payload = (await response.json()) as { project?: { id: string }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? '创建失败');
      window.location.href = `/benchmark/${payload.project!.id}/`;
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createDemo = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/benchmark/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ demo: true }),
      });
      const payload = (await response.json()) as { project?: { id: string }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? '创建示例失败');
      window.location.href = `/benchmark/${payload.project!.id}/`;
    } catch (demoError) {
      setError((demoError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeProject = async (id: string, name: string) => {
    if (!window.confirm(`删除项目「${name}」及其全部记录？该操作不可恢复。`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/benchmark/projects/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('删除失败');
      await load();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkbenchShell>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
        <Panel title="项目" hint={loading ? '加载中…' : `${projects.length} 个`}>
          {projects.length === 0 && !loading ? (
            <div className="rounded-lg border border-dashed border-white/15 px-4 py-8 text-center">
              <p className="text-[13px] text-white/70">还没有项目。</p>
              <p className="mt-1 text-[11px] text-white/40">
                在右侧创建，或先创建一个示例项目看数据长什么样。
              </p>
              <button
                type="button"
                onClick={() => void createDemo()}
                disabled={busy}
                className="mt-4 rounded-full border border-white/20 px-3 py-1.5 text-[11px] text-white/70 hover:border-brand-400 hover:text-white disabled:opacity-50"
              >
                创建示例项目
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-white/10">
              {projects.map((project) => (
                <li key={project.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/benchmark/${project.id}/`}
                      className="flex flex-wrap items-baseline gap-2 text-[13px] text-white hover:text-brand-200"
                    >
                      {project.name}
                      {project.isDemo && (
                        <span className="rounded border border-amber-300/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-amber-200">
                          示例
                        </span>
                      )}
                    </a>
                    <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-[10px] text-white/40">
                      <span>{project.brand}</span>
                      {project.site && <span>{project.site}</span>}
                      <span>{project.questionCount} 问</span>
                      <span>{project.runCount} 次运行</span>
                      <span>更新 {formatDate(project.lastRunAt ?? project.createdAt)}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeProject(project.id, project.name)}
                    disabled={busy}
                    className="rounded border border-white/10 px-2 py-1 text-[10px] text-rose-300/70 hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-50"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-3 text-[11px] text-rose-300">{error}</p>}
        </Panel>

        <Panel title="模型端点状态">
          {provider ? (
            <>
              <p className={`text-[12px] ${provider.configured ? 'text-emerald-300' : 'text-amber-300'}`}>
                {provider.configured ? `已配置 · ${provider.model}` : '未配置'}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/50">{provider.hint}</p>
            </>
          ) : (
            <p className="text-[11px] text-white/40">读取中…</p>
          )}
          <div className="mt-3">
            <Note>
              未配置模型时仍可工作：创建「手工记录」运行，把你在 ChatGPT / Perplexity 等产品里看到的答案粘贴进来，
              指标会按同一口径计算。
            </Note>
          </div>
        </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="新建项目">
            <form onSubmit={createProject} className="space-y-3">
              <label className="block">
                <span className="workbench-label">项目名称 *</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="workbench-input mt-1 text-[12px]"
                  placeholder="例如：品牌 AI 可见性基线"
                />
              </label>
              <label className="block">
                <span className="workbench-label">品牌名 *</span>
                <input
                  value={form.brand}
                  onChange={(event) => setForm({ ...form, brand: event.target.value })}
                  className="workbench-input mt-1 text-[12px]"
                  placeholder="用于判断答案是否提及"
                />
              </label>
              <label className="block">
                <span className="workbench-label">站点</span>
                <input
                  value={form.site}
                  onChange={(event) => setForm({ ...form, site: event.target.value })}
                  className="workbench-input mt-1 text-[12px]"
                  placeholder="https://example.com"
                />
              </label>
              <label className="block">
                <span className="workbench-label">竞品（逗号分隔）</span>
                <input
                  value={form.competitors}
                  onChange={(event) => setForm({ ...form, competitors: event.target.value })}
                  className="workbench-input mt-1 text-[12px]"
                  placeholder="竞品 A, 竞品 B"
                />
              </label>
              <button type="submit" disabled={busy} className="btn btn-accent w-full !py-2 !text-xs disabled:opacity-50">
                {busy ? '创建中…' : '创建项目并生成 20 个问题'}
              </button>
              <button
                type="button"
                onClick={() => void createDemo()}
                disabled={busy}
                className="w-full rounded-lg border border-dashed border-white/20 py-1.5 text-[11px] text-white/50 hover:border-brand-400 hover:text-white disabled:opacity-40"
              >
                或创建示例项目（演示数据）
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </WorkbenchShell>
  );
}
