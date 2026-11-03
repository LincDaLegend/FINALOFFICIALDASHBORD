'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, CheckCircle2, CircleAlert, Download, Upload, Check } from 'lucide-react';
import { useSettings, updateSettings } from './stores.js';
import { useWatchlist } from './watchlistHooks.js';
import { Page, Group, Row, useToast, ConfirmDialog } from './ui.jsx';
import { NumberRow } from './FindCards.jsx';

/** Label on the left, field on the right — saves when you leave the field (no Save button). */
function FieldRow({ label, value, onSave, placeholder, secret }) {
  const [draft, setDraft] = useState(value || '');
  const [show, setShow] = useState(false);
  useEffect(() => { setDraft(value || ''); }, [value]);
  const commit = () => { const v = draft.trim(); if (v !== (value || '')) onSave(v); };
  return (
    <Row title={label} className="!items-center">
      <span className="flex items-center gap-1 flex-[2] min-w-0">
        <input type={secret && !show ? 'password' : 'text'} value={draft} placeholder={placeholder}
          autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label={label}
          onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-full min-w-0 bg-transparent text-right text-body text-label placeholder:text-label-3 placeholder:font-sans outline-none focus:text-tint-ink font-mono text-[15px]" />
        {secret && draft && (
          <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide' : 'Show'}
            className="w-8 h-8 -mr-1.5 flex items-center justify-center text-label-2 pressable">
            {show ? <EyeOff className="w-[18px] h-[18px]" aria-hidden /> : <Eye className="w-[18px] h-[18px]" aria-hidden />}
          </button>
        )}
      </span>
    </Row>
  );
}

function useKeyStatus(settings) {
  const [status, setStatus] = useState({ ebay: null, rapid: null });
  useEffect(() => {
    let live = true;
    const headers = {};
    if (settings.ebayKey) headers['x-ebay-key'] = settings.ebayKey;
    if (settings.ebaySecret) headers['x-ebay-secret'] = settings.ebaySecret;
    // With no search words, these routes only check that keys exist (in the browser or on the server)
    fetch('/api/ebay/search', { headers }).then(r => live && setStatus(s => ({ ...s, ebay: r.ok }))).catch(() => {});
    fetch('/api/ebay/sold?q=', { headers: settings.rapidApiKey ? { 'x-rapidapi-key': settings.rapidApiKey } : {} })
      .then(r => r.json()).then(d => live && setStatus(s => ({ ...s, rapid: d?.error !== 'no apiKey' }))).catch(() => {});
    return () => { live = false; };
  }, [settings.ebayKey, settings.ebaySecret, settings.rapidApiKey]);
  return status;
}

function Status({ ok, yes, no }) {
  if (ok == null) return null;
  return ok
    ? <span className="inline-flex items-center gap-1 text-green-ink font-semibold"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden />{yes}</span>
    : <span className="inline-flex items-center gap-1 text-orange-ink font-semibold"><CircleAlert className="w-3.5 h-3.5" aria-hidden />{no}</span>;
}

export default function Settings({ data, update }) {
  const settings = useSettings();
  const status = useKeyStatus(settings);
  const toast = useToast();
  const { items: watchItems, restore } = useWatchlist();
  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);
  const savedToast = () => toast('Saved', <Check className="w-4 h-4 text-green" strokeWidth={3} aria-hidden />);
  const save = (patch) => { updateSettings(patch); savedToast(); };

  const hasRecords = ['sales', 'inventory', 'expenses'].some(k => (data[k] || []).length > 0);

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ ...data, watchlistItems: watchItems }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `baller-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded', <Download className="w-4 h-4 text-tint" aria-hidden />);
  };

  const importData = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { watchlistItems, ...rest } = JSON.parse(ev.target.result);
        setConfirm({
          title: 'Replace your data?',
          message: 'Your current watchlist and records will be replaced with the backup.',
          confirmLabel: 'Replace',
          run: () => {
            update(() => rest);
            if (Array.isArray(watchlistItems)) restore(watchlistItems);
            toast('Backup restored', <Upload className="w-4 h-4 text-tint" aria-hidden />);
          },
        });
      } catch {
        toast('That file isn’t a Baller backup', <CircleAlert className="w-4 h-4 text-orange" aria-hidden />);
      }
    };
    reader.readAsText(file);
  };

  return (
    <Page title="Settings">
      <Group header="eBay"
        footer={<>
          <Status ok={status.ebay} yes="Search is ready." no="Search needs both keys." />{' '}
          Get them free at{' '}
          <a href="https://developer.ebay.com/my/keys" target="_blank" rel="noopener noreferrer" className="text-tint-ink">developer.ebay.com</a>
          {' '}→ Application Keys → Production. Stored only in this browser.
        </>}>
        <FieldRow label="App ID" placeholder="Required" value={settings.ebayKey} onSave={v => save({ ebayKey: v })} />
        <FieldRow label="Client Secret" placeholder="Required" secret value={settings.ebaySecret} onSave={v => save({ ebaySecret: v })} />
      </Group>

      <Group header="Sold Prices"
        footer={<>
          <Status ok={status.rapid} yes="Using real sold prices." no="Optional — makes deal scores more accurate." />{' '}
          Subscribe to{' '}
          <a href="https://rapidapi.com/ecommet/api/ebay-average-selling-price" target="_blank" rel="noopener noreferrer" className="text-tint-ink">eBay Average Selling Price</a>
          {' '}on RapidAPI and paste the key.
        </>}>
        <FieldRow label="RapidAPI Key" placeholder="Optional" secret value={settings.rapidApiKey} onSave={v => save({ rapidApiKey: v })} />
      </Group>

      <Group header="Pricing" footer="Used to turn eBay prices into pesos and suggest what to sell each card for.">
        <NumberRow label="Profit goal" suffix="%" value={settings.targetMarginPct} onCommit={n => save({ targetMarginPct: n })} />
        <NumberRow label="Shipping to your buyer" prefix="₱" value={settings.estShippingPhp} onCommit={n => save({ estShippingPhp: n })} />
        <NumberRow label="Exchange rate" prefix="$1 = ₱" step={0.1} value={settings.phpRate} onCommit={n => save({ phpRate: n })} />
      </Group>

      <Group header="Backup" footer="Your watchlist and settings live in this browser. Download a backup to move them or keep them safe.">
        <Row title="Download Backup" tint onClick={exportData} />
        <Row title="Restore from Backup…" tint onClick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={importData} className="hidden" />
      </Group>

      <Group>
        <Row title="Clear Watchlist" destructive onClick={() => watchItems.length && setConfirm({
          title: 'Clear your watchlist?', message: `All ${watchItems.length} saved cards will be removed. This can’t be undone.`,
          confirmLabel: 'Clear', run: () => { restore([]); toast('Watchlist cleared'); },
        })} value={watchItems.length || undefined} />
        {hasRecords && (
          <Row title="Delete Old Business Records" destructive onClick={() => setConfirm({
            title: 'Delete old records?', message: 'Sales, inventory and expenses saved by the earlier version of this app will be deleted.',
            confirmLabel: 'Delete', run: () => { update(prev => ({ ...prev, sales: [], inventory: [], expenses: [], shippingBatches: [] })); toast('Records deleted'); },
          })} />
        )}
      </Group>

      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.confirmLabel}
        onCancel={() => setConfirm(null)} onConfirm={() => { confirm.run(); setConfirm(null); }} />
    </Page>
  );
}
