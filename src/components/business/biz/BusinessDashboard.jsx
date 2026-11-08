'use client';

// Business dashboard: Overview (glass stat cards, 12-month chart, by type, to-do), Inventory, Sales.
// Data: localStorage 'baller_biz_v1' via useBusinessStore (passed in as data / update).
import { useMemo, useState } from 'react';
import {
  Wallet, TrendingUp, Package, Truck, HandCoins, ShoppingBag, Plus, Search, Download, Pencil, Trash2, Boxes, ReceiptText,
} from 'lucide-react';
import { Segmented, Button, Chip, EmptyState, useToast } from '../ui.jsx';
import { GlassStat, FilterSelect } from './bizUi.jsx';
import { ItemForm, SaleForm } from './bizForms.jsx';
import MonthlyChart from './MonthlyChart.jsx';
import {
  SALE_TYPES, SHIP, PERIODS, peso, pct, num, fmtDate, periodRange, inRange, totals, change, monthly, stock,
  profitOf, unitsOf, isPaid, downloadCsv, ymd,
} from './bizData.js';
import './biz.css';

const VIEWS = [{ value: 'overview', label: 'Overview' }, { value: 'inventory', label: 'Inventory' }, { value: 'sales', label: 'Sales' }];
const VIEW_KEY = 'bizView';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) || 'overview'; } catch { return 'overview'; } };

