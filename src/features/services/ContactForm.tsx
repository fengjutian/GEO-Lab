import { useState } from 'react';
import { Note } from '@/features/shared/ui';

type Field = 'name' | 'email' | 'company' | 'site' | 'need' | 'message';

const NEEDS = [
  'GEO 技术诊断',
  '网站结构优化',
  '内容可理解性改造',
  'AI 可见性监测方案',
  '团队培训 / 内部分享',
  '其它',
];

const EMAIL = 'research@geolab.dev';

export default function ContactForm() {
  const [values, setValues] = useState<Record<Field, string>>({
    name: '',
    email: '',
    company: '',
    site: '',
    need: NEEDS[0],
    message: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [sent, setSent] = useState(false);

  const update = (field: Field, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const validate = () => {
    const next: Partial<Record<Field, string>> = {};
    if (!values.name.trim()) next.name = '请填写称呼';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) next.email = '请填写有效的邮箱';
    if (!values.message.trim() || values.message.trim().length < 20) next.message = '请至少描述 20 个字的需求背景';
    if (values.site && !/^https?:\/\/[^\s]+\.[^\s]+/.test(values.site)) next.site = '请填写完整网址（含 https://）';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const subject = `[GEO Lab] ${values.need} - ${values.company || values.name}`;
  const body = [
    `称呼：${values.name}`,
    `邮箱：${values.email}`,
    values.company ? `公司：${values.company}` : '',
    values.site ? `网站：${values.site}` : '',
    `需求类型：${values.need}`,
    '',
    '背景描述：',
    values.message,
  ]
    .filter(Boolean)
    .join('\n');

  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;
    setSent(true);
    window.location.href = mailto;
  };

  const inputClass = (field: Field) =>
    `mt-1.5 w-full rounded-lg border px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-brand-400 ${
      errors[field] ? 'border-rose-300 bg-rose-50/40' : 'border-line bg-canvas'
    }`;

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-canvas p-6 shadow-[var(--shadow-card)] sm:p-8" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">称呼 *</span>
          <input
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            className={inputClass('name')}
            placeholder="怎么称呼你"
            autoComplete="name"
          />
          {errors.name && <span className="mt-1 block text-[11px] text-rose-600">{errors.name}</span>}
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">邮箱 *</span>
          <input
            type="email"
            value={values.email}
            onChange={(event) => update('email', event.target.value)}
            className={inputClass('email')}
            placeholder="you@company.com"
            autoComplete="email"
          />
          {errors.email && <span className="mt-1 block text-[11px] text-rose-600">{errors.email}</span>}
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">公司 / 团队</span>
          <input
            value={values.company}
            onChange={(event) => update('company', event.target.value)}
            className={inputClass('company')}
            placeholder="可选"
            autoComplete="organization"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">网站</span>
          <input
            value={values.site}
            onChange={(event) => update('site', event.target.value)}
            className={inputClass('site')}
            placeholder="https://example.com"
          />
          {errors.site && <span className="mt-1 block text-[11px] text-rose-600">{errors.site}</span>}
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">需求类型</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {NEEDS.map((need) => (
            <label
              key={need}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                values.need === need
                  ? 'border-brand-400 bg-brand-50 text-brand-800'
                  : 'border-line text-ink-soft hover:border-brand-200'
              }`}
            >
              <input
                type="radio"
                name="need"
                value={need}
                checked={values.need === need}
                onChange={() => update('need', need)}
                className="sr-only"
              />
              {need}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-5 block">
        <span className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">背景描述 *</span>
        <textarea
          value={values.message}
          onChange={(event) => update('message', event.target.value)}
          rows={4}
          className={`${inputClass('message')} resize-y`}
          placeholder="站点类型、当前遇到的问题、希望验证的假设…"
        />
        {errors.message && <span className="mt-1 block text-[11px] text-rose-600">{errors.message}</span>}
      </label>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary">生成邮件并发送</button>
        <a href={`mailto:${EMAIL}`} className="text-xs text-muted link-underline">
          或直接写邮件到 {EMAIL}
        </a>
      </div>

      {sent && (
        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[12px] leading-relaxed text-brand-900">
          已生成邮件草稿。如果你的系统没有自动打开邮件客户端，请手动复制上面的信息发送到 {EMAIL}。
          我们通常在工作日 2 个工作日内回复。
        </div>
      )}

      <div className="mt-4">
        <Note>
          本站没有后端表单服务：点击提交会在你的本机生成一封邮件，不会把内容上传到任何服务器。
          这也意味着我们无法确认你是否真的发送了 ——— 如果没有打开邮件客户端，请手动发送。
        </Note>
      </div>
    </form>
  );
}
