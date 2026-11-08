'use client';

// Last 12 months: revenue and profit side by side on one ₱ axis. Hover / focus a month for its numbers;
// "Table" shows the same data as a table.
import { useEffect, useRef, useState } from 'react';
import { peso, pesoShort, pct } from './bizData.js';

const H = 220, TOP = 12, BOTTOM = 26, LEFT = 52, RIGHT = 8;
const SERIES = [
  { key: 'revenue', label: 'Revenue', color: 'var(--series-1)' },
  { key: 'profit', label: 'Profit', color: 'var(--series-2)' },
];

/** Round-number ticks covering [lo, hi]. */
function ticks(lo, hi, n = 4) {
  const span = Math.max(1, hi - lo);
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

/** Column with a 4px rounded data end and a square end on the baseline (downward when negative). */
function bar(x, w, y0, y1) {
  const r = Math.min(4, w / 2, Math.abs(y1 - y0));
  if (Math.abs(y1 - y0) < 0.5) return '';
  if (y1 < y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

export default function MonthlyChart({ data }) {
  const box = useRef(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);

  const lo = Math.min(0, ...data.map(d => d.profit));
  const hi = Math.max(1, ...data.map(d => d.revenue), ...data.map(d => d.profit));
  const t = ticks(lo, hi);
  const yMin = t[0], yMax = t[t.length - 1];
  const plotH = H - TOP - BOTTOM, plotW = w - LEFT - RIGHT;
  const y = (v) => TOP + plotH * (1 - (v - yMin) / (yMax - yMin || 1));
  const band = plotW / data.length;
  const bw = Math.min(24, Math.max(4, (band - 10) / 2)); // capped, never fills the slot
  const empty = data.every(d => !d.revenue && !d.profit);
  const h = hover != null ? data[hover] : null;

  return (
    <div className="glass-card rounded-[20px] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-headline">Last 12 months</h2>
        <div className="flex items-center gap-4">
          {/* Legend: identity is never colour alone */}
          <ul className="flex items-center gap-3 text-footnote text-label-2" aria-label="Legend">
            {SERIES.map(s => (
              <li key={s.key} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />{s.label}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setTable(v => !v)} aria-pressed={table}
            className="h-7 px-2.5 rounded-full bg-fill text-footnote font-semibold text-tint-ink pressable">{table ? 'Chart' : 'Table'}</button>
        </div>
      </div>

      {table ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-subhead tabular">
            <thead><tr className="text-footnote text-label-2 text-left"><th className="py-1.5 font-medium">Month</th><th className="py-1.5 font-medium text-right">Revenue</th><th className="py-1.5 font-medium text-right">Profit</th><th className="py-1.5 font-medium text-right">Margin</th><th className="py-1.5 font-medium text-right">Sales</th></tr></thead>
            <tbody>
              {data.map(d => (
                <tr key={d.key} className="shadow-[inset_0_0.5px_0_var(--separator)]">
                  <td className="py-1.5">{d.label} {d.year}</td>
                  <td className="py-1.5 text-right">{peso(d.revenue)}</td>
                  <td className="py-1.5 text-right">{peso(d.profit)}</td>
                  <td className="py-1.5 text-right text-label-2">{d.revenue ? pct(d.profit / d.revenue) : '—'}</td>
                  <td className="py-1.5 text-right text-label-2">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative mt-3" onMouseLeave={() => setHover(null)}>
          <svg width={w} height={H} role="img" aria-label="Revenue and profit by month for the last 12 months" className="block overflow-visible">
            {/* Recessive grid + axis labels */}
            {t.map(v => (
              <g key={v}>
                <line x1={LEFT} x2={w - RIGHT} y1={y(v)} y2={y(v)} stroke="var(--separator)" strokeWidth={v === 0 ? 1 : 0.5} />
                <text x={LEFT - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-[var(--label-2)] text-[11px] tabular">{pesoShort(v)}</text>
              </g>
            ))}
            {data.map((d, k) => {
              const x0 = LEFT + band * k + (band - (bw * 2 + 2)) / 2;
              return (
                <g key={d.key}>
                  {hover === k && <rect x={LEFT + band * k} y={TOP} width={band} height={plotH} rx={6} className="fill-[var(--fill)]" />}
                  {SERIES.map((s, j) => <path key={s.key} d={bar(x0 + j * (bw + 2), bw, y(0), y(d[s.key]))} fill={s.color} />)}
                  <text x={LEFT + band * k + band / 2} y={H - 8} textAnchor="middle" className="fill-[var(--label-2)] text-[11px]">{d.label}</text>
                  {/* Hit target: the whole month column */}
                  <rect x={LEFT + band * k} y={TOP} width={band} height={plotH + BOTTOM} fill="transparent" tabIndex={0}
                    aria-label={`${d.label} ${d.year}: revenue ${peso(d.revenue)}, profit ${peso(d.profit)}`}
                    onMouseEnter={() => setHover(k)} onFocus={() => setHover(k)} onBlur={() => setHover(null)} className="outline-none" />
                </g>
              );
            })}
          </svg>
          {empty && <p className="absolute inset-x-0 top-[38%] text-center text-subhead text-label-2">No paid sales in the last 12 months</p>}
          {h && (
            <div className="absolute top-0 pointer-events-none z-10 rounded-[12px] bg-surface shadow-[var(--shadow-lg)] px-3 py-2 text-footnote tabular min-w-[150px]"
              style={{ left: Math.min(w - 160, Math.max(0, LEFT + band * hover + band / 2 - 75)) }}>
              <p className="font-semibold text-label">{h.label} {h.year}</p>
              {SERIES.map(s => (
                <p key={s.key} className="flex items-center gap-1.5 text-label-2 mt-0.5">
                  <span className="w-2 h-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />{s.label}
                  <span className="ml-auto font-semibold text-label">{peso(h[s.key])}</span>
                </p>
              ))}
              <p className="text-label-2 mt-0.5">{h.count} sale{h.count === 1 ? '' : 's'}{h.revenue ? ` · ${pct(h.profit / h.revenue)} margin` : ''}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
