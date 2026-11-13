'use client';

// Business dashboard: Overview, Inventory, Sales (tied to inventory) and Expenses.
// One period (a month, a year, or all time, browsable backwards) applies to Overview, Sales and Expenses.
// Data: localStorage 'baller_biz_v1' via useBusinessStore (passed in as data / update).
import { useMemo, useState } from 'react';
import { Package, Plus, Search, Download, Pencil, Trash2, ReceiptText, Wallet, X } from 'lucide-react';
import { Segmented, Button, EmptyState, useToast } from '../ui.jsx';
import { Stat, FilterSelect } from './bizUi.jsx';
import { ItemForm, SaleForm, ExpenseForm } from './bizForms.jsx';
import MonthlyChart from './MonthlyChart.jsx';
import PeriodPicker from './PeriodPicker.jsx';
import {
  SALE_TYPES, EXPENSE_CATEGORIES, peso, pct, num, fmtDate, currentPeriod, periodLabel,
  periodRange, inRange, totals, change, monthly, chartTitle, stock, expenseTotal, salesByItem, profitOf, unitsOf, isPaid, downloadCsv, ymd,
} from './bizData.js';
import './biz.css';

const VIEWS = [
  { value: 'overview', label: 'Overview' }, { value: 'inventory', label: 'Inventory' },
  { value: 'sales', label: 'Sales' }, { value: 'expenses', label: 'Expenses' },
];
const VIEW_KEY = 'bizView';
const readView = () => { try { const v = localStorage.getItem(VIEW_KEY); return VIEWS.some(x => x.value === v) ? v : 'overview'; } catch { return 'overview'; } };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const inPeriod = (p) => (p.mode === 'all' ? 'all time' : `in ${periodLabel(p)}`);

