// Business data helpers. Records live in localStorage 'baller_biz_v1' (see ../store.js), same shapes
// as the earlier business app, so old inventory and sales show up again:
//   inventory: { id, name, sku, category, batchCode, costPrice, targetPrice, quantity, addedAt }
//   sales:     { id, itemName, inventoryId, costPrice (per unit), totalAmount, quantity, saleType,
//                status: 'To Ship' | 'On Hold' | 'Shipped', paymentStatus: 'Paid' | 'Unpaid', buyer, platform, date, notes }
import { genId } from '../store.js';

export const SALE_TYPES = ['Sale', 'Auction', 'Firesale'];
export const SHIP = ['To Ship', 'On Hold', 'Shipped'];
export const PAY = ['Paid', 'Unpaid'];
/** Stored values stay as the old app wrote them; labels are sentence case. */
export const shipLabel = (v) => ({ 'To Ship': 'To ship', 'On Hold': 'On hold' }[v] || v);

export const peso = (n) => `${n < 0 ? '−' : ''}₱${Math.round(Math.abs(n || 0)).toLocaleString('en-PH')}`;
export const pesoShort = (n) => {
  const a = Math.abs(n || 0), s = n < 0 ? '−' : '';
  if (a >= 1e6) return `${s}₱${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}₱${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${s}₱${Math.round(a)}`;
};
export const pct = (n) => `${Math.round(n * 100)}%`;
export const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// Local dates (toISOString would shift a day at UTC+8)
export const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => { const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number); return y ? new Date(y, (m || 1) - 1, d || 1) : null; };
export const fmtDate = (s, opts = { month: 'short', day: 'numeric' }) => { const d = parse(s); return d ? d.toLocaleDateString('en-PH', opts) : '—'; };

export const unitsOf = (s) => Math.max(1, Math.round(num(s.quantity) || 1));
export const costOf = (s) => num(s.costPrice) * unitsOf(s);
export const profitOf = (s) => num(s.totalAmount) - costOf(s);
export const isPaid = (s) => s.paymentStatus === 'Paid';

/**
 * A period is { mode: 'month' | 'year' | 'all', y, m } (m 0–11). Step back and forward through months or years.
 * Each compares with the one before it; the current month / year compares with the same days one back.
 */
export const PERIOD_MODES = [
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
];
export const currentPeriod = (mode = 'month', now = new Date()) => ({ mode, y: now.getFullYear(), m: now.getMonth() });
const monthName = (y, m, style = 'long') => new Date(y, m, 1).toLocaleDateString('en-PH', { month: style });
export const periodLabel = (p) => (p.mode === 'all' ? 'All time' : p.mode === 'year' ? String(p.y) : `${monthName(p.y, p.m)} ${p.y}`);
export function shiftPeriod(p, dir) {
  if (p.mode === 'year') return { ...p, y: p.y + dir };
  const d = new Date(p.y, p.m + dir, 1);
  return { ...p, y: d.getFullYear(), m: d.getMonth() };
}
export const isCurrent = (p, now = new Date()) => p.mode === 'all' || (p.y === now.getFullYear() && (p.mode === 'year' || p.m === now.getMonth()));
export const isAfterNow = (p, now = new Date()) => p.mode !== 'all' && (p.y > now.getFullYear() || (p.mode === 'month' && p.y === now.getFullYear() && p.m > now.getMonth()));

export function periodRange(p, now = new Date()) {
  if (p.mode === 'all') return { from: null, to: null, prev: null, vs: null };
  const start = p.mode === 'month' ? new Date(p.y, p.m, 1) : new Date(p.y, 0, 1);
  const end = p.mode === 'month' ? new Date(p.y, p.m + 1, 0) : new Date(p.y, 11, 31);
  const back = (d) => (p.mode === 'month' ? new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()) : new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
  // A finished period compares with the whole one before it; the current one with the same days so far
  const prevEnd = isCurrent(p, now) ? back(now) : (p.mode === 'month' ? new Date(p.y, p.m, 0) : new Date(p.y - 1, 11, 31));
  const vs = p.mode === 'month' ? `vs ${monthName(start.getFullYear(), start.getMonth() - 1 < 0 ? 11 : start.getMonth() - 1)}` : `vs ${p.y - 1}`;
  return { from: ymd(start), to: ymd(end), prev: { from: ymd(back(start)), to: ymd(prevEnd) }, vs };
}
export const inRange = (s, r) => !!r && (!r.from || s.date >= r.from) && (!r.to || s.date <= r.to);

