import type { ReactNode } from 'react';

/**
 * 工作台通用 UI。深色数据区，与主站白底研究门户形成对比，
 * 但共享同一套 token，避免出现第二套设计语言。
 */

export function WorkbenchShell({ children }: { children: ReactNode }) {
  return <div className="workbench rounded-2xl p-4 sm:p-6">{children}</div>;
}

export function Panel({
  title,
  hint,
  children,
  className = '',
}: {
  title?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`workbench-panel p-4 sm:p-5 ${className}`}>
      {title && (
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="workbench-label">{title}</h2>
          {hint && <span className="text-[10px] text-white/40">{hint}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Metric({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'bad'
          ? 'text-rose-300'
          : 'text-white';
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="workbench-label">{label}</p>
      <p className={`mt-1 font-display text-xl leading-none ${toneClass}`}>
        {value}
        {unit && <span className="ml-1 font-sans text-[10px] text-white/40">{unit}</span>}
      </p>
    </div>
  );
}

export function Bar({
  value,
  max = 1,
  tone = 'brand',
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'accent' | 'muted';
}) {
  const pct = Math.max(2, Math.min(100, (value / (max || 1)) * 100));
  const color =
    tone === 'accent' ? 'bg-accent-500' : tone === 'muted' ? 'bg-white/25' : 'bg-brand-400';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' }) {
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
        tone === 'warn'
          ? 'border-amber-400/25 bg-amber-400/10 text-amber-100/80'
          : 'border-white/10 bg-white/[0.03] text-white/55'
      }`}
    >
      {children}
    </p>
  );
}

export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
      }}
      className="rounded-md border border-white/15 px-2.5 py-1 font-mono text-[10px] tracking-wide text-white/70 uppercase transition-colors hover:border-brand-400 hover:text-white"
    >
      {label}
    </button>
  );
}
