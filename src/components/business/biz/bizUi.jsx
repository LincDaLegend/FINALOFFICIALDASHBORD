'use client';

// Shared pieces for the business dashboard: stat cards, a form sheet, fields.
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { pct } from './bizData.js';

/** A stat: label, figure, and its change with what it compares to. Numbers only. */
export function Stat({ label, value, sub, change, vs, invert = false, children, className = '' }) {
  const up = change != null && change >= 0;
  const good = change == null ? null : invert ? !up : up;
  return (
    <div className={`biz-card rounded-2xl p-5 min-w-0 ${className}`}>
      <p className="text-footnote text-label-2">{label}</p>
      <p className="text-[28px] font-medium tabular leading-none mt-2 truncate">{value}</p>
      <p className="text-footnote text-label-2 tabular mt-2 truncate min-h-[18px]">
        {change != null && (
          <span className={`font-medium ${good ? 'text-green-ink' : 'text-red-ink'}`}>{up ? '+' : '−'}{pct(Math.abs(change))}</span>
        )}
        {change != null && vs ? ` ${vs}` : ''}
        {change != null && sub ? ' · ' : ''}{sub}
      </p>
      {children}
    </div>
  );
}

/** Modal form sheet: bottom sheet on phones, centred card on larger screens. */
export function Sheet({ open, title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-label={title} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="biz-sheet backdrop:bg-[var(--scrim)] p-0 m-0 top-auto bottom-0 sm:top-0 sm:m-auto w-full max-w-full sm:w-[min(520px,calc(100vw-48px))]
        max-h-[92dvh] sm:max-h-[min(820px,calc(100dvh-48px))] rounded-t-[20px] sm:rounded-[20px] bg-surface text-label shadow-[var(--shadow-lg)] overflow-hidden">
      {open && (
        <div className="flex flex-col max-h-[inherit]">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 shrink-0">
            <h2 className="text-title-2">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close"
              className="w-8 h-8 rounded-full bg-fill flex items-center justify-center text-label-2 pressable"><X className="w-4 h-4" strokeWidth={2.5} aria-hidden /></button>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))]">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export const inputCls = 'w-full h-11 px-3 rounded-[10px] bg-fill text-callout outline-none focus:ring-2 focus:ring-tint placeholder:text-label-3';

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="block text-footnote text-label-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

/** Small pill-shaped select used for filters. */
export function FilterSelect({ value, onChange, label, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
      className="h-9 pl-3 pr-1 rounded-[10px] biz-card text-subhead font-medium text-label outline-none focus:ring-2 focus:ring-tint cursor-pointer">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