/** Money in (paid sales only), profit, units; plus what's still owed and what's left to ship. */
export function totals(sales) {
  const paid = sales.filter(isPaid);
  const revenue = paid.reduce((a, s) => a + num(s.totalAmount), 0);
  const cogs = paid.reduce((a, s) => a + costOf(s), 0);
  const unpaid = sales.filter(s => !isPaid(s));
  return {
    count: sales.length, revenue, cogs, profit: revenue - cogs, margin: revenue > 0 ? (revenue - cogs) / revenue : null,
    units: paid.reduce((a, s) => a + unitsOf(s), 0),
    owed: unpaid.reduce((a, s) => a + num(s.totalAmount), 0), owedCount: unpaid.length,
    toShip: sales.filter(s => s.status === 'To Ship').length, onHold: sales.filter(s => s.status === 'On Hold').length,
  };
}
export const change = (now, before) => (before > 0 ? (now - before) / before : null);

/**
 * Twelve months for the chart, oldest first: Jan–Dec of a year, or the 12 months up to a month (or now).
 * Each: { key: '2026-03', label: 'Mar', year, revenue, profit, count } from paid sales.
 */
export function monthly(sales, p = { mode: 'all' }, now = new Date()) {
  const endY = p.mode === 'all' ? now.getFullYear() : p.y;
  const endM = p.mode === 'all' ? now.getMonth() : p.mode === 'year' ? 11 : p.m;
  const out = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(endY, endM - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: d.toLocaleDateString('en-PH', { month: 'short' }), year: d.getFullYear(), revenue: 0, profit: 0, count: 0 });
  }
  const at = new Map(out.map((m, k) => [m.key, k]));
  sales.filter(isPaid).forEach(s => {
    const k = at.get(String(s.date || '').slice(0, 7));
    if (k == null) return;
    out[k].revenue += num(s.totalAmount); out[k].profit += profitOf(s); out[k].count++;
  });
  return out;
}
export const chartTitle = (p) => (p.mode === 'year' ? `${p.y} by month` : p.mode === 'month' ? `12 months to ${periodLabel(p)}` : 'Last 12 months');

/** Expenses: { id, description, amount, category, date, notes } (same as the earlier app). */
export const EXPENSE_CATEGORIES = ['Supplies', 'Shipping', 'Packaging', 'Fees', 'Marketing', 'Other'];
export const expenseTotal = (list) => list.reduce((a, e) => a + num(e.amount), 0);

/** Each inventory item's sales: units sold, revenue, profit, last sale date. */
export function salesByItem(sales) {
  const m = new Map();
  sales.forEach(s => {
    if (!s.inventoryId) return;
    const x = m.get(s.inventoryId) || { units: 0, revenue: 0, profit: 0, count: 0, last: '' };
    x.units += unitsOf(s); x.revenue += num(s.totalAmount); x.profit += profitOf(s); x.count++;
    if (String(s.date) > x.last) x.last = String(s.date);
    m.set(s.inventoryId, x);
  });
  return m;
}

export function stock(inventory) {
  const inStock = inventory.filter(i => num(i.quantity) > 0);
  return {
    skus: inStock.length,
    units: inStock.reduce((a, i) => a + num(i.quantity), 0),
    cost: inStock.reduce((a, i) => a + num(i.costPrice) * num(i.quantity), 0),
    target: inStock.reduce((a, i) => a + num(i.targetPrice) * num(i.quantity), 0),
  };
}

export const newItem = (f) => ({
  id: genId(), name: f.name.trim(), sku: f.sku.trim() || `SKU-${genId().slice(0, 6).toUpperCase()}`, category: f.category.trim(),
  batchCode: f.batchCode.trim(), costPrice: num(f.costPrice), targetPrice: num(f.targetPrice), quantity: Math.max(0, Math.round(num(f.quantity))),
  addedAt: ymd(),
});

/** CSV download (Excel-friendly). */
export function downloadCsv(name, rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = rows.map(r => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
