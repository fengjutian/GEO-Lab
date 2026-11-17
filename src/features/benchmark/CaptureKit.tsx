import { useEffect, useMemo, useState } from 'react';
import { Note, Panel } from '@/features/shared/ui';

type ProjectSummary = { id: string; name: string; brand: string; questionCount: number };

/**
 * 书签小工具生成器。
 *
 * 关键约束：
 * - 书签运行在第三方页面上，无法读取本站的 localStorage，所以 token 必须写进书签代码。
 * - 因此 token 输入框只保存在本机 localStorage，不写入页面 HTML 或数据库。
 * - 答案文本没有可靠的问题 id，先请求候选问题，再由用户确认，避免把记录挂错问题。
 */
function buildBookmarklet(input: {
  api: string;
  token: string;
  projectId: string;
  projectName: string;
  endpointLabel: string;
}): string {
  const { api, token, projectId, projectName, endpointLabel } = input;

  const code = `(function(){
  var API=${JSON.stringify(api)},TOKEN=${JSON.stringify(token)},PID=${JSON.stringify(projectId)},PNAME=${JSON.stringify(projectName)},LABEL=${JSON.stringify(endpointLabel)};
  var sel=(window.getSelection?String(window.getSelection()):'').trim();
  var pick=['[data-message-author-role="assistant"]','article','.prose','main'];
  var text=sel;
  if(!text){for(var i=0;i<pick.length;i++){var nodes=document.querySelectorAll(pick[i]);if(nodes.length){var last=nodes[nodes.length-1];text=(last.innerText||'').trim();if(text.length>80)break;}}}
  if(!text){text=(document.body.innerText||'').trim().slice(0,6000);}
  if(text.length<20){alert('没有读到答案文本：先选中答案再点书签。');return;}
  function post(path,body){return fetch(API+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j;});});}
  post('/api/benchmark/capture/match',{token:TOKEN,projectId:PID,answer:text}).then(function(res){
    var list=res.candidates||[];
    if(!list.length){alert('没有匹配到问题：该项目还没有问题集。');return;}
    var chosen=list[0];
    if(list.length>1&&list[0].score<0.6){
      var lines=list.map(function(c,i){return (i+1)+'. '+c.text+'（匹配度 '+(c.score*100).toFixed(0)+'%）';});
      var input=window.prompt('提交到「'+PNAME+'」的哪个问题？输入编号（默认 1）：\\n\\n'+lines.join('\\n'),'1');
      if(input===null)return;
      var index=parseInt(input,10);
      if(isNaN(index)||index<1||index>list.length){alert('编号无效，已取消。');return;}
      chosen=list[index-1];
    } else if(!window.confirm('提交到「'+PNAME+'」：'+chosen.text+' ？')) {
      return;
    }
    post('/api/benchmark/capture/commit',{token:TOKEN,projectId:PID,questionId:chosen.questionId,answer:text,endpointLabel:LABEL,sourceUrl:location.href}).then(function(done){
      alert('已记录到 GEO Lab\\n问题：'+done.question.text+'\\n品牌提及：'+(done.brandMentioned?'是':'否')+'\\n引用链接：'+done.citationCount+' 条');
    }).catch(function(e){alert('提交失败：'+e.message);});
  }).catch(function(e){alert('连接失败：'+e.message+'\\n请确认服务地址与采集 token。');});
})();`;

  return `javascript:${encodeURIComponent(code)}`;
}

