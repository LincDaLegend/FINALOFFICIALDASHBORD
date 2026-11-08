'use client';

// Add / edit an inventory item, and record / edit a sale.
import { useEffect, useMemo, useState } from 'react';
import { Segmented, Button } from '../ui.jsx';
import { genId } from '../store.js';
import { Sheet, Field, inputCls } from './bizUi.jsx';
import { SALE_TYPES, SHIP, PAY, peso, pct, num, ymd, newItem } from './bizData.js';

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
          <Field label="Category">
            <input value={f.category} onChange={set('category')} list="biz-categories" placeholder="Basketball" className={inputCls} maxLength={40} />
            <datalist id="biz-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Batch"><input value={f.batchCode} onChange={set('batchCode')} placeholder="B-12" className={inputCls} maxLength={30} /></Field>
          <Field label="Cost each (₱)"><input value={f.costPrice} onChange={set('costPrice')} inputMode="decimal" type="number" min={0} step="any" className={`${inputCls} tabular`} /></Field>
          <Field label="Target price each (₱)"><input value={f.targetPrice} onChange={set('targetPrice')} inputMode="decimal" type="number" min={0} step="any" className={`${inputCls} tabular`} /></Field>
          <Field label="Quantity"><input value={f.quantity} onChange={set('quantity')} inputMode="numeric" type="number" min={0} step={1} className={`${inputCls} tabular`} /></Field>
          <Field label="SKU"><input value={f.sku} onChange={set('sku')} placeholder="Auto" className={inputCls} maxLength={40} /></Field>
        </div>
        {target > 0 && (
          <p className="text-subhead text-label-2 tabular">
            Profit at target: <span className={`font-semibold ${target - cost >= 0 ? 'text-green-ink' : 'text-red-ink'}`}>{peso(target - cost)}</span> each
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

const blankSale = () => ({
  inventoryId: '', itemName: '', unitPrice: '', quantity: '1', costPrice: '', saleType: 'Sale', status: 'To Ship', paymentStatus: 'Paid',
  buyer: '', platform: '', date: ymd(), notes: '',
});

/**
 * Record a sale (optionally from an inventory item: its cost fills in and its stock goes down),
 * or edit one. `preset` = an inventory item to sell.
 */
export function SaleForm({ open, sale, preset, inventory, platforms, onClose, onSave }) {
  const [f, setF] = useState(blankSale);
  useEffect(() => {
    if (!open) return;
    if (sale) {
      const q = Math.max(1, Math.round(num(sale.quantity) || 1));
      setF({ ...blankSale(), ...sale, inventoryId: sale.inventoryId || '', unitPrice: String(+(num(sale.totalAmount) / q).toFixed(2)), quantity: String(q),
        costPrice: String(sale.costPrice ?? ''), buyer: sale.buyer || '', platform: sale.platform || '', notes: sale.notes || '', date: sale.date || ymd() });
    } else if (preset) {
      setF({ ...blankSale(), inventoryId: preset.id, itemName: preset.name, unitPrice: preset.targetPrice ? String(preset.targetPrice) : '', costPrice: String(preset.costPrice ?? '') });
    } else setF(blankSale());
  }, [open, sale, preset]);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));

  // Items you can sell: in stock, plus the one this sale already came from
  const choices = useMemo(() => inventory.filter(i => num(i.quantity) > 0 || i.id === f.inventoryId), [inventory, f.inventoryId]);
  const linked = inventory.find(i => i.id === f.inventoryId);
  const pick = (id) => {
    const it = inventory.find(i => i.id === id);
    setF(x => ({ ...x, inventoryId: id, itemName: it ? it.name : x.itemName, costPrice: it ? String(it.costPrice ?? '') : x.costPrice,
      unitPrice: it && !x.unitPrice && it.targetPrice ? String(it.targetPrice) : x.unitPrice }));
  };
  const q = Math.max(1, Math.round(num(f.quantity) || 1));
  const total = num(f.unitPrice) * q, cost = num(f.costPrice) * q;
  // Stock available for this sale (editing gives back what the sale already took)
  const available = linked ? num(linked.quantity) + (sale && sale.inventoryId === linked.id ? Math.max(1, Math.round(num(sale.quantity) || 1)) : 0) : Infinity;
  const ok = f.itemName.trim() && num(f.unitPrice) >= 0 && f.unitPrice !== '' && q <= available;

  const save = (e) => {
    e.preventDefault();
    if (!ok) return;
    onSave({
      id: sale?.id || genId(), itemName: f.itemName.trim(), inventoryId: f.inventoryId || null, costPrice: num(f.costPrice),
      totalAmount: +total.toFixed(2), quantity: q, saleType: f.saleType, status: f.status, paymentStatus: f.paymentStatus,
      buyer: f.buyer.trim(), platform: f.platform.trim(), date: f.date || ymd(), notes: f.notes.trim(),
    });
  };

  return (
    <Sheet open={open} title={sale ? 'Edit sale' : 'Record sale'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3 pt-1">
        <Field label="From inventory">
          <select value={f.inventoryId} onChange={e => pick(e.target.value)} className={`${inputCls} cursor-pointer`}>
            <option value="">Not from inventory</option>
            {choices.map(i => <option key={i.id} value={i.id}>{i.name}{` (${num(i.quantity)} left)`}</option>)}
          </select>
        </Field>
        <Field label="Item"><input value={f.itemName} onChange={set('itemName')} placeholder="What you sold" className={inputCls} maxLength={140} disabled={!!linked} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Price each (₱)"><input autoFocus={!!preset} value={f.unitPrice} onChange={set('unitPrice')} inputMode="decimal" type="number" min={0} step="any" className={`${inputCls} tabular`} /></Field>
          <Field label="Qty"><input value={f.quantity} onChange={set('quantity')} inputMode="numeric" type="number" min={1} max={Number.isFinite(available) ? available : undefined} step={1} className={`${inputCls} tabular`} /></Field>
          <Field label="Cost each (₱)"><input value={f.costPrice} onChange={set('costPrice')} inputMode="decimal" type="number" min={0} step="any" className={`${inputCls} tabular`} /></Field>
        </div>
        {q > available && <p className="text-subhead text-red-ink">Only {available} in stock.</p>}
        <p className="text-subhead text-label-2 tabular">
          Total <span className="font-semibold text-label">{peso(total)}</span> · Profit{' '}
          <span className={`font-semibold ${total - cost >= 0 ? 'text-green-ink' : 'text-red-ink'}`}>{peso(total - cost)}</span>
          {total > 0 && <> · {pct((total - cost) / total)} margin</>}
        </p>
        <Field label="Type"><Segmented label="Sale type" value={f.saleType} onChange={v => setF(x => ({ ...x, saleType: v }))} options={SALE_TYPES.map(t => ({ value: t, label: t }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payment"><Segmented label="Payment" value={f.paymentStatus} onChange={v => setF(x => ({ ...x, paymentStatus: v }))} options={PAY.map(t => ({ value: t, label: t }))} /></Field>
          <Field label="Shipping">
            <select value={f.status} onChange={set('status')} className={`${inputCls} h-9 cursor-pointer`}>{SHIP.map(s => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="Buyer"><input value={f.buyer} onChange={set('buyer')} placeholder="Name or handle" className={inputCls} maxLength={80} /></Field>
          <Field label="Platform">
            <input value={f.platform} onChange={set('platform')} list="biz-platforms" placeholder="eBay, Facebook…" className={inputCls} maxLength={40} />
            <datalist id="biz-platforms">{platforms.map(p => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Date"><input type="date" value={f.date} onChange={set('date')} className={`${inputCls} tabular`} /></Field>
        </div>
        <Field label="Notes"><textarea value={f.notes} onChange={set('notes')} rows={2} maxLength={500} className={`${inputCls} h-auto py-2 resize-y`} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="gray" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!ok}>{sale ? 'Save' : 'Record sale'}</Button>
        </div>
      </form>
    </Sheet>
  );
}
