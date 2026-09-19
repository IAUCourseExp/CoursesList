// Small shared building blocks: toast, loading skeleton, empty state, chips, switch.

import { useEffect, useState } from 'react';
import { CloseIcon, SearchIcon } from './icons.jsx';

/* ── Toast ───────────────────────────────────────────────────────────────────── */
export function Toast({ message, onDone, duration = 3200 }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [message, duration, onDone]);

  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] mx-auto flex w-fit max-w-[min(92vw,32rem)] items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-900/95 px-4 py-3 text-white shadow-2xl shadow-slate-900/30 backdrop-blur-md animate-toast-in"
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-xs text-emerald-300">✓</span>
      <span className="text-[13px] font-medium leading-relaxed">{message}</span>
    </div>
  );
}

/* ── Chips ───────────────────────────────────────────────────────────────────── */
export function Chip({ active, onClick, children, className = '', title, tone = 'blue' }) {
  const tones = {
    blue: active ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/30'
      : 'bg-blue-50/80 text-blue-700 border-blue-200/80 hover:bg-blue-100 hover:border-blue-300',
    slate: active ? 'bg-slate-800 text-white border-slate-800'
      : 'bg-slate-100/80 text-slate-700 border-slate-200/80 hover:bg-slate-200',
    amber: active ? 'bg-amber-500 text-white border-amber-500'
      : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  };
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Removable chip representing one active filter. */
export function FilterChip({ label, value, count, onRemove }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50/90 ps-3 pe-1 text-[12px] font-bold text-blue-800">
      <span className="text-blue-500">{label}:</span>
      <span className="max-w-[9rem] truncate">{value}</span>
      {count > 1 && <span className="text-[11px] text-blue-500">+{count - 1}</span>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`حذف فیلتر ${label}`}
        className="grid size-7 place-items-center rounded-full text-blue-500 transition-colors hover:bg-blue-200/70 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </span>
  );
}

/* ── Loading skeleton ────────────────────────────────────────────────────────── */
const Bar = ({ w = '100%', h = 12 }) => (
  <span className="block rounded-full bg-slate-200/80 skeleton-shimmer" style={{ width: w, height: h }} />
);

export function SkeletonRows({ isMobile, rows = 10 }) {
  if (isMobile) {
    return (
      <div className="space-y-3 p-2" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2"><Bar w="70%" h={14} /><Bar w="40%" h={10} /></div>
              <Bar w="44px" h={44} />
            </div>
            <div className="mb-3 space-y-2 rounded-xl bg-slate-50 p-3"><Bar w="55%" /><Bar w="45%" /></div>
            <div className="grid grid-cols-2 gap-3"><Bar /><Bar /><Bar /><Bar /></div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="p-3" aria-hidden="true">
      <div className="mb-3 flex gap-3">{Array.from({ length: 7 }).map((_, i) => <Bar key={i} w="14%" h={16} />)}</div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 border-b border-slate-100 py-3">
          {Array.from({ length: 7 }).map((_, c) => <Bar key={c} w={`${10 + ((r + c) % 5) * 4}%`} h={11} />)}
        </div>
      ))}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────────── */
export function EmptyState({ icon = <SearchIcon className="size-7" />, title, hint, actions }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">{icon}</span>
        <p className="text-[15px] font-extrabold text-slate-700">{title}</p>
        {hint && <p className="text-[12.5px] leading-relaxed text-slate-500">{hint}</p>}
        {actions && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ── Segmented control (density / view switch) ───────────────────────────────── */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-0.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={`inline-flex min-h-8 items-center gap-1 rounded-[10px] px-2.5 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
              active ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {o.icon}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Progress bar for capacity ───────────────────────────────────────────────── */
export function CapacityBar({ pct, tone }) {
  const tones = {
    low: 'bg-emerald-500', mid: 'bg-sky-500', high: 'bg-amber-500', full: 'bg-rose-500', none: 'bg-slate-300',
  };
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-200/90" aria-hidden="true">
      <span
        className={`block h-full rounded-full transition-[width] duration-500 ${tones[tone] || tones.none}`}
        style={{ width: pct === null ? '0%' : `${pct}%` }}
      />
    </span>
  );
}

/* ── Collapsible section ─────────────────────────────────────────────────────── */
export function Section({ title, icon, children, defaultOpen = false, meta }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-start transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:bg-slate-50"
      >
        <span className="text-slate-400">{icon}</span>
        <span className="flex-1 text-[13.5px] font-extrabold text-slate-800">{title}</span>
        {meta && <span className="text-[11.5px] font-bold text-slate-400">{meta}</span>}
        <span className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}
