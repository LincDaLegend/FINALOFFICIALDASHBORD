import { useState, useEffect } from 'react';
import { CheckCircle, Circle, ExternalLink, ArrowRight, Sparkles, LifeBuoy } from 'lucide-react';
import { load, save } from '../../legacy/utils/storage.js';
import { getWatchlist, WATCHLIST_EVENT } from '../../legacy/utils/watchlist.js';

const CHECKS_KEY = 'demoChecklist';

// Sample listings for a no-keys practice run — one of each verdict.
// Links go to a real eBay search for the same card, so nothing points nowhere.
const SAMPLE = [
  { title: 'DEMO · 2023-24 Panini Prizm Victor Wembanyama Silver Prizm RC #136', price: 89, shippingCost: 4.5, aiScore: 82, marketValue: 128, grade: 'raw', buyingOption: 'FIXED_PRICE' },
  { title: 'DEMO · 2023-24 Panini Prizm LeBron James Silver Prizm #1 PSA 10', price: 140, shippingCost: 0, aiScore: 58, marketValue: 155, grade: 'PSA 10', buyingOption: 'AUCTION', endsInMin: 95 },
  { title: 'DEMO · 2022-23 Donruss Stephen Curry Base #1', price: 6.99, shippingCost: 1.25, aiScore: 24, marketValue: 3, grade: 'raw', buyingOption: 'FIXED_PRICE' },
].map((l, i) => ({
  ...l,
  itemId: `demo-${i + 1}`,
  imgUrl: '',
  viewUrl: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(l.title.replace('DEMO · ', ''))}`,
  condition: l.grade === 'raw' ? 'Ungraded' : 'Graded',
  aestheticScore: 7,
  endTime: l.endsInMin ? new Date(Date.now() + l.endsInMin * 60000).toISOString() : null,
  _marketLabel: 'sample',
}));

export default function Demo({ setActiveTab }) {
  const [checks, setChecks] = useState(() => load(CHECKS_KEY, {}));
  const [auto, setAuto] = useState({ keys: false, rapid: false, watch: false, connected: false });

  // Tick steps the app can see are already done
  useEffect(() => {
    const ebayKey = load('ebayKey', ''), ebaySecret = load('ebaySecret', ''), rapidApiKey = load('rapidApiKey', '');
    const headers = {};
    if (ebayKey)    headers['x-ebay-key'] = ebayKey;
    if (ebaySecret) headers['x-ebay-secret'] = ebaySecret;

    const refreshWatch = () => setAuto(a => ({
      ...a,
      watch: getWatchlist().some(i => !String(i.itemId).startsWith('demo-')),
      connected: Boolean(load('ebayUser', null)),
    }));
    refreshWatch();

    // With no search words, the search route only checks that keys exist (here or on the server)
    fetch('/api/ebay/search', { headers })
      .then(r => setAuto(a => ({ ...a, keys: r.ok })))
      .catch(() => {});
    fetch('/api/ebay/sold?q=', { headers: rapidApiKey ? { 'x-rapidapi-key': rapidApiKey } : {} })
      .then(r => r.json())
      .then(d => setAuto(a => ({ ...a, rapid: d?.error !== 'no apiKey' && d?.error !== 'no API key configured' })))
      .catch(() => {});

    window.addEventListener(WATCHLIST_EVENT, refreshWatch);
    return () => window.removeEventListener(WATCHLIST_EVENT, refreshWatch);
  }, []);

  // Save right away (not inside a state updater) so it sticks even when we switch tabs straight after
  const mark = (id, value) => {
    const next = { ...checks, [id]: value };
    save(CHECKS_KEY, next);
    setChecks(next);
  };
  const toggle = (id) => mark(id, !checks[id]);

  const trySample = async () => {
    const { state } = await import('../../legacy/utils/state.js');
    state.query = ''; // leave the box empty so the next search is a real one
    state.results = SAMPLE.map(l => ({ ...l }));
    state.soldData = null;
    state.verdictFilter = '';
    state.loading = false;
    state.notify = { type: 'info', msg: 'Practice mode: these 3 cards are samples, not real listings. Type any player above to search for real.' };
    mark('search', true);
    setActiveTab('search');
  };

  const steps = [
    {
      id: 'keys', title: 'Get your free eBay keys', auto: auto.keys,
      body: <>On eBay’s developer site → <b>Application Keys</b> → <b>Production</b>. Copy the <b>App ID</b> and <b>Cert ID</b>.</>,
      action: <a href="https://developer.ebay.com/my/keys" target="_blank" rel="noopener noreferrer" className={btnCls}>Open eBay <ExternalLink className="w-3.5 h-3.5" /></a>,
    },
    {
      id: 'paste', title: 'Paste them in Settings', auto: auto.keys,
      body: <><b>Settings &amp; Data</b> → eBay API Credentials → paste both → <b>Save Credentials</b>.</>,
      action: <button onClick={() => setActiveTab('settings')} className={btnCls}>Go to Settings <ArrowRight className="w-3.5 h-3.5" /></button>,
    },
    {
      id: 'search', title: 'Search for a card',
      body: <><b>Search eBay</b> → type a player, like <i>LeBron James Prizm</i> → press <b>Enter</b>.</>,
      action: (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveTab('search')} className={btnCls}>Go to Search <ArrowRight className="w-3.5 h-3.5" /></button>
          <button onClick={trySample} className={btnGhostCls}><Sparkles className="w-3.5 h-3.5" /> No keys yet? Try sample cards</button>
        </div>
      ),
    },
    {
      id: 'read', title: 'Read the label',
      body: (
        <ul className="list-none pl-0 m-0 space-y-1.5 mt-1">
          <li><Tag cls="bg-emerald-100 text-emerald-800">BUY NOW</Tag> great price — score 70+</li>
          <li><Tag cls="bg-amber-100 text-amber-800">CONSIDER</Tag> maybe — score 45–69</li>
          <li><Tag cls="bg-red-100 text-red-700">SKIP</Tag> too pricey — under 45</li>
          <li className="pt-1"><b>Target Selling Price</b> = sell it for this to hit your profit %.</li>
        </ul>
      ),
    },
    {
      id: 'watch', title: 'Save the good ones', auto: auto.watch,
      body: <>Tap <b>♡ Watchlist</b> on a card. Find them all in the <b>Watchlist</b> tab.</>,
      action: <button onClick={() => setActiveTab('watchlist')} className={btnCls}>Go to Watchlist <ArrowRight className="w-3.5 h-3.5" /></button>,
    },
    {
      id: 'rapid', title: 'Smarter scores', optional: true, auto: auto.rapid,
      body: <>Add a RapidAPI key in <b>Settings → Sold Prices</b>. Scores then use real sold prices.</>,
      action: <button onClick={() => setActiveTab('settings')} className={btnGhostCls}>Go to Settings <ArrowRight className="w-3.5 h-3.5" /></button>,
    },
    {
      id: 'backup', title: 'Back up now and then', optional: true,
      body: <><b>Settings &amp; Data → Export Data</b>. Saves your watchlist to a file.</>,
      action: <button onClick={() => setActiveTab('settings')} className={btnGhostCls}>Go to Settings <ArrowRight className="w-3.5 h-3.5" /></button>,
    },
  ];

  const isDone = (s) => s.auto || Boolean(checks[s.id]);
  const required = steps.filter(s => !s.optional);
  const doneCount = required.filter(isDone).length;
  const pct = Math.round((doneCount / required.length) * 100);

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Intro + progress */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <h2 className="text-xl font-extrabold text-slate-900">Start here 👋</h2>
        <p className="text-sm text-slate-500 mt-1">This app finds cards on eBay and tells you if the price is good. 5 steps, about 5 minutes.</p>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-bold text-slate-700 whitespace-nowrap">{doneCount} / {required.length} done</span>
        </div>
        {doneCount === required.length && (
          <p className="mt-3 text-sm font-bold text-emerald-700">🎉 You’re set. Go find some deals!</p>
        )}
      </div>

      {/* Steps */}
      <ol className="list-none pl-0 m-0 space-y-3">
        {steps.map((s, i) => {
          const done = isDone(s);
          return (
            <li key={s.id} className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-5 flex gap-4 transition-colors ${done ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
              <button
                onClick={() => !s.auto && toggle(s.id)}
                aria-label={done ? `Step ${i + 1} done` : `Mark step ${i + 1} done`}
                title={s.auto && done ? 'Done — the app checked this for you' : 'Tick when done'}
                className="shrink-0 mt-0.5"
              >
                {done ? <CheckCircle className="w-7 h-7 text-emerald-500" /> : <Circle className="w-7 h-7 text-slate-300 hover:text-emerald-400" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Step {i + 1}{s.optional ? ' · optional' : ''}
                </p>
                <p className={`text-base font-bold ${done ? 'text-slate-500 line-through decoration-emerald-400' : 'text-slate-900'}`}>{s.title}</p>
                <div className="text-sm text-slate-600 mt-1 leading-relaxed">{s.body}</div>
                {s.action && !done && <div className="mt-3">{s.action}</div>}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Stuck */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
        <p className="flex items-center gap-2 font-bold text-slate-700"><LifeBuoy className="w-4 h-4 text-slate-400" /> Stuck?</p>
        <ul className="list-none pl-0 mt-2 space-y-1.5 text-sm text-slate-600">
          <li><b>“App ID and Client Secret are both required”</b> → do step 2.</li>
          <li><b>No results</b> → use fewer words, e.g. just the player’s name.</li>
          <li><b>Lost your watchlist?</b> → Settings → <b>Import Data</b> from your backup.</li>
        </ul>
      </div>
    </div>
  );
}

const btnCls = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-colors no-underline';
const btnGhostCls = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-solid border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors';

function Tag({ cls, children }) {
  return <span className={`inline-block w-[84px] text-center text-[11px] font-extrabold rounded-full px-2 py-0.5 mr-2 ${cls}`}>{children}</span>;
}