export default function BusinessDashboard({ data, update }) {
  const toast = useToast();
  const [view, setViewState] = useState(readView);
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch {} };
  const [period, setPeriod] = useState(() => currentPeriod('month'));
  const [itemQuery, setItemQuery] = useState('');   // Inventory search, set when jumping from a sale
  const [saleItem, setSaleItem] = useState(null);   // Sales filtered to one inventory item
  const inventory = data.inventory || [];
  const sales = data.sales || [];
  const expenses = data.expenses || [];
  const [itemSheet, setItemSheet] = useState(null);
  const [saleSheet, setSaleSheet] = useState(null);
  const [expenseSheet, setExpenseSheet] = useState(null);

  // Stock moves with sales: a sale from an inventory item takes its quantity; deleting / editing gives it back
  const restock = (inv, id, by) => inv.map(i => (i.id === id ? { ...i, quantity: Math.max(0, num(i.quantity) + by) } : i));
  const undoable = (msg) => { const prev = data; return () => toast(msg, null, { label: 'Undo', onClick: () => update(prev) }); };
  const ops = {
    saveItem(item) {
      const isNew = !inventory.some(i => i.id === item.id);
      update(d => ({ ...d, inventory: isNew ? [item, ...(d.inventory || [])] : d.inventory.map(i => (i.id === item.id ? item : i)) }));
      setItemSheet(null);
      toast(isNew ? 'Item added' : 'Item saved');
    },
    removeItem(item) {
      const done = undoable(`Removed ${item.name}`);
      update(d => ({ ...d, inventory: d.inventory.filter(i => i.id !== item.id) }));
      done();
    },
    saveSale(sale) {
      const old = sales.find(s => s.id === sale.id);
      update(d => {
        let inv = d.inventory || [];
        if (old?.inventoryId) inv = restock(inv, old.inventoryId, unitsOf(old));
        if (sale.inventoryId) inv = restock(inv, sale.inventoryId, -unitsOf(sale));
        return { ...d, inventory: inv, sales: old ? d.sales.map(s => (s.id === sale.id ? sale : s)) : [sale, ...(d.sales || [])] };
      });
      setSaleSheet(null);
      toast(old ? 'Sale saved' : `Sale recorded · ${peso(sale.totalAmount)}`);
    },
    removeSale(sale) {
      const done = undoable('Sale deleted');
      update(d => ({ ...d, sales: d.sales.filter(s => s.id !== sale.id), inventory: sale.inventoryId ? restock(d.inventory || [], sale.inventoryId, unitsOf(sale)) : d.inventory }));
      done();
    },
    patchSale(id, patch) { update(d => ({ ...d, sales: d.sales.map(s => (s.id === id ? { ...s, ...patch } : s)) })); },
    saveExpense(e) {
      const isNew = !expenses.some(x => x.id === e.id);
      update(d => ({ ...d, expenses: isNew ? [e, ...(d.expenses || [])] : d.expenses.map(x => (x.id === e.id ? e : x)) }));
      setExpenseSheet(null);
      toast(isNew ? `Expense added · ${peso(e.amount)}` : 'Expense saved');
    },
    removeExpense(e) {
      const done = undoable('Expense deleted');
      update(d => ({ ...d, expenses: d.expenses.filter(x => x.id !== e.id) }));
      done();
    },
    // Links between inventory and sales
    sell(item) { setSaleSheet({ sale: null, preset: item }); },
    showItemSales(item) { setSaleItem({ id: item.id, name: item.name }); setView('sales'); },
    showItem(sale) { const it = inventory.find(i => i.id === sale.inventoryId); if (!it) return; setItemQuery(it.sku || it.name); setView('inventory'); },
  };

  const categories = useMemo(() => [...new Set(inventory.map(i => i.category).filter(Boolean))].sort(), [inventory]);
  const firstYear = useMemo(() => Math.min(...[...sales, ...expenses].map(r => parseInt(String(r.date).slice(0, 4), 10)).filter(Boolean)), [sales, expenses]);
  const expenseCats = useMemo(() => [...new Set([...EXPENSE_CATEGORIES, ...expenses.map(e => e.category).filter(Boolean)])], [expenses]);
  const primary = view === 'expenses'
    ? <Button size="sm" onClick={() => setExpenseSheet({ expense: null })}><Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden />Add expense</Button>
    : <Button size="sm" onClick={() => setSaleSheet({ sale: null, preset: null })}><Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden />Record sale</Button>;

  return (
    <div className="biz-root min-h-dvh pb-28 lg:pb-16">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 pt-10 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-large-title">Business</h1>
            <p className="text-subhead text-label-2 tabular mt-1">{plural(inventory.length, 'item')} · {plural(sales.length, 'sale')} · {plural(expenses.length, 'expense')}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="gray" onClick={() => setItemSheet({ item: null })}><Package className="w-4 h-4" aria-hidden />Add item</Button>
            {primary}
          </div>
        </header>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="w-full sm:max-w-[480px]"><Segmented label="Section" value={view} onChange={setView} options={VIEWS} /></div>
          {view !== 'inventory' && <PeriodPicker period={period} setPeriod={setPeriod} firstYear={firstYear} />}
        </div>

        {view === 'overview' && <Overview inventory={inventory} sales={sales} expenses={expenses} period={period} setView={setView} />}
        {view === 'inventory' && <Inventory inventory={inventory} sales={sales} categories={categories} ops={ops} q={itemQuery} setQ={setItemQuery}
          onEdit={(item) => setItemSheet({ item })} onAdd={() => setItemSheet({ item: null })} />}
        {view === 'sales' && <Sales sales={sales} inventory={inventory} period={period} ops={ops} item={saleItem} clearItem={() => setSaleItem(null)}
          onEdit={(s) => setSaleSheet({ sale: s })} onAdd={() => setSaleSheet({ sale: null, preset: null })} />}
        {view === 'expenses' && <Expenses expenses={expenses} period={period} ops={ops} onEdit={(e) => setExpenseSheet({ expense: e })} onAdd={() => setExpenseSheet({ expense: null })} />}
      </div>

      <ItemForm open={!!itemSheet} item={itemSheet?.item || null} categories={categories} onClose={() => setItemSheet(null)} onSave={ops.saveItem} />
      <SaleForm open={!!saleSheet} sale={saleSheet?.sale || null} preset={saleSheet?.preset || null} inventory={inventory}
        onClose={() => setSaleSheet(null)} onSave={ops.saveSale} />
      <ExpenseForm open={!!expenseSheet} expense={expenseSheet?.expense || null} categories={expenseCats} onClose={() => setExpenseSheet(null)} onSave={ops.saveExpense} />
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function Overview({ inventory, sales, expenses, period, setView }) {
  const r = periodRange(period);
  const now = totals(sales.filter(s => inRange(s, r)));
  const before = r.prev ? totals(sales.filter(s => inRange(s, r.prev))) : null;
  const spent = expenseTotal(expenses.filter(e => inRange(e, r)));
  const spentBefore = r.prev ? expenseTotal(expenses.filter(e => inRange(e, r.prev))) : null;
  const net = now.profit - spent, netBefore = before ? before.profit - spentBefore : null;
  const st = stock(inventory);
  const months = useMemo(() => monthly(sales, period), [sales, period]);
  const ch = (a, b) => (b == null ? null : change(a, b));
  const byType = SALE_TYPES.map(t => ({ type: t, ...totals(sales.filter(s => s.saleType === t && inRange(s, r))) }));
  const recent = sales.filter(s => inRange(s, r)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
  const highlight = period.mode === 'month' ? `${period.y}-${String(period.m + 1).padStart(2, '0')}` : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Revenue" value={peso(now.revenue)} change={ch(now.revenue, before?.revenue)} vs={r.vs} sub={ch(now.revenue, before?.revenue) == null ? plural(now.count, 'sale') : null} />
        <Stat label="Profit on sales" value={peso(now.profit)} change={ch(now.profit, before?.profit)} vs={r.vs} sub={now.margin != null ? `${pct(now.margin)} margin` : 'No paid sales'} />
        <Stat label="Expenses" value={peso(spent)} change={ch(spent, spentBefore)} vs={r.vs} invert />
        <Stat label="Net profit" value={peso(net)} change={netBefore > 0 ? ch(net, netBefore) : null} vs={r.vs} sub="Profit minus expenses" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] items-stretch">
        <MonthlyChart data={months} title={chartTitle(period)} highlight={highlight} />
        <StockSlab inventory={inventory} st={st} onOpen={() => setView('inventory')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] items-start">
        <section className="biz-card rounded-2xl p-5 min-w-0">
          <h2 className="text-headline font-medium">By type <span className="text-subhead font-normal text-label-2">· {periodLabel(period)}</span></h2>
          <table className="w-full mt-3 text-subhead tabular">
            <thead><tr className="text-footnote text-label-2 text-left"><th className="py-2 font-normal">Type</th><th className="py-2 font-normal text-right">Sales</th><th className="py-2 font-normal text-right">Revenue</th><th className="py-2 font-normal text-right">Profit</th><th className="py-2 font-normal text-right">Margin</th></tr></thead>
            <tbody>
              {byType.map(t => (
                <tr key={t.type} className="shadow-[inset_0_1px_0_var(--hairline)]">
                  <td className="py-2">{t.type}</td>
                  <td className="py-2 text-right text-label-2">{t.count}</td>
                  <td className="py-2 text-right">{peso(t.revenue)}</td>
                  <td className={`py-2 text-right font-medium ${t.profit < 0 ? 'text-red-ink' : ''}`}>{peso(t.profit)}</td>
                  <td className="py-2 text-right text-label-2">{t.margin != null ? pct(t.margin) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="biz-card rounded-2xl p-5 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-headline font-medium">Sales</h2>
            <button type="button" onClick={() => setView('sales')} className="text-footnote text-tint-ink">All sales</button>
          </div>
          {recent.length ? (
            <ul className="mt-2">
              {recent.map(s => (
                <li key={s.id} className="flex items-center gap-3 h-9 text-subhead">
                  <span className="text-footnote text-label-2 w-[48px] shrink-0 tabular">{fmtDate(s.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{s.itemName}</span>
                  <span className="tabular">{peso(s.totalAmount)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-subhead text-label-2 mt-2">No sales {inPeriod(period)}</p>}
        </section>
      </div>
    </div>
  );
}

/** The moment: stock value beside a graded slab drawn in code, holding your most valuable card. */
function StockSlab({ inventory, st, onOpen }) {
  const top = inventory.filter(i => num(i.quantity) > 0).sort((a, b) => num(b.costPrice) - num(a.costPrice))[0];
  return (
    <section className="biz-card rounded-2xl p-5 min-w-0 flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-footnote text-label-2">Stock value · today</p>
        <button type="button" onClick={onOpen} className="text-footnote text-tint-ink">Inventory</button>
      </div>
      <p className="text-[28px] font-medium tabular leading-none mt-2">{peso(st.cost)}</p>
      <p className="text-footnote text-label-2 tabular mt-2">{plural(st.units, 'unit')} · {peso(st.target)} at target</p>
      <div className="biz-slab mt-auto pt-2" aria-hidden={!top}>
        <div className="biz-slab__label flex items-start justify-between gap-3 text-[#1c1c1e]">
          <div className="min-w-0">
            <p className="text-[12px] font-medium leading-4 truncate">{top ? top.name : 'No cards in stock'}</p>
            <p className="text-[11px] leading-4 text-[#6e6e73] font-mono truncate">{top ? [top.sku, top.batchCode].filter(Boolean).join(' · ') || '—' : 'Add an item'}</p>
          </div>
          {top && (
            <div className="text-right shrink-0">
              <p className="text-[11px] leading-4 text-[#6e6e73]">Cost</p>
              <p className="text-[13px] leading-4 font-medium font-mono tabular">{peso(top.costPrice)}</p>
            </div>
          )}
        </div>
        <div className="biz-slab__window">
          <div className="absolute inset-y-3 left-1/2 -translate-x-1/2 w-[76px] rounded-[4px] bg-gradient-to-b from-[#3a3a3c] to-[#2c2c2e] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] flex flex-col items-center justify-center">
            <span className="text-[24px] font-medium text-white/90 tabular leading-none">{top ? num(top.quantity) : 0}</span>
            <span className="text-[10px] text-white/55 mt-1">in stock</span>
          </div>
        </div>
      </div>
      {st.skus > 1 && <p className="text-footnote text-label-2 mt-3">Top card of {st.skus} by cost</p>}
    </section>
  );
}

// ─── Inventory ───────────────────────────────────────────────────────────────

function Inventory({ inventory, sales, categories, ops, q, setQ, onEdit, onAdd }) {
  const [cat, setCat] = useState('all');
  const [show, setShow] = useState('stock');
  const st = stock(inventory);
  const sold = useMemo(() => salesByItem(sales), [sales]);
  const list = inventory
    .filter(i => (show === 'stock' ? num(i.quantity) > 0 : show === 'out' ? num(i.quantity) <= 0 : true))
    .filter(i => cat === 'all' || (i.category || '') === cat)
    .filter(i => !q.trim() || [i.name, i.sku, i.category, i.batchCode].join(' ').toLowerCase().includes(q.trim().toLowerCase()));

  const exportCsv = () => downloadCsv(`inventory-${ymd()}.csv`, [
    ['Name', 'SKU', 'Category', 'Batch', 'In stock', 'Cost each', 'Target each', 'Sold', 'Sales revenue', 'Sales profit', 'Added'],
    ...inventory.map(i => { const x = sold.get(i.id); return [i.name, i.sku, i.category, i.batchCode, num(i.quantity), num(i.costPrice), num(i.targetPrice), x?.units || 0, x?.revenue || 0, x?.profit || 0, i.addedAt || '']; }),
  ]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Items in stock" value={String(st.skus)} sub={plural(st.units, 'unit')} />
        <Stat label="Stock at cost" value={peso(st.cost)} />
        <Stat label="At target prices" value={peso(st.target)} />
        <Stat label="Profit if sold at target" value={peso(st.target - st.cost)} sub={st.target ? `${pct((st.target - st.cost) / st.target)} margin` : null} />
      </div>

      <Toolbar q={q} setQ={setQ} placeholder="Search name, SKU, batch">
        <FilterSelect label="Show" value={show} onChange={setShow} options={[{ value: 'stock', label: 'In stock' }, { value: 'out', label: 'Sold out' }, { value: 'all', label: 'All items' }]} />
        {categories.length > 0 && <FilterSelect label="Category" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All categories' }, ...categories.map(c => ({ value: c, label: c }))]} />}
        <Button size="sm" variant="gray" onClick={exportCsv} disabled={!inventory.length}><Download className="w-4 h-4" aria-hidden />CSV</Button>
      </Toolbar>

      {list.length ? (
        <div className="biz-card rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_64px_104px_104px_minmax(150px,200px)_128px] gap-4 px-5 py-2 text-footnote text-label-2 shadow-[inset_0_-1px_0_var(--hairline)]">
            <span>Item</span><span className="text-right">In stock</span><span className="text-right">Cost each</span><span className="text-right">Target each</span><span>Sold</span><span />
          </div>
          <ul>
            {list.map(i => {
              const cost = num(i.costPrice), target = num(i.targetPrice), qty = num(i.quantity);
              const x = sold.get(i.id);
              return (
                <li key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_64px_104px_104px_minmax(150px,200px)_128px] gap-x-4 gap-y-1 items-center px-5 py-3 shadow-[inset_0_-1px_0_var(--hairline)] last:shadow-none">
                  <div className="min-w-0">
                    <p className="text-subhead font-medium truncate">{i.name}</p>
                    <p className="flex items-center gap-2 mt-1 min-w-0 text-footnote text-label-2">
                      {i.sku && <span className="biz-cert">{i.sku}</span>}
                      {i.batchCode && <span className="biz-cert">B {i.batchCode}</span>}
                      {i.category && <span className="truncate">{i.category}</span>}
                    </p>
                  </div>
                  <span className={`text-right text-subhead tabular font-medium ${qty <= 0 ? 'text-label-3' : ''}`}>{qty <= 0 ? 'Sold out' : <><span className="md:hidden text-label-2 font-normal">In stock </span>{qty}</>}</span>
                  <span className="hidden md:block text-right text-subhead tabular">{peso(cost)}</span>
                  <span className="hidden md:block text-right text-subhead tabular">{target ? peso(target) : '—'}</span>
                  {/* Sales of this item: tap to see them */}
                  <span className="col-span-2 md:col-span-1 min-w-0">
                    {x ? (
                      <button type="button" onClick={() => ops.showItemSales(i)} className="text-left text-footnote tabular hover:text-tint-ink transition-colors" title="See these sales">
                        <span className="text-label">{x.units} sold</span>
                        <span className="text-label-2"> · <span className={x.profit < 0 ? 'text-red-ink' : 'text-green-ink'}>{x.profit >= 0 ? '+' : ''}{peso(x.profit)}</span> · {fmtDate(x.last)}</span>
                      </button>
                    ) : <span className="text-footnote text-label-3">Not sold yet</span>}
                  </span>
                  <div className="col-span-2 md:col-span-1 flex justify-end gap-1">
                    <Button size="sm" variant="gray" onClick={() => ops.sell(i)} disabled={qty <= 0}>Sell</Button>
                    <IconBtn label={`Edit ${i.name}`} onClick={() => onEdit(i)}><Pencil className="w-4 h-4" aria-hidden /></IconBtn>
                    <IconBtn label={`Delete ${i.name}`} onClick={() => ops.removeItem(i)} danger><Trash2 className="w-4 h-4" aria-hidden /></IconBtn>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="biz-card rounded-2xl">
          <EmptyState icon={<Package className="w-6 h-6" aria-hidden />} title={inventory.length ? 'Nothing matches' : 'No inventory yet'}
            action={!inventory.length && <Button onClick={onAdd}><Plus className="w-4 h-4" aria-hidden />Add item</Button>}>
            {inventory.length ? 'Try another search or filter' : 'Add the cards you have; sales from them update stock and profit'}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

// ─── Sales: date, item (linked to inventory), qty, total, profit ──────────────

function Sales({ sales, inventory, period, ops, item, clearItem, onEdit, onAdd }) {
  const [q, setQ] = useState('');
  const shown = item ? { mode: 'all' } : period; // one item's sales: all time
  const r = periodRange(shown);
  const byId = useMemo(() => new Map(inventory.map(i => [i.id, i])), [inventory]);
  const list = sales
    .filter(s => inRange(s, r))
    .filter(s => !item || s.inventoryId === item.id)
    .filter(s => !q.trim() || [s.itemName, s.buyer, s.platform, s.notes, byId.get(s.inventoryId)?.sku].join(' ').toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const t = totals(list);

  const exportCsv = () => downloadCsv(`sales-${ymd()}.csv`, [
    ['Date', 'Item', 'SKU', 'Qty', 'Total', 'Cost each', 'Profit', 'Type', 'Payment', 'Buyer', 'Notes'],
    ...list.map(s => [s.date, s.itemName, byId.get(s.inventoryId)?.sku || '', unitsOf(s), num(s.totalAmount), num(s.costPrice), profitOf(s), s.saleType, s.paymentStatus, s.buyer, s.notes]),
  ]);

  return (
    <div className="space-y-4">
      <Toolbar q={q} setQ={setQ} placeholder="Search item, SKU, buyer">
        {item && (
          <button type="button" onClick={clearItem} className="biz-tag h-9 gap-1.5 px-3" title="Show all items">
            {item.name}<X className="w-3.5 h-3.5" aria-label="Clear" />
          </button>
        )}
        <Button size="sm" variant="gray" onClick={exportCsv} disabled={!list.length}><Download className="w-4 h-4" aria-hidden />CSV</Button>
      </Toolbar>

      {list.length > 0 && (
        <p className="text-subhead text-label-2 tabular px-1">
          {plural(t.count, 'sale')} {inPeriod(shown)} · <span className="font-medium text-label">{peso(t.revenue)}</span> · profit{' '}
          <span className={`font-medium ${t.profit < 0 ? 'text-red-ink' : 'text-label'}`}>{peso(t.profit)}</span>
          {t.owed > 0 && <> · {peso(t.owed)} not paid yet</>}
        </p>
      )}

      {list.length ? (
        <div className="biz-card rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[64px_minmax(0,1fr)_48px_112px_104px_72px] gap-4 px-5 py-2 text-footnote text-label-2 shadow-[inset_0_-1px_0_var(--hairline)]">
            <span>Date</span><span>Item</span><span className="text-right">Qty</span><span className="text-right">Total</span><span className="text-right">Profit</span><span />
          </div>
          <ul>
            {list.map(s => {
              const p = profitOf(s), it = byId.get(s.inventoryId);
              return (
                <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[64px_minmax(0,1fr)_48px_112px_104px_72px] gap-x-4 gap-y-1 items-center px-5 py-3 shadow-[inset_0_-1px_0_var(--hairline)] last:shadow-none">
                  <span className="hidden md:block text-footnote text-label-2 tabular">{fmtDate(s.date)}</span>
                  <div className="min-w-0">
                    <p className="text-subhead font-medium truncate">{s.itemName}</p>
                    <p className="flex items-center gap-2 mt-1 min-w-0 text-footnote text-label-2">
                      <span className="md:hidden tabular">{fmtDate(s.date)}</span>
                      {it ? (
                        <button type="button" onClick={() => ops.showItem(s)} className="biz-cert hover:text-label transition-colors" title="Open in inventory">{it.sku || 'Inventory'}</button>
                      ) : s.inventoryId ? <span className="text-label-3">Item deleted</span> : <span className="text-label-3">Not in inventory</span>}
                      {!isPaid(s) && (
                        <button type="button" onClick={() => ops.patchSale(s.id, { paymentStatus: 'Paid' })} className="biz-tag biz-tag--warn h-5 px-1.5 text-[11px]" title="Mark paid">Not paid</button>
                      )}
                      {s.buyer && <span className="truncate">{s.buyer}</span>}
                    </p>
                  </div>
                  <span className="hidden md:block text-right text-subhead tabular text-label-2">{unitsOf(s)}</span>
                  <span className="text-right text-subhead font-medium tabular">{peso(s.totalAmount)}
                    <span className={`md:hidden block text-footnote font-normal ${p < 0 ? 'text-red-ink' : 'text-green-ink'}`}>{p >= 0 ? '+' : ''}{peso(p)}</span>
                  </span>
                  <span className={`hidden md:block text-right text-subhead tabular ${p < 0 ? 'text-red-ink' : 'text-green-ink'}`}>{p >= 0 ? '+' : ''}{peso(p)}</span>
                  <div className="col-span-2 md:col-span-1 flex justify-end gap-1">
                    <IconBtn label={`Edit sale of ${s.itemName}`} onClick={() => onEdit(s)}><Pencil className="w-4 h-4" aria-hidden /></IconBtn>
                    <IconBtn label={`Delete sale of ${s.itemName}`} onClick={() => ops.removeSale(s)} danger><Trash2 className="w-4 h-4" aria-hidden /></IconBtn>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="biz-card rounded-2xl">
          <EmptyState icon={<ReceiptText className="w-6 h-6" aria-hidden />} title={sales.length ? `No sales ${inPeriod(shown)}` : 'No sales yet'}
            action={!sales.length && <Button onClick={onAdd}><Plus className="w-4 h-4" aria-hidden />Record sale</Button>}>
            {sales.length ? 'Try another period or search' : 'Pick an item from inventory and its stock goes down'}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

// ─── Expenses: date, what for, category, amount ──────────────────────────────

function Expenses({ expenses, period, ops, onEdit, onAdd }) {
  const [q, setQ] = useState('');
  const r = periodRange(period);
  const list = expenses
    .filter(e => inRange(e, r))
    .filter(e => !q.trim() || [e.description, e.category, e.notes].join(' ').toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = expenseTotal(list);
  const byCat = [...list.reduce((m, e) => m.set(e.category || 'Other', (m.get(e.category || 'Other') || 0) + num(e.amount)), new Map())].sort((a, b) => b[1] - a[1]);

  const exportCsv = () => downloadCsv(`expenses-${ymd()}.csv`, [['Date', 'What for', 'Category', 'Amount', 'Notes'], ...list.map(e => [e.date, e.description, e.category, num(e.amount), e.notes])]);

  return (
    <div className="space-y-4">
      <Toolbar q={q} setQ={setQ} placeholder="Search expenses">
        <Button size="sm" variant="gray" onClick={exportCsv} disabled={!list.length}><Download className="w-4 h-4" aria-hidden />CSV</Button>
      </Toolbar>

      {list.length ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] items-start">
          <div className="biz-card rounded-2xl overflow-hidden">
            <ul>
              {list.map(e => (
                <li key={e.id} className="grid grid-cols-[56px_minmax(0,1fr)_auto_72px] gap-x-4 items-center px-5 py-3 shadow-[inset_0_-1px_0_var(--hairline)] last:shadow-none">
                  <span className="text-footnote text-label-2 tabular">{fmtDate(e.date)}</span>
                  <div className="min-w-0">
                    <p className="text-subhead font-medium truncate">{e.description}</p>
                    <p className="text-footnote text-label-2 truncate">{[e.category, e.notes].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="text-right text-subhead font-medium tabular">{peso(e.amount)}</span>
                  <div className="flex justify-end gap-1">
                    <IconBtn label={`Edit ${e.description}`} onClick={() => onEdit(e)}><Pencil className="w-4 h-4" aria-hidden /></IconBtn>
                    <IconBtn label={`Delete ${e.description}`} onClick={() => ops.removeExpense(e)} danger><Trash2 className="w-4 h-4" aria-hidden /></IconBtn>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <section className="biz-card rounded-2xl p-5">
            <p className="text-footnote text-label-2">Spent {inPeriod(period)}</p>
            <p className="text-[28px] font-medium tabular leading-none mt-2">{peso(total)}</p>
            <p className="text-footnote text-label-2 tabular mt-2">{plural(list.length, 'expense')}</p>
            {/* Share by category: a ranked list with thin bars */}
            <ul className="mt-4 space-y-3">
              {byCat.map(([c, v]) => (
                <li key={c}>
                  <div className="flex items-baseline justify-between text-subhead"><span>{c}</span><span className="tabular">{peso(v)}</span></div>
                  <div className="mt-1 h-1 rounded-full bg-fill overflow-hidden"><div className="h-full rounded-full bg-[var(--series-rev)]" style={{ width: `${total ? (v / total) * 100 : 0}%` }} /></div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="biz-card rounded-2xl">
          <EmptyState icon={<Wallet className="w-6 h-6" aria-hidden />} title={expenses.length ? `No expenses ${inPeriod(period)}` : 'No expenses yet'}
            action={<Button onClick={onAdd}><Plus className="w-4 h-4" aria-hidden />Add expense</Button>}>
            {expenses.length ? 'Try another period or search' : 'Supplies, shipping and fees come off your profit'}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function Toolbar({ q, setQ, placeholder, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-label-2" aria-hidden />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          className="w-full h-9 pl-9 pr-3 rounded-[10px] biz-card text-subhead outline-none focus:ring-2 focus:ring-tint placeholder:text-label-3" />
      </label>
      {children}
    </div>
  );
}

function IconBtn({ label, onClick, danger, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors pressable ${danger ? 'text-label-3 hover:text-red-ink hover:bg-red-soft' : 'text-label-2 hover:text-label hover:bg-fill'}`}>
      {children}
    </button>
  );
}
