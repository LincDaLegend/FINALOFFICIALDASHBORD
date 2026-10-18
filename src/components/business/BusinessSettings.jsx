import { useState } from 'react';
import { Settings, Save, Trash2, Download, Upload, AlertTriangle, X, CheckCircle, ExternalLink, Eye, EyeOff, TrendingUp } from 'lucide-react';
// Same JSON-encoded keys the search tab reads, so values round-trip without stray quotes
import { load, save, remove } from '../../legacy/utils/storage.js';
import { getWatchlist, setWatchlist } from '../../legacy/utils/watchlist.js';

export default function BusinessSettings({ data, update }) {
  const [phpRate, setPhpRate] = useState(data.phpRate || 57.2);
  const [saved, setSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState('');

  // eBay credentials — stored in the search tab's localStorage keys
  const [ebayKey,     setEbayKey]     = useState(() => load('ebayKey', ''));
  const [ebaySecret,  setEbaySecret]  = useState(() => load('ebaySecret', ''));
  const [ebayRuName,  setEbayRuName]  = useState(() => load('ebayRuName', ''));
  const [rapidApiKey, setRapidApiKey] = useState(() => load('rapidApiKey', ''));
  const [showSecret,  setShowSecret]  = useState(false);
  const [showRapid,   setShowRapid]   = useState(false);
  const [ebaySaved,   setEbaySaved]   = useState(false);
  const [rapidSaved,  setRapidSaved]  = useState(false);

  const ebayUser     = load('ebayUser', null);
  const ebayTokenExp = parseInt(load('ebayTokenExp', 0)) || 0;
  const tokenValid   = ebayTokenExp > Date.now() / 1000;

  const syncLegacy = (fn) => {
    import('../../legacy/utils/state.js').then(({ state, persistSettings }) => {
      fn(state);
      persistSettings?.();
    }).catch(() => {});
  };

  const flash = (setter) => { setter(true); setTimeout(() => setter(false), 2000); };

  const saveSettings = () => {
    const rate = parseFloat(phpRate) || data.phpRate;
    update(prev => ({ ...prev, phpRate: rate }));
    syncLegacy(s => { s.phpRate = rate; });
    flash(setSaved);
  };

  const saveEbayCredentials = () => {
    const k = ebayKey.trim(), s = ebaySecret.trim(), r = ebayRuName.trim();
    save('ebayKey', k); save('ebaySecret', s); save('ebayRuName', r);
    syncLegacy(st => { st.ebayKey = k; st.ebaySecret = s; st.ebayRuName = r; });
    flash(setEbaySaved);
  };

  const saveRapidApiKey = () => {
    const k = rapidApiKey.trim();
    save('rapidApiKey', k);
    remove('scpToken'); // old SportsCardsPro token — would otherwise be sent as the RapidAPI key
    syncLegacy(st => { st.rapidApiKey = k; });
    flash(setRapidSaved);
  };

  const clearEbayCredentials = () => {
    ['ebayKey', 'ebaySecret', 'ebayRuName', 'ebayToken', 'ebayTokenExp', 'ebayRefresh', 'ebayUser'].forEach(remove);
    setEbayKey(''); setEbaySecret(''); setEbayRuName('');
    syncLegacy(st => {
      st.ebayKey = ''; st.ebaySecret = ''; st.ebayRuName = '';
      st.ebayToken = null; st.ebayUser = null;
    });
  };

  const connectEbayAccount = () => {
    if (!ebayKey.trim() || !ebaySecret.trim() || !ebayRuName.trim()) return;
    // Save first, then trigger the search tab's OAuth flow
    saveEbayCredentials();
    setTimeout(() => window.connectEbayAccount?.(), 100);
  };

  const exportData = () => {
    const backup = { ...data, watchlistItems: getWatchlist() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baller-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { watchlistItems, ...rest } = JSON.parse(ev.target.result);
        update(() => rest);
        if (Array.isArray(watchlistItems)) setWatchlist(watchlistItems);
      } catch {
        alert('Invalid file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const resetSection = (section) => {
    if (section === 'watchlist') setWatchlist([]);
    if (section === 'records')   update(prev => ({ ...prev, sales: [], inventory: [], expenses: [], shippingBatches: [] }));
    setShowResetConfirm('');
  };

  const RESETS = {
    watchlist: { label: 'Clear Watchlist',            confirm: 'clear your whole watchlist' },
    records:   { label: 'Delete Old Business Records', confirm: 'delete your old sales, inventory and expense records' },
  };

  const Field = ({ label, hint, children }) => (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );

  const Section = ({ title, icon: Icon, children }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
        <div className="p-2 bg-slate-50 rounded-lg"><Icon className="w-4 h-4 text-slate-500" /></div>
        <span className="font-bold text-slate-700">{title}</span>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );

  const SaveButton = ({ onClick, done, label }) => (
    <button onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-700 transition-colors"
    >
      {done ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
      {done ? 'Saved!' : label}
    </button>
  );

  const ExtLink = ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-emerald-600 font-semibold hover:underline inline-flex items-center gap-1">
      {children} <ExternalLink className="w-3 h-3" />
    </a>
  );

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono";

  return (
    <div className="space-y-6 max-w-2xl">

      {/* General */}
      <Section title="General Settings" icon={Settings}>
        <div className="space-y-4">
          <Field label="PHP Exchange Rate (₱ per $1)" hint="Used to show eBay prices in pesos.">
            <input type="number" min="1" step="0.1" value={phpRate} onChange={e => setPhpRate(e.target.value)}
              className="w-40 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </Field>
          <SaveButton onClick={saveSettings} done={saved} label="Save Settings" />
        </div>
      </Section>

      {/* eBay API */}
      <Section title="eBay API Credentials" icon={Settings}>
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Get your keys at <ExtLink href="https://developer.ebay.com/my/keys">developer.ebay.com</ExtLink> → Application Keys (Production).
            You can also set them on the server instead — see the README.
          </p>

          <Field label="App ID (Client ID)">
            <input value={ebayKey} onChange={e => setEbayKey(e.target.value)}
              className={inputCls} placeholder="AppID-…" />
          </Field>

          <Field label="Client Secret (Cert ID)">
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={ebaySecret} onChange={e => setEbaySecret(e.target.value)}
                className={inputCls + " pr-10"} placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowSecret(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          <Field
            label="RuName"
            hint="Only needed to connect your eBay account (so watched items also land on your eBay watchlist). From eBay developer portal → User Tokens → Get a Token from eBay via Your Application."
          >
            <input value={ebayRuName} onChange={e => setEbayRuName(e.target.value)}
              className={inputCls} placeholder="YourApp-YourApp-Prod-…" />
          </Field>

          {/* Account status */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">eBay Account</p>
              {ebayUser
                ? <p className="text-sm font-semibold text-emerald-600">✓ Connected as {ebayUser}{tokenValid ? '' : ' (token expired)'}</p>
                : <p className="text-sm text-slate-400">Not connected</p>}
            </div>
            {ebayUser
              ? <button onClick={clearEbayCredentials}
                  className="text-xs font-bold text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                  Disconnect
                </button>
              : <button onClick={connectEbayAccount}
                  disabled={!ebayKey.trim() || !ebaySecret.trim() || !ebayRuName.trim()}
                  title={!ebayKey.trim() || !ebaySecret.trim() || !ebayRuName.trim() ? 'Fill in App ID, Client Secret and RuName first' : undefined}
                  className="text-xs font-bold bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Connect Account
                </button>}
          </div>

          <div className="flex gap-3">
            <SaveButton onClick={saveEbayCredentials} done={ebaySaved} label="Save Credentials" />
            {ebayKey && (
              <button onClick={clearEbayCredentials}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-sm hover:bg-red-100 transition-colors border border-red-100"
              >
                <X className="w-4 h-4" /> Clear All
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* Sold prices */}
      <Section title="Sold Prices (RapidAPI)" icon={TrendingUp}>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Subscribe to <ExtLink href="https://rapidapi.com/ecommet/api/ebay-average-selling-price">eBay Average Selling Price</ExtLink> on
            RapidAPI and paste your key here. It lets deal scores compare against real eBay sold prices.
            Or set <code className="font-mono text-slate-500">RAPIDAPI_KEY</code> on the server — see the README.
          </p>
          <div className="relative">
            <input
              type={showRapid ? 'text' : 'password'}
              value={rapidApiKey} onChange={e => setRapidApiKey(e.target.value)}
              className={inputCls + " pr-10"} placeholder="Your RapidAPI key"
            />
            <button type="button" onClick={() => setShowRapid(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showRapid ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {rapidApiKey.trim()
            ? <p className="text-xs text-emerald-600 font-semibold">✓ Key entered — deal scores use real sold prices.</p>
            : <p className="text-xs text-slate-400">No key here — the server’s RAPIDAPI_KEY is used if set, otherwise scores compare live listings only.</p>}
          <SaveButton onClick={saveRapidApiKey} done={rapidSaved} label="Save Key" />
        </div>
      </Section>

      {/* Data Backup */}
      <Section title="Data Backup" icon={Download}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Export your watchlist and saved business records as one JSON file, or import a previously exported file.</p>
          <div className="flex gap-3">
            <button onClick={exportData}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors"
            >
              <Download className="w-4 h-4" /> Export Data
            </button>
            <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" /> Import Data
              <input type="file" accept=".json" onChange={importData} className="hidden" />
            </label>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Importing will replace all current data. Export first if you want to keep a backup.</p>
          </div>
        </div>
      </Section>

      {/* Reset */}
      <Section title="Reset Data" icon={Trash2}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Permanently delete data. This cannot be undone.</p>
          {showResetConfirm && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700 font-semibold mb-3">
                Are you sure you want to {RESETS[showResetConfirm].confirm}?
              </p>
              <div className="flex gap-2">
                <button onClick={() => resetSection(showResetConfirm)}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700"
                >Yes, Delete</button>
                <button onClick={() => setShowResetConfirm('')}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-300"
                >Cancel</button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {Object.entries(RESETS).map(([key, { label }]) => (
              <button key={key} onClick={() => setShowResetConfirm(key)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-colors bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}
