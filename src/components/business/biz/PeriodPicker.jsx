'use client';

// One compact control for the period: ‹ October 2026 ▾ ›. The arrows step a month or year; the label opens
// a picker with Month / Year / All time and a grid to jump straight to any month or year.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { Segmented } from '../ui.jsx';
import { PERIOD_MODES, currentPeriod, periodLabel, shiftPeriod, isCurrent, isAfterNow } from './bizData.js';

const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString('en-PH', { month: 'short' }));
const arrowCls = 'w-9 h-9 flex items-center justify-center text-label-2 hover:text-label transition-colors disabled:opacity-30 disabled:pointer-events-none';

export default function PeriodPicker({ period, setPeriod, firstYear }) {
  const [open, setOpen] = useState(false);
  const [viewY, setViewY] = useState(period.y);
  const root = useRef(null), trigger = useRef(null);
  const now = new Date(), thisY = now.getFullYear(), thisM = now.getMonth();
  const all = period.mode === 'all';

  useEffect(() => { if (open) setViewY(period.y); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const setMode = (mode) => {
    setPeriod(p => (mode === 'all' ? { ...p, mode } : { ...p, mode, ...(p.mode === 'all' ? currentPeriod(mode) : {}) }));
    if (mode === 'all') setOpen(false);
  };
  const pick = (patch) => { setPeriod(p => ({ ...p, ...patch })); setOpen(false); };
  const step = (dir) => setPeriod(p => shiftPeriod(p, dir));

  // Years with data, padded back so the grid always has a full row or two
  const from = Math.min(firstYear || thisY, thisY - 5);
  const years = Array.from({ length: thisY - from + 1 }, (_, k) => from + k);
  const cell = (on, current) => `h-9 rounded-[8px] text-subhead tabular transition-colors pressable disabled:opacity-30 disabled:pointer-events-none ${
    on ? 'bg-tint text-white font-medium' : current ? 'text-tint-ink font-medium hover:bg-fill' : 'text-label hover:bg-fill'}`;

  return (
    <div ref={root} className="relative w-full sm:w-auto">
      <div className="flex items-center h-9 rounded-[10px] biz-card">
        <button type="button" className={arrowCls} onClick={() => step(-1)} disabled={all} aria-label={`Previous ${period.mode}`}><ChevronLeft className="w-4 h-4" aria-hidden /></button>
        <button ref={trigger} type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="dialog"
          className="h-9 flex-1 sm:flex-none min-w-[144px] px-2 flex items-center justify-center gap-1.5 text-subhead font-medium tabular hover:bg-fill transition-colors">
          <span aria-live="polite">{periodLabel(period)}</span>
          <ChevronDown className={`w-4 h-4 text-label-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <button type="button" className={arrowCls} onClick={() => step(1)} disabled={all || isAfterNow(shiftPeriod(period, 1))} aria-label={`Next ${period.mode}`}><ChevronRight className="w-4 h-4" aria-hidden /></button>
      </div>

      {open && (
        <div role="dialog" aria-label="Choose period"
          className="biz-pop absolute inset-x-0 sm:left-auto sm:right-0 top-11 z-30 sm:w-[280px] rounded-[16px] biz-card p-3 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
          <Segmented label="Period" size="sm" value={period.mode} onChange={setMode} options={PERIOD_MODES} />

          {period.mode === 'month' && (
            <>
              <div className="flex items-center justify-between mt-3">
                <button type="button" className={`${arrowCls} rounded-[8px] hover:bg-fill`} onClick={() => setViewY(y => y - 1)} aria-label="Previous year"><ChevronLeft className="w-4 h-4" aria-hidden /></button>
                <span className="text-subhead font-medium tabular">{viewY}</span>
                <button type="button" className={`${arrowCls} rounded-[8px] hover:bg-fill`} onClick={() => setViewY(y => y + 1)} disabled={viewY >= thisY} aria-label="Next year"><ChevronRight className="w-4 h-4" aria-hidden /></button>
              </div>
              <div className="grid grid-cols-4 gap-1 mt-1">
                {MONTHS.map((label, m) => (
                  <button key={m} type="button" onClick={() => pick({ y: viewY, m })} disabled={viewY > thisY || (viewY === thisY && m > thisM)}
                    aria-pressed={period.y === viewY && period.m === m} className={cell(period.y === viewY && period.m === m, viewY === thisY && m === thisM)}>{label}</button>
                ))}
              </div>
            </>
          )}

          {period.mode === 'year' && (
            <div className="grid grid-cols-3 gap-1 mt-3">
              {years.map(y => (
                <button key={y} type="button" onClick={() => pick({ y })} aria-pressed={period.y === y} className={cell(period.y === y, y === thisY)}>{y}</button>
              ))}
            </div>
          )}

          {!all && !isCurrent(period) && (
            <button type="button" onClick={() => pick(currentPeriod(period.mode))}
              className="mt-2 w-full h-9 rounded-[8px] text-subhead text-tint-ink hover:bg-fill transition-colors">
              {period.mode === 'month' ? 'Back to this month' : 'Back to this year'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
