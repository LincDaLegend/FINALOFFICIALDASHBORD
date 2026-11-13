'use client';

// Add / edit an inventory item, record / edit a sale (picked from inventory), add / edit an expense.
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Segmented, Button } from '../ui.jsx';
import { genId } from '../store.js';
import { Sheet, Field, inputCls } from './bizUi.jsx';
import { SALE_TYPES, EXPENSE_CATEGORIES, peso, pct, num, ymd, newItem } from './bizData.js';

const blankItem = { name: '', sku: '', category: '', batchCode: '', costPrice: '', targetPrice: '', quantity: '1' };

export function ItemForm({ open, item, categories, onClose, onSave }) {
  const [f, setF] = useState(blankItem);
  useEffect(() => {
    if (!open) return;
    setF(item ? {
      name: item.name || '', sku: item.sku || '', category: item.category || '', batchCode: item.batchCode || '',
      costPrice: String(item.costPrice ?? ''), targetPrice: String(item.targetPrice ?? ''), quantity: String(item.quantity ?? 0),
    } : blankItem);
  }, [open, item]);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  const cost = num(f.costPrice), target = num(f.targetPrice);
  const ok = f.name.trim().length > 0;

  const save = (e) => {
    e.preventDefault();
    if (!ok) return;
    onSave(item
      ? { ...item, name: f.name.trim(), sku: f.sku.trim() || item.sku, category: f.category.trim(), batchCode: f.batchCode.trim(),
          costPrice: cost, targetPrice: target, quantity: Math.max(0, Math.round(num(f.quantity))) }
      : newItem(f));
  };

  return (
    <Sheet open={open} title={item ? 'Edit item' : 'Add item'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3 pt-1">
        <Field label="Name"><input autoFocus value={f.name} onChange={set('name')} placeholder="2023 Prizm Wembanyama RC PSA 10" className={inputCls} maxLength={140} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost each (₱)"><input value={f.costPrice} onChange={set('costPrice')} inputMode="decimal" type="number" min={0} step="any" className={`${inputCls} tabular`} /></Field>
          <Field label="Target price each (₱)"><input value={f.targetPrice} onChange={set('targetPrice')} inputMode="decimal" type="number" min={0} step="any" className={`${inputCls} tabular`} /></Field>
          <Field label="Quantity"><input value={f.quantity} onChange={set('quantity')} inputMode="numeric" type="number" min={0} step={1} className={`${inputCls} tabular`} /></Field>
          <Field label="Category">
            <input value={f.category} onChange={set('category')} list="biz-categories" placeholder="Basketball" className={inputCls} maxLength={40} />
            <datalist id="biz-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="SKU"><input value={f.sku} onChange={set('sku')} placeholder="Auto" className={inputCls} maxLength={40} /></Field>
          <Field label="Batch"><input value={f.batchCode} onChange={set('batchCode')} placeholder="Optional" className={inputCls} maxLength={30} /></Field>
        </div>
        {target > 0 && (
          <p className="text-subhead text-label-2 tabular">
            Profit at target <span className={`font-medium ${target - cost >= 0 ? 'text-green-ink' : 'text-red-ink'}`}>{peso(target - cost)}</span> each
            {cost > 0 && <> · {pct((target - cost) / target)} margin</>}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="gray" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!ok}>{item ? 'Save' : 'Add item'}</Button>
        </div>
      </form>
    </Sheet>
  );
}

const blankSale = () => ({ inventoryId: '', itemName: '', unitPrice: '', quantity: '1', costPrice: '', saleType: 'Sale', paymentStatus: 'Paid', buyer: '', date: ymd(), notes: '' });

/**
 * Record a sale: pick the item from inventory (its cost fills in and its stock goes down when saved),
 * or switch to an item that isn't in inventory. `preset` = the inventory item to sell.
 */
export function SaleForm({ open, sale, preset, inventory, onClose, onSave }) {
  const [f, setF] = useState(blankSale);
  const [free, setFree] = useState(false); // not from inventory
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open) return;
    setQ('');
    if (sale) {
      const n = Math.max(1, Math.round(num(sale.quantity) || 1));
      setF({ ...blankSale(), ...sale, inventoryId: sale.inventoryId || '', unitPrice: String(+(num(sale.totalAmount) / n).toFixed(2)), quantity: String(n),
        costPrice: String(sale.costPrice ?? ''), buyer: sale.buyer || '', notes: sale.notes || '', date: sale.date || ymd() });
      setFree(!sale.inventoryId);
    } else if (preset) {
      setF({ ...blankSale(), inventoryId: preset.id, itemName: preset.name, unitPrice: preset.targetPrice ? String(preset.targetPrice) : '', costPrice: String(preset.costPrice ?? '') });
      setFree(false);
    } else { setF(blankSale()); setFree(false); }
  }, [open, sale, preset]);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));

  const linked = inventory.find(i => i.id === f.inventoryId);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return inventory
      .filter(i => num(i.quantity) > 0)
      .filter(i => !t || [i.name, i.sku, i.batchCode, i.category].join(' ').toLowerCase().includes(t))
      .slice(0, 6);
  }, [inventory, q]);
  const pick = (it) => setF(x => ({ ...x, inventoryId: it.id, itemName: it.name, costPrice: String(it.costPrice ?? ''), unitPrice: x.unitPrice || (it.targetPrice ? String(it.targetPrice) : '') }));

  const n = Math.max(1, Math.round(num(f.quantity) || 1));
  const total = num(f.unitPrice) * n, cost = num(f.costPrice) * n;
  // Stock available for this sale (editing gives back what the sale already took)
  const available = linked ? num(linked.quantity) + (sale && sale.inventoryId === linked.id ? Math.max(1, Math.round(num(sale.quantity) || 1)) : 0) : Infinity;
  const hasItem = free ? f.itemName.trim() : !!linked;
  const ok = hasItem && f.unitPrice !== '' && num(f.unitPrice) >= 0 && n <= available;

  const save = (e) => {
    e.preventDefault();
    if (!ok) return;
    onSave({
      ...(sale || {}),
      id: sale?.id || genId(), itemName: (free ? f.itemName : linked.name).trim(), inventoryId: free ? null : linked.id, costPrice: num(f.costPrice),
      totalAmount: +total.toFixed(2), quantity: n, saleType: f.saleType, paymentStatus: f.paymentStatus,
      status: sale?.status || 'Shipped', buyer: f.buyer.trim(), platform: sale?.platform || '', date: f.date || ymd(), notes: f.notes.trim(),
    });
  };

  return (
    <Sheet open={open} title={sale ? 'Edit sale' : 'Record sale'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3 pt-1">
        {free ? (
          <Field label="Item (not in inventory)">
            <input autoFocus value={f.itemName} onChange={set('itemName')} placeholder="What you sold" className={inputCls} maxLength={140} />
          </Field>
        ) : linked ? (
          <div>
            <span className="block text-footnote text-label-2 mb-1">Item</span>
            <div className="flex items-center gap-3 rounded-[10px] bg-fill px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-callout truncate">{linked.name}</p>
                <p className="flex items-center gap-2 mt-0.5 text-footnote text-label-2">
                  {linked.sku && <span className="biz-cert">{linked.sku}</span>}
                  <span className="tabular">{Number.isFinite(available) ? available : num(linked.quantity)} in stock · cost {peso(linked.costPrice)}</span>
                </p>
              </div>
              <button type="button" onClick={() => setF(x => ({ ...x, inventoryId: '' }))} className="text-subhead text-tint-ink shrink-0">Change</button>
            </div>
          </div>
        ) : (
          <div>
            <span className="block text-footnote text-label-2 mb-1">Item from inventory</span>
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-label-2" aria-hidden />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, SKU, batch" aria-label="Search inventory" className={`${inputCls} pl-9`} />
            </label>
            <ul className="mt-2 space-y-1" aria-label="Inventory items">
              {matches.map(it => (
                <li key={it.id}>
                  <button type="button" onClick={() => pick(it)} className="w-full flex items-center gap-3 rounded-[10px] px-3 py-2 text-left hover:bg-fill transition-colors">
                    <span className="min-w-0 flex-1">
                      <span className="block text-subhead truncate">{it.name}</span>
                      <span className="flex items-center gap-2 mt-0.5 text-footnote text-label-2">{it.sku && <span className="biz-cert">{it.sku}</span>}{num(it.quantity)} in stock</span>
                    </span>
                    <span className="text-subhead tabular text-label-2">{peso(it.targetPrice || it.costPrice)}</span>
                  </button>
                </li>
              ))}
              {!matches.length && <li className="px-3 py-2 text-subhead text-label-2">{inventory.some(i => num(i.quantity) > 0) ? 'No match in stock' : 'Nothing in stock'}</li>}
            </ul>
          </div>
        )}
        <button type="button" onClick={() => setFree(v => !v)} className="text-subhead text-tint-ink">
          {free ? 'Pick from inventory instead' : 'Not in inventory'}
        </button>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Price each (₱)"><input autoFocus={!!preset} value={f.unitPrice} onChange={set('unitPrice')} inputMode="decimal" type="number" min={0} step="any" className={`${inputCls} tabular`} /></Field>
          <Field label="Qty"><input value={f.quantity} onChange={set('quantity')} inputMode="numeric" type="number" min={1} max={Number.isFinite(available) ? available : undefined} step={1} className={`${inputCls} tabular`} /></Field>
          <Field label="Cost each (₱)"><input value={f.costPrice} onChange={set('costPrice')} inputMode="decimal" type="number" min={0} step="any" className={`${inputCls} tabular`} /></Field>
        </div>
        {n > available && <p className="text-subhead text-red-ink">Only {available} in stock</p>}
        <p className="text-subhead text-label-2 tabular">
          Total <span className="font-medium text-label">{peso(total)}</span> · Profit{' '}
          <span className={`font-medium ${total - cost >= 0 ? 'text-green-ink' : 'text-red-ink'}`}>{peso(total - cost)}</span>
          {total > 0 && <> · {pct((total - cost) / total)} margin</>}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" value={f.date} onChange={set('date')} className={`${inputCls} tabular`} /></Field>
          <Field label="Buyer"><input value={f.buyer} onChange={set('buyer')} placeholder="Optional" className={inputCls} maxLength={80} /></Field>
          <Field label="Type"><Segmented label="Sale type" size="sm" value={f.saleType} onChange={v => setF(x => ({ ...x, saleType: v }))} options={SALE_TYPES.map(t => ({ value: t, label: t }))} /></Field>
          <Field label="Payment"><Segmented label="Payment" size="sm" value={f.paymentStatus} onChange={v => setF(x => ({ ...x, paymentStatus: v }))} options={[{ value: 'Paid', label: 'Paid' }, { value: 'Unpaid', label: 'Not yet' }]} /></Field>
        </div>
        <Field label="Notes"><textarea value={f.notes} onChange={set('notes')} rows={2} maxLength={500} placeholder="Optional" className={`${inputCls} h-auto py-2 resize-y`} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="gray" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!ok}>{sale ? 'Save' : 'Record sale'}</Button>
        </div>
      </form>
    </Sheet>
  );
}

