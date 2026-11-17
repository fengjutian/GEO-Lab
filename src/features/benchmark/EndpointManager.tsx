import { useEffect, useState } from 'react';
import type { EndpointStatus } from '@/lib/benchmark/types';
import { Note, Panel } from '@/features/shared/ui';

type Draft = {
  name: string;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  extraBody: string;
};

const EMPTY: Draft = {
  name: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyEnv: 'OPENAI_API_KEY',
  extraBody: '',
};

/**
 * 端点配置界面。密钥只填「环境变量名」，服务端从 process.env 读取；
 * 数据库不保存密钥，因此这里的输入永远不会是秘密本身。
 */
export default function EndpointManager({ compact = false }: { compact?: boolean }) {
  const [endpoints, setEndpoints] = useState<EndpointStatus[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      const response = await fetch('/api/benchmark/endpoints');
      const payload = (await response.json()) as { endpoints: EndpointStatus[] };
      setEndpoints(payload.endpoints ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let extraBody: Record<string, unknown> | undefined;
      if (draft.extraBody.trim()) {
        try {
          extraBody = JSON.parse(draft.extraBody) as Record<string, unknown>;
        } catch {
          throw new Error('额外请求体不是合法 JSON');
        }
      }
      const response = await fetch('/api/benchmark/endpoints', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          baseUrl: draft.baseUrl,
          model: draft.model,
          apiKeyEnv: draft.apiKeyEnv,
          extraBody,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? '创建失败');
      setDraft(EMPTY);
      setOpen(false);
      setNotice('端点已添加。设置对应环境变量并重启服务后即可运行。');
      await load();
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (endpoint: EndpointStatus) => {
    setBusy(true);
    try {
      await fetch(`/api/benchmark/endpoints/${endpoint.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !endpoint.enabled }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (endpoint: EndpointStatus) => {
    if (!window.confirm(`删除端点「${endpoint.name}」？已产生的运行记录会保留。`)) return;
    setBusy(true);
    try {
      await fetch(`/api/benchmark/endpoints/${endpoint.id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="模型端点" hint={`${endpoints.length} 个`}>
      {endpoints.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-white/45">
          还没有配置端点。添加后可以在项目里选择多个端点并行对比；不添加也能用默认端点（GEO_LLM_* 环境变量）或手工记录。
        </p>
      ) : (
        <ul className="divide-y divide-white/10">
          {endpoints.map((endpoint) => (
            <li key={endpoint.id} className="py-2">
              <div className="flex items-center gap-2">
                <span className={`size-1.5 shrink-0 rounded-full ${endpoint.configured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-white/85">{endpoint.name}</span>
                <button
                  type="button"
                  onClick={() => void toggle(endpoint)}
                  disabled={busy}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                    endpoint.enabled
                      ? 'border-white/15 text-white/50 hover:text-white'
                      : 'border-amber-300/30 text-amber-200/80'
                  }`}
                >
                  {endpoint.enabled ? '停用' : '已停用'}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(endpoint)}
                  disabled={busy}
                  className="text-[10px] text-rose-300/60 hover:text-rose-200"
                >
                  删除
                </button>
              </div>
              <p className="mt-1 pl-3.5 font-mono text-[9px] text-white/35">
                {endpoint.model} · {endpoint.baseUrl}
                {endpoint.apiKeyEnv ? ` · ${endpoint.apiKeyEnv}` : ' · 无鉴权'}
              </p>
              {!endpoint.configured && (
                <p className="mt-0.5 pl-3.5 text-[10px] leading-relaxed text-amber-200/70">{endpoint.hint}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!compact && (
        <div className="mt-3">
          {open ? (
            <form onSubmit={create} className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
              <label className="block">
                <span className="workbench-label">名称 *</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  className="workbench-input mt-1 !py-1 !text-[11px]"
                  placeholder="例如：Perplexity Sonar"
                />
              </label>
              <label className="block">
                <span className="workbench-label">Base URL *</span>
                <input
                  value={draft.baseUrl}
                  onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                  className="workbench-input mt-1 !py-1 !text-[11px]"
                />
              </label>
              <label className="block">
                <span className="workbench-label">模型 *</span>
                <input
                  value={draft.model}
                  onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                  className="workbench-input mt-1 !py-1 !text-[11px]"
                  placeholder="sonar-pro / gpt-4o-mini / 自建模型名"
                />
              </label>
              <label className="block">
                <span className="workbench-label">密钥环境变量名</span>
                <input
                  value={draft.apiKeyEnv}
                  onChange={(event) => setDraft({ ...draft, apiKeyEnv: event.target.value })}
                  className="workbench-input mt-1 !py-1 !text-[11px]"
                  placeholder="留空表示无需鉴权"
                />
              </label>
              <label className="block">
                <span className="workbench-label">额外请求体（JSON，可选）</span>
                <textarea
                  value={draft.extraBody}
                  onChange={(event) => setDraft({ ...draft, extraBody: event.target.value })}
                  rows={2}
                  className="workbench-input mt-1 resize-y !py-1 font-mono !text-[10px]"
                  placeholder='{"search_recency_filter":"week"}'
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded border border-brand-400/40 bg-brand-400/10 py-1.5 text-[11px] text-brand-100 disabled:opacity-50"
                >
                  保存端点
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded border border-white/15 px-2.5 py-1.5 text-[11px] text-white/60 hover:text-white"
                >
                  取消
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="w-full rounded-lg border border-dashed border-white/20 py-1.5 text-[11px] text-white/55 hover:border-brand-400 hover:text-white"
            >
              + 添加端点
            </button>
          )}
        </div>
      )}

      {(error || notice) && (
        <p className={`mt-2 text-[10px] leading-relaxed ${error ? 'text-rose-300' : 'text-emerald-300'}`}>
          {error || notice}
        </p>
      )}

      <div className="mt-3">
        <Note>
          端点只保存环境变量名，不保存密钥。不同模型（尤其带检索的搜索 API）答案差异很大，
          并行对比的意义是看分歧，而不是选出一个“正确答案”。
        </Note>
      </div>
    </Panel>
  );
}
