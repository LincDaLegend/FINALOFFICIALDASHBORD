'use client';

// Shared pieces for the business dashboard: glass stat cards, a form sheet, fields.
import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, ArrowDownRight, X } from 'lucide-react';
import { pct } from './bizData.js';

/** A glass stat card: label, big value, optional change vs the previous period and a footnote. */
export function GlassStat({ label, value, sub, change, icon: Icon, tint = '#0A84FF', invert = false }) {
  const reduce = useReducedMotion();
  const up = change != null && change >= 0;
  const good = change == null ? null : invert ? !up : up;
  return (
    <motion.div whileHover={reduce ? undefined : { y: -3 }} transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
      className="glass-card rounded-[20px] p-4 sm:p-5 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-footnote font-medium text-label-2">{label}</p>
        {Icon && (
          <span className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white shrink-0"
            style={{ background: `linear-gradient(145deg, ${tint}, ${tint}B3)` }} aria-hidden>
            <Icon className="w-[17px] h-[17px]" strokeWidth={2.2} />
          </span>
        )}
      </div>
      <p className="text-[26px] sm:text-[28px] font-bold tracking-[-0.02em] tabular leading-tight mt-1 truncate">{value}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 min-h-[20px]">
        {change != null && (
          <span className={`inline-flex items-center gap-0.5 text-footnote font-semibold tabular ${good ? 'text-green-ink' : 'text-red-ink'}`}>
            {up ? <ArrowUpRight className="w-4 h-4" aria-hidden /> : <ArrowDownRight className="w-4 h-4" aria-hidden />}
            {pct(Math.abs(change))}<span className="sr-only">{up ? ' up' : ' down'}</span>
          </span>
        )}
        {sub && <span className="text-footnote text-label-2 truncate">{sub}</span>}
      </div>
    </motion.div>
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

export const inputCls = 'w-full h-11 px-3 rounded-[11px] bg-fill text-callout outline-none focus:ring-2 focus:ring-tint placeholder:text-label-3';

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="block text-footnote font-medium text-label-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

/** Small pill-shaped select used for filters. */
export function FilterSelect({ value, onChange, label, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
      className="h-9 pl-3 pr-1 rounded-full bg-fill text-subhead font-medium text-label outline-none focus:ring-2 focus:ring-tint cursor-pointer">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