const blankExpense = () => ({ description: '', amount: '', category: 'Supplies', date: ymd(), notes: '' });

export function ExpenseForm({ open, expense, categories, onClose, onSave }) {
  const [f, setF] = useState(blankExpense);
  useEffect(() => {
    if (!open) return;
    setF(expense ? { description: expense.description || '', amount: String(expense.amount ?? ''), category: expense.category || 'Other', date: expense.date || ymd(), notes: expense.notes || '' } : blankExpense());
  }, [open, expense]);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  const ok = f.description.trim() && num(f.amount) > 0;
  const save = (e) => {
    e.preventDefault();
    if (!ok) return;
    onSave({ ...(expense || {}), id: expense?.id || genId(), description: f.description.trim(), amount: num(f.amount), category: f.category.trim() || 'Other', date: f.date || ymd(), notes: f.notes.trim() });
  };
  return (
    <Sheet open={open} title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3 pt-1">
        <Field label="What for"><input autoFocus value={f.description} onChange={set('description')} placeholder="Top-loaders, 100 pcs" className={inputCls} maxLength={120} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₱)"><input value={f.amount} onChange={set('amount')} inputMode="decimal" type="number" min={0} step="any" className={`${inputCls} tabular`} /></Field>
          <Field label="Date"><input type="date" value={f.date} onChange={set('date')} className={`${inputCls} tabular`} /></Field>
        </div>
        <Field label="Category">
          <input value={f.category} onChange={set('category')} list="biz-expense-categories" className={inputCls} maxLength={40} />
          <datalist id="biz-expense-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Notes"><textarea value={f.notes} onChange={set('notes')} rows={2} maxLength={500} placeholder="Optional" className={`${inputCls} h-auto py-2 resize-y`} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="gray" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!ok}>{expense ? 'Save' : 'Add expense'}</Button>
        </div>
      </form>
    </Sheet>
  );
}

export { EXPENSE_CATEGORIES };