export default function BusinessDashboard({ data, update }) {
  const toast = useToast();
  const [view, setViewState] = useState(readView);
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch {} };
  const inventory = data.inventory || [];
  const sales = data.sales || [];
  const [itemSheet, setItemSheet] = useState(null);  // { item | null }
  const [saleSheet, setSaleSheet] = useState(null);  // { sale | null, preset | null }

  // Stock moves with sales: a sale from an inventory item takes its quantity; deleting / editing gives it back
  const restock = (inv, id, by) => inv.map(i => (i.id === id ? { ...i, quantity: Math.max(0, num(i.quantity) + by) } : i));
  const ops = {
    saveItem(item) {
      const isNew = !inventory.some(i => i.id === item.id);
      update(d => ({ ...d, inventory: isNew ? [item, ...(d.inventory || [])] : d.inventory.map(i => (i.id === item.id ? item : i)) }));
      setItemSheet(null);
      toast(isNew ? 'Item added' : 'Item saved');
    },
    removeItem(item) {
      const prev = data;
      update(d => ({ ...d, inventory: d.inventory.filter(i => i.id !== item.id) }));
      toast(`Removed ${item.name}`, null, { label: 'Undo', onClick: () => update(prev) });
    },
    saveSale(sale) {
      const old = sales.find(s => s.id === sale.id);
      update(d => {
        let inv = d.inventory || [];
        if (old?.inventoryId) inv = restock(inv, old.inventoryId, unitsOf(old));
        if (sale.inventoryId) inv = restock(inv, sale.inventoryId, -unitsOf(sale));
        const list = old ? d.sales.map(s => (s.id === sale.id ? sale : s)) : [sale, ...(d.sales || [])];
        return { ...d, inventory: inv, sales: list };
      });
      setSaleSheet(null);
      toast(old ? 'Sale saved' : `Sale recorded · ${peso(sale.totalAmount)}`);
    },
    removeSale(sale) {
      const prev = data;
      update(d => ({ ...d, sales: d.sales.filter(s => s.id !== sale.id), inventory: sale.inventoryId ? restock(d.inventory || [], sale.inventoryId, unitsOf(sale)) : d.inventory }));
      toast('Sale deleted', null, { label: 'Undo', onClick: () => update(prev) });
    },
    patchSale(id, patch) { update(d => ({ ...d, sales: d.sales.map(s => (s.id === id ? { ...s, ...patch } : s)) })); },
    sell(item) { setSaleSheet({ sale: null, preset: item }); },
  };

  const categories = useMemo(() => [...new Set(inventory.map(i => i.category).filter(Boolean))].sort(), [inventory]);
  const platforms = useMemo(() => [...new Set(['eBay', 'Facebook', 'Instagram', 'Carousell', 'Shopee', ...sales.map(s => s.platform).filter(Boolean)])], [sales]);

  return (
    <div className="biz-root min-h-dvh pb-28 lg:pb-16">
      <div className="biz-wash" aria-hidden />
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10 space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-large-title">Business</h1>
            <p className="text-subhead text-label-2 mt-1">{inventory.length} items · {sales.length} sales</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="tinted" onClick={() => setItemSheet({ item: null })}><Package className="w-4 h-4" aria-hidden />Add item</Button>
            <Button size="sm" onClick={() => setSaleSheet({ sale: null, preset: null })}><Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden />Record sale</Button>
          </div>
        </header>
        <div className="max-w-[420px]"><Segmented label="Section" value={view} onChange={setView} options={VIEWS} /></div>

        {view === 'overview' && <Overview inventory={inventory} sales={sales} ops={ops} setView={setView} openSale={(s) => setSaleSheet({ sale: s })} />}
        {view === 'inventory' && <Inventory inventory={inventory} categories={categories} ops={ops} onEdit={(item) => setItemSheet({ item })} onAdd={() => setItemSheet({ item: null })} />}
        {view === 'sales' && <Sales sales={sales} ops={ops} onEdit={(s) => setSaleSheet({ sale: s })} onAdd={() => setSaleSheet({ sale: null, preset: null })} />}
      </div>

      <ItemForm open={!!itemSheet} item={itemSheet?.item || null} categories={categories} onClose={() => setItemSheet(null)} onSave={ops.saveItem} />
      <SaleForm open={!!saleSheet} sale={saleSheet?.sale || null} preset={saleSheet?.preset || null} inventory={inventory} platforms={platforms}
        onClose={() => setSaleSheet(null)} onSave={ops.saveSale} />
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function Overview({ inventory, sales, ops, setView, openSale }) {
  const [period, setPeriod] = useState('month');
  const r = periodRange(period);
  const now = totals(sales.filter(s => inRange(s, r)));
  const before = r.prev ? totals(sales.filter(s => inRange(s, r.prev))) : null;
  const all = totals(sales);
  const st = stock(inventory);
  const months = useMemo(() => monthly(sales), [sales]);
  const vs = period === 'month' ? 'vs last month' : period === 'year' ? 'vs last year' : null;

  const byType = SALE_TYPES.map(t => ({ type: t, ...totals(sales.filter(s => s.saleType === t && inRange(s, r))) }));
  const todo = sales.filter(s => s.status !== 'Shipped' || !isPaid(s)).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 6);
  const recent = [...sales].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="max-w-[360px]"><Segmented label="Period" size="sm" value={period} onChange={setPeriod} options={PERIODS} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <GlassStat label="Revenue" icon={Wallet} tint="#0A84FF" value={peso(now.revenue)} change={before ? change(now.revenue, before.revenue) : null}
          sub={before && change(now.revenue, before.revenue) != null ? vs : `${now.count} sale${now.count === 1 ? '' : 's'}`} />
        <GlassStat label="Profit" icon={TrendingUp} tint="#30B0C7" value={peso(now.profit)} change={before ? change(now.profit, before.profit) : null}
          sub={now.margin != null ? `${pct(now.margin)} margin` : 'No paid sales'} />
        <GlassStat label="Units sold" icon={ShoppingBag} tint="#5E5CE6" value={now.units.toLocaleString('en-PH')} change={before ? change(now.units, before.units) : null} sub={`${now.count} sales`} />
        <GlassStat label="Owed to you" icon={HandCoins} tint="#FF9F0A" value={peso(all.owed)} sub={all.owedCount ? `${all.owedCount} unpaid` : 'All paid'} />
        <GlassStat label="To ship" icon={Truck} tint="#FF375F" value={String(all.toShip)} sub={all.onHold ? `${all.onHold} on hold` : 'None on hold'} />
        <GlassStat label="Stock value" icon={Boxes} tint="#34C759" value={peso(st.cost)} sub={`${st.units} units · ${peso(st.target)} at target`} />
      </div>

      <MonthlyChart data={months} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-card rounded-[20px] p-4 sm:p-5">
          <h2 className="text-headline">By type <span className="text-subhead font-normal text-label-2">· {PERIODS.find(p => p.value === period).label.toLowerCase()}</span></h2>
          <table className="w-full mt-2 text-subhead tabular">
            <thead><tr className="text-footnote text-label-2 text-left"><th className="py-1.5 font-medium">Type</th><th className="py-1.5 font-medium text-right">Sales</th><th className="py-1.5 font-medium text-right">Revenue</th><th className="py-1.5 font-medium text-right">Profit</th><th className="py-1.5 font-medium text-right">Margin</th></tr></thead>
            <tbody>
              {byType.map(t => (
                <tr key={t.type} className="shadow-[inset_0_0.5px_0_var(--separator)]">
                  <td className="py-2 font-medium">{t.type}</td>
                  <td className="py-2 text-right text-label-2">{t.count}</td>
                  <td className="py-2 text-right">{peso(t.revenue)}</td>
                  <td className={`py-2 text-right font-semibold ${t.profit < 0 ? 'text-red-ink' : ''}`}>{peso(t.profit)}</td>
                  <td className="py-2 text-right text-label-2">{t.margin != null ? pct(t.margin) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="glass-card rounded-[20px] p-4 sm:p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-headline">To do</h2>
            {todo.length > 0 && <button type="button" onClick={() => setView('sales')} className="text-subhead text-tint-ink">All sales</button>}
          </div>
          {todo.length ? (
            <ul className="mt-2 space-y-1">
              {todo.map(s => (
                <li key={s.id} className="flex items-center gap-2 min-h-[40px]">
                  <button type="button" onClick={() => openSale(s)} className="min-w-0 flex-1 text-left">
                    <span className="block text-subhead font-medium truncate">{s.itemName}</span>
                    <span className="block text-footnote text-label-2 truncate">{fmtDate(s.date)}{s.buyer ? ` · ${s.buyer}` : ''} · {peso(s.totalAmount)}</span>
                  </button>
                  {!isPaid(s) && <button type="button" onClick={() => ops.patchSale(s.id, { paymentStatus: 'Paid' })} className="h-7 px-2.5 rounded-full bg-orange-soft text-orange-ink text-footnote font-semibold pressable" title="Mark paid">Unpaid</button>}
                  {s.status !== 'Shipped' && <button type="button" onClick={() => ops.patchSale(s.id, { status: 'Shipped' })} className="h-7 px-2.5 rounded-full bg-tint-soft text-tint-ink text-footnote font-semibold pressable" title="Mark shipped">{s.status}</button>}
                </li>
              ))}
            </ul>
          ) : <p className="text-subhead text-label-2 mt-2">Everything is paid and shipped.</p>}
          {recent.length > 0 && (
            <>
              <h3 className="text-footnote font-semibold uppercase tracking-wide text-label-2 mt-4 mb-1">Recent</h3>
              <ul className="space-y-0.5">
                {recent.map(s => (
                  <li key={s.id} className="flex items-center gap-2 text-subhead">
                    <span className="text-footnote text-label-2 w-[52px] shrink-0 tabular">{fmtDate(s.date)}</span>
                    <span className="min-w-0 flex-1 truncate">{s.itemName}</span>
                    <span className="tabular font-medium">{peso(s.totalAmount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Inventory ───────────────────────────────────────────────────────────────

function Inventory({ inventory, categories, ops, onEdit, onAdd }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [show, setShow] = useState('stock');
  const st = stock(inventory);
  const list = inventory
    .filter(i => (show === 'stock' ? num(i.quantity) > 0 : show === 'out' ? num(i.quantity) <= 0 : true))
    .filter(i => cat === 'all' || (i.category || '') === cat)
    .filter(i => !q.trim() || [i.name, i.sku, i.category, i.batchCode].join(' ').toLowerCase().includes(q.trim().toLowerCase()));

  const exportCsv = () => downloadCsv(`inventory-${ymd()}.csv`, [
    ['Name', 'SKU', 'Category', 'Batch', 'Quantity', 'Cost each', 'Target each', 'Stock cost', 'Added'],
    ...inventory.map(i => [i.name, i.sku, i.category, i.batchCode, num(i.quantity), num(i.costPrice), num(i.targetPrice), num(i.costPrice) * num(i.quantity), i.addedAt || '']),
  ]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlassStat label="Items in stock" value={String(st.skus)} sub={`${st.units} units`} />
        <GlassStat label="Stock at cost" value={peso(st.cost)} />
        <GlassStat label="At target prices" value={peso(st.target)} />
        <GlassStat label="Profit if sold at target" value={peso(st.target - st.cost)} sub={st.target ? `${pct((st.target - st.cost) / st.target)} margin` : null} />
      </div>

      <Toolbar q={q} setQ={setQ} placeholder="Search name, SKU, batch">
        <FilterSelect label="Show" value={show} onChange={setShow} options={[{ value: 'stock', label: 'In stock' }, { value: 'out', label: 'Sold out' }, { value: 'all', label: 'All items' }]} />
        {categories.length > 0 && <FilterSelect label="Category" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All categories' }, ...categories.map(c => ({ value: c, label: c }))]} />}
        <Button size="sm" variant="gray" onClick={exportCsv} disabled={!inventory.length}><Download className="w-4 h-4" aria-hidden />CSV</Button>
      </Toolbar>

      {list.length ? (
        <div className="rounded-[18px] bg-surface overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_70px_110px_110px_80px_150px] gap-3 px-4 py-2 text-footnote font-medium text-label-2 shadow-[inset_0_-0.5px_0_var(--separator)]">
            <span>Item</span><span className="text-right">Qty</span><span className="text-right">Cost each</span><span className="text-right">Target each</span><span className="text-right">Margin</span><span />
          </div>
          <ul>
            {list.map(i => {
              const cost = num(i.costPrice), target = num(i.targetPrice), qty = num(i.quantity);
              const margin = target > 0 ? (target - cost) / target : null;
              return (
                <li key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_70px_110px_110px_80px_150px] gap-x-3 gap-y-1 items-center px-4 py-3 shadow-[inset_0_-0.5px_0_var(--separator)] last:shadow-none">
                  <div className="min-w-0">
                    <p className="text-subhead font-semibold truncate">{i.name}</p>
                    <p className="text-footnote text-label-2 truncate">{[i.sku, i.category, i.batchCode && `Batch ${i.batchCode}`].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className={`text-right text-subhead tabular font-semibold ${qty <= 0 ? 'text-label-3' : ''}`}><span className="md:hidden text-label-2 font-normal">Qty </span>{qty}</span>
                  <span className="hidden md:block text-right text-subhead tabular">{peso(cost)}</span>
                  <span className="hidden md:block text-right text-subhead tabular">{target ? peso(target) : '—'}</span>
                  <span className={`hidden md:block text-right text-subhead tabular ${margin != null && margin < 0 ? 'text-red-ink' : 'text-label-2'}`}>{margin != null ? pct(margin) : '—'}</span>
                  <p className="md:hidden col-span-2 text-footnote text-label-2 tabular">{peso(cost)} cost · {target ? `${peso(target)} target` : 'no target'}{margin != null ? ` · ${pct(margin)}` : ''}</p>
                  <div className="col-span-2 md:col-span-1 flex justify-end gap-1">
                    <Button size="sm" variant="tinted" onClick={() => ops.sell(i)} disabled={qty <= 0}>Sell</Button>
                    <IconBtn label={`Edit ${i.name}`} onClick={() => onEdit(i)}><Pencil className="w-4 h-4" aria-hidden /></IconBtn>
                    <IconBtn label={`Delete ${i.name}`} onClick={() => ops.removeItem(i)} danger><Trash2 className="w-4 h-4" aria-hidden /></IconBtn>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-[18px] bg-surface">
          <EmptyState icon={<Package className="w-6 h-6" aria-hidden />} title={inventory.length ? 'Nothing matches' : 'No inventory yet'}
            action={!inventory.length && <Button onClick={onAdd}><Plus className="w-4 h-4" aria-hidden />Add item</Button>}>
            {inventory.length ? 'Try another search or filter.' : 'Add the cards you have to track stock, cost and profit.'}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

// ─── Sales ───────────────────────────────────────────────────────────────────

function Sales({ sales, ops, onEdit, onAdd }) {
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState('all');
  const [type, setType] = useState('all');
  const [pay, setPay] = useState('all');
  const [ship, setShip] = useState('all');
  const r = periodRange(period);
  const list = sales
    .filter(s => inRange(s, r))
    .filter(s => type === 'all' || s.saleType === type)
    .filter(s => pay === 'all' || s.paymentStatus === pay)
    .filter(s => ship === 'all' || s.status === ship)
    .filter(s => !q.trim() || [s.itemName, s.buyer, s.platform, s.notes].join(' ').toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const t = totals(list);
  const nextShip = (s) => SHIP[(SHIP.indexOf(s.status) + 1) % SHIP.length];

  const exportCsv = () => downloadCsv(`sales-${ymd()}.csv`, [
    ['Date', 'Item', 'Type', 'Qty', 'Total', 'Cost each', 'Profit', 'Payment', 'Shipping', 'Buyer', 'Platform', 'Notes'],
    ...list.map(s => [s.date, s.itemName, s.saleType, unitsOf(s), num(s.totalAmount), num(s.costPrice), profitOf(s), s.paymentStatus, s.status, s.buyer, s.platform, s.notes]),
  ]);

  return (
    <div className="space-y-4">
      <Toolbar q={q} setQ={setQ} placeholder="Search item, buyer, platform">
        <FilterSelect label="Period" value={period} onChange={setPeriod} options={PERIODS} />
        <FilterSelect label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...SALE_TYPES.map(x => ({ value: x, label: x }))]} />
        <FilterSelect label="Payment" value={pay} onChange={setPay} options={[{ value: 'all', label: 'Paid & unpaid' }, { value: 'Paid', label: 'Paid' }, { value: 'Unpaid', label: 'Unpaid' }]} />
        <FilterSelect label="Shipping" value={ship} onChange={setShip} options={[{ value: 'all', label: 'Any shipping' }, ...SHIP.map(x => ({ value: x, label: x }))]} />
        <Button size="sm" variant="gray" onClick={exportCsv} disabled={!list.length}><Download className="w-4 h-4" aria-hidden />CSV</Button>
      </Toolbar>

      {list.length > 0 && (
        <p className="text-subhead text-label-2 tabular px-1">
          {t.count} sales · <span className="font-semibold text-label">{peso(t.revenue)}</span> paid · profit{' '}
          <span className={`font-semibold ${t.profit < 0 ? 'text-red-ink' : 'text-label'}`}>{peso(t.profit)}</span>
          {t.owed > 0 && <> · {peso(t.owed)} unpaid</>}
        </p>
      )}

      {list.length ? (
        <div className="rounded-[18px] bg-surface overflow-hidden">
          <div className="hidden md:grid grid-cols-[64px_minmax(0,1fr)_80px_110px_100px_90px_100px_72px] gap-3 px-4 py-2 text-footnote font-medium text-label-2 shadow-[inset_0_-0.5px_0_var(--separator)]">
            <span>Date</span><span>Item</span><span>Type</span><span className="text-right">Total</span><span className="text-right">Profit</span><span>Payment</span><span>Shipping</span><span />
          </div>
          <ul>
            {list.map(s => {
              const p = profitOf(s);
              return (
                <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[64px_minmax(0,1fr)_80px_110px_100px_90px_100px_72px] gap-x-3 gap-y-1.5 items-center px-4 py-3 shadow-[inset_0_-0.5px_0_var(--separator)] last:shadow-none">
                  <span className="hidden md:block text-footnote text-label-2 tabular">{fmtDate(s.date)}</span>
                  <div className="min-w-0">
                    <p className="text-subhead font-semibold truncate">{s.itemName}</p>
                    <p className="text-footnote text-label-2 truncate"><span className="md:hidden">{fmtDate(s.date)} · {s.saleType} · </span>{[unitsOf(s) > 1 && `${unitsOf(s)} units`, s.buyer, s.platform].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <span className="hidden md:block"><Chip>{s.saleType}</Chip></span>
                  <span className="text-right text-subhead font-semibold tabular">{peso(s.totalAmount)}
                    <span className={`md:hidden block text-footnote font-medium ${p < 0 ? 'text-red-ink' : 'text-green-ink'}`}>{p >= 0 ? '+' : ''}{peso(p)}</span>
                  </span>
                  <span className={`hidden md:block text-right text-subhead tabular font-medium ${p < 0 ? 'text-red-ink' : 'text-green-ink'}`}>{p >= 0 ? '+' : ''}{peso(p)}</span>
                  <div className="col-span-2 md:contents flex items-center gap-2">
                    <button type="button" onClick={() => ops.patchSale(s.id, { paymentStatus: isPaid(s) ? 'Unpaid' : 'Paid' })} title="Tap to change" aria-label={`${s.itemName}: ${s.paymentStatus}. Change`}
                      className={`h-7 px-2.5 rounded-full text-footnote font-semibold justify-self-start pressable ${isPaid(s) ? 'bg-green-soft text-green-ink' : 'bg-orange-soft text-orange-ink'}`}>{s.paymentStatus}</button>
                    <button type="button" onClick={() => ops.patchSale(s.id, { status: nextShip(s) })} title={`Tap for ${nextShip(s)}`} aria-label={`${s.itemName}: ${s.status}. Change to ${nextShip(s)}`}
                      className={`h-7 px-2.5 rounded-full text-footnote font-semibold justify-self-start whitespace-nowrap pressable ${s.status === 'Shipped' ? 'bg-fill text-label-2' : s.status === 'On Hold' ? 'bg-red-soft text-red-ink' : 'bg-tint-soft text-tint-ink'}`}>{s.status}</button>
                    <div className="ml-auto md:ml-0 flex justify-end gap-1">
                      <IconBtn label={`Edit sale of ${s.itemName}`} onClick={() => onEdit(s)}><Pencil className="w-4 h-4" aria-hidden /></IconBtn>
                      <IconBtn label={`Delete sale of ${s.itemName}`} onClick={() => ops.removeSale(s)} danger><Trash2 className="w-4 h-4" aria-hidden /></IconBtn>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-[18px] bg-surface">
          <EmptyState icon={<ReceiptText className="w-6 h-6" aria-hidden />} title={sales.length ? 'Nothing matches' : 'No sales yet'}
            action={!sales.length && <Button onClick={onAdd}><Plus className="w-4 h-4" aria-hidden />Record sale</Button>}>
            {sales.length ? 'Try another search or filter.' : 'Record a sale here, or use Sell on an inventory item.'}
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
          className="w-full h-9 pl-9 pr-3 rounded-full bg-surface text-subhead outline-none focus:ring-2 focus:ring-tint placeholder:text-label-3" />
      </label>
      {children}
    </div>
  );
}

function IconBtn({ label, onClick, danger, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`w-8 h-8 rounded-full flex items-center justify-center pressable ${danger ? 'text-label-3 hover:text-red-ink hover:bg-red-soft' : 'text-label-2 hover:text-label hover:bg-fill'}`}>
      {children}
    </button>
  );
}
