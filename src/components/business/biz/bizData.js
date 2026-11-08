// Business data helpers. Records live in localStorage 'baller_biz_v1' (see ../store.js), same shapes
// as the earlier business app, so old inventory and sales show up again:
//   inventory: { id, name, sku, category, batchCode, costPrice, targetPrice, quantity, addedAt }
//   sales:     { id, itemName, inventoryId, costPrice (per unit), totalAmount, quantity, saleType,
//                status: 'To Ship' | 'On Hold' | 'Shipped', paymentStatus: 'Paid' | 'Unpaid', buyer, platform, date, notes }
import { genId } from '../store.js';

export const SALE_TYPES = ['Sale', 'Auction', 'Firesale'];
export const SHIP = ['To Ship', 'On Hold', 'Shipped'];
export const PAY = ['Paid', 'Unpaid'];

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

/** Periods: this month, this year, or everything; each compares with the same stretch one month / year back. */
export const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];
export function periodRange(period, now = new Date()) {
  if (period === 'all') return { from: null, to: null, prev: null };
  const start = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), 0, 1);
  const end = period === 'month' ? new Date(now.getFullYear(), now.getMonth() + 1, 0) : new Date(now.getFullYear(), 11, 31);
  const back = (d) => (period === 'month' ? new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()) : new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
  // The whole month / year so far (and anything dated later in it); compared with the same days a month / year back
  return { from: ymd(start), to: ymd(end), prev: { from: ymd(back(start)), to: ymd(back(now)) } };
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

/** The last 12 months, oldest first: { key: '2026-03', label: 'Mar', revenue, profit } (paid sales). */
export function monthly(sales, now = new Date()) {
  const out = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
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