export default function CaptureKit() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [captureEnabled, setCaptureEnabled] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [projectId, setProjectId] = useState('');
  const [endpointLabel, setEndpointLabel] = useState('ChatGPT');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    setToken(window.localStorage.getItem('geo-capture-token') ?? '');
    setEndpointLabel(window.localStorage.getItem('geo-capture-endpoint') ?? 'ChatGPT');
    void (async () => {
      try {
        const [projectResponse, endpointResponse] = await Promise.all([
          fetch('/api/benchmark/projects'),
          fetch('/api/benchmark/endpoints'),
        ]);
        const projectPayload = (await projectResponse.json()) as { projects: ProjectSummary[] };
        const endpointPayload = (await endpointResponse.json()) as { captureEnabled: boolean };
        setProjects(projectPayload.projects ?? []);
        setCaptureEnabled(endpointPayload.captureEnabled ?? false);
        if ((projectPayload.projects ?? []).length > 0) setProjectId(projectPayload.projects[0].id);
      } catch {
        setCaptureEnabled(false);
      }
    })();
  }, []);

  const project = projects.find((item) => item.id === projectId);

  const bookmarklet = useMemo(() => {
    if (!token.trim() || !project) return '';
    return buildBookmarklet({
      api: typeof window === 'undefined' ? '' : window.location.origin,
      token: token.trim(),
      projectId: project.id,
      projectName: project.name,
      endpointLabel: endpointLabel.trim() || '未标注',
    });
  }, [token, project, endpointLabel]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title="生成书签" hint="拖到书签栏即可使用">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="workbench-label">采集 token *</span>
            <input
              type="password"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                window.localStorage.setItem('geo-capture-token', event.target.value);
              }}
              className="workbench-input mt-1 !text-[12px]"
              placeholder="与服务端 GEO_BENCHMARK_CAPTURE_TOKEN 一致"
              autoComplete="off"
            />
          </label>

          <label className="block">
            <span className="workbench-label">项目 *</span>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="workbench-input mt-1 !text-[12px]"
            >
              {projects.length === 0 && <option value="">先创建一个项目</option>}
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}（{item.questionCount} 问）
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="workbench-label">来源标注</span>
            <input
              value={endpointLabel}
              onChange={(event) => {
                setEndpointLabel(event.target.value);
                window.localStorage.setItem('geo-capture-endpoint', event.target.value);
              }}
              className="workbench-input mt-1 !text-[12px]"
              placeholder="ChatGPT / Perplexity / 豆包…"
            />
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
          {captureEnabled === false && (
            <p className="mb-2 text-[11px] leading-relaxed text-amber-200/80">
              服务端未启用采集：需要设置环境变量 GEO_BENCHMARK_CAPTURE_TOKEN 后重启。
            </p>
          )}
          {bookmarklet ? (
            <>
              <a
                href={bookmarklet}
                onClick={(event) => {
                  // 拖拽用；直接点击会尝试在当前页执行，可能被 CSP 拦住
                  if (!window.confirm('这是书签链接：把按钮拖到书签栏后使用。要现在尝试在本地执行吗？')) {
                    event.preventDefault();
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-400/50 bg-brand-400/15 px-4 py-2 text-[12px] font-medium text-brand-50 hover:border-brand-300"
                draggable
              >
                <span aria-hidden="true">▲</span> 采集到 GEO Lab
              </a>
              <p className="mt-2 text-[10px] leading-relaxed text-white/40">
                把上面的按钮拖到浏览器书签栏。之后在 AI 产品页面选中答案（或不选中，脚本会取最后一条回复），点一下书签就能提交。
              </p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(bookmarklet);
                  setCopied('已复制书签链接');
                }}
                className="mt-2 rounded border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white/60 hover:text-white"
              >
                复制书签链接
              </button>
              {copied && <span className="ml-2 text-[10px] text-emerald-300">{copied}</span>}
            </>
          ) : (
            <p className="text-[11px] text-white/40">填写 token 并选择项目后生成书签。</p>
          )}
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="为什么不自动抓取">
          <p className="text-[11px] leading-relaxed text-white/55">
            不同 AI 产品的 DOM 结构不同，也没有开放接口把“某次回答”映射到你的问题集。
            书签用三层回退读取文本：选中内容 → 常见答案容器 → 页面正文；问题则用词面匹配给出候选，由你确认。
          </p>
        </Panel>

        <Panel title="服务端配置">
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[10px] leading-relaxed text-white/70">GEO_BENCHMARK_CAPTURE_TOKEN=...

# 数据库位置（可选）
GEO_BENCHMARK_DB=data/benchmark.db</pre>
          <p className="mt-2 text-[10px] leading-relaxed text-white/40">
            token 只存在书签与你的浏览器本地；服务端只做等值比较。换 token 后需要重新生成书签。
          </p>
        </Panel>

        <Panel title="记录会存到哪里">
          <ul className="space-y-1.5 text-[11px] leading-relaxed text-white/55">
            <li>· 进入「浏览器采集 · {'<来源>'} · {'<日期>'}」运行</li>
            <li>· 与手工记录同一套指标口径</li>
            <li>· 保留原始答案与来源链接，可随时删除</li>
            <li>· 同一天同来源复用同一个运行，不会刷出大量批次</li>
          </ul>
        </Panel>

        <Note tone="warn">
          采集的是你手动点击时的页面文本，不保证是完整答案。粘贴模式仍是最终校准手段。
        </Note>
      </div>
    </div>
  );
}
