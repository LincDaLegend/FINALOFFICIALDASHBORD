import { state } from '../utils/state.js';
import { searchEbay, fetchSoldMarketValue, computeMarketFromListings, ruleMLScore, scoreVerdict, toPhp, getPlayerCategory } from '../utils/api.js';
import { extractFeatures, topFeatures } from '../utils/ml.js';
import { CAT_BADGE_CLASS, CAT_LABEL, DEFAULT_RULES, DEFAULT_PLAYER_CATEGORIES, SAMPLE_DEALS } from '../utils/constants.js';

export const RESULTS_BATCH = 40;

export function renderSearch() {
  const margin = state.targetMarginPct ?? 30;
  const ship   = state.estShippingPhp  ?? 100;

  return `
    <div class="page-title">Search Listings</div>
    <div class="page-subtitle">Live eBay search · Scored using your deal history</div>

    <div class="search-area">
      <div class="search-row" style="margin-bottom:10px">
        <input
          id="q-input"
          type="text"
          placeholder="Player name  (e.g. LeBron James, Jordan Clarkson...)"
          value="${escHtml(state.query)}"
          style="flex:1;min-width:180px;font-size:15px;padding:11px 14px;border-radius:8px"
          onkeydown="if(event.key==='Enter') window.doSearch()"
        />
        <button class="btn-search" onclick="window.doSearch()" ${state.loading ? 'disabled' : ''}>
          ${state.loading ? '<span>Searching…</span>' : '<span>Search eBay</span>'}
        </button>
      </div>

      <div style="display:flex;gap:20px;align-items:flex-end;flex-wrap:wrap;padding:12px 14px;background:var(--bg-surface);border-radius:8px;margin-bottom:10px">
        <div style="flex:1;min-width:160px">
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Target Profit</div>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" min="0" max="500" step="1" value="${margin}"
              onchange="window.setTargetMargin(this.value)"
              style="width:80px;padding:6px 8px;font-size:14px;font-weight:700;color:var(--accent)"
            />
            <span style="font-size:14px;font-weight:600;color:var(--accent)">%</span>
          </div>
        </div>
        <div style="min-width:130px">
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Est. Shipping Out</div>
          <div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:13px;color:var(--text-muted)">₱</span>
            <input type="number" min="0" step="1" value="${ship}"
              onchange="window.setEstShipping(this.value)"
              style="width:90px;padding:6px 8px;font-size:13px;font-weight:600"
            />
          </div>
        </div>
      </div>

      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-right:4px">Type</span>
          ${[['all','All'],['fixed','Buy It Now'],['auction','Auction']].map(([v,l]) => `
            <button class="pill ${state.listingType === v ? 'active' : ''}" onclick="window.setListingType('${v}')">${l}</button>
          `).join('')}
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-right:4px">Location</span>
          ${[['us','US only'],['all','Worldwide']].map(([v,l]) => `
            <button class="pill ${state.itemLocation === v ? 'active' : ''}" onclick="window.setItemLocation('${v}')">${l}</button>
          `).join('')}
        </div>
      </div>
    </div>

    ${state.notify ? renderNotify(state.notify) : ''}
    ${!state.ebayKey && !state.notify ? renderNotify({ type: 'info', msg: 'Add your eBay API key in Settings to enable search.' }) : ''}

    ${state.results.length > 0 ? `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px">
        <div class="pill-row" style="margin-bottom:0">
          ${['', 'buy now', 'consider', 'skip'].map(v => `
            <button class="pill ${state.verdictFilter === v ? 'active' : ''}" onclick="window.setVerdictFilter('${v}')">
              ${v || 'all results'} ${v ? `(${state.results.filter(r => scoreVerdict(r.aiScore || 0).label === v).length})` : `(${state.results.length})`}
            </button>
          `).join('')}
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-right:4px">Sort</span>
          ${[['score','Deal Score'],['price_asc','Price ↑'],['price_desc','Price ↓'],['ending','Ending Soon']].map(([v,l]) => `
            <button class="pill ${(state.searchSort||'score') === v ? 'active' : ''}" onclick="window.setSearchSort('${v}')">${l}</button>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div>
      ${state.loading ? `
        <div class="loading-state">
          <div>Searching eBay…</div>
          <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
        </div>
      ` : ''}

      ${!state.loading && state.results.length === 0 && !state.query ? renderEmptySearch() : ''}

      ${renderResults()}
    </div>
  `;
}

function timeLeft(endTime) {
  if (!endTime) return null;
  const ms = new Date(endTime) - Date.now();
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1)  return `${h}h ${m}m`;
  if (m >= 1)  return `${m}m ${s}s`;
  return `${s}s`;
}

function renderResults() {
  if (state.loading || state.results.length === 0) return '';
  const filtered = state.verdictFilter
    ? state.results.filter(r => scoreVerdict(r.aiScore || 0).label === state.verdictFilter)
    : state.results;

  if (filtered.length === 0) return `<div class="empty-state"><p>No ${state.verdictFilter} listings found.</p></div>`;

  const sort = state.searchSort || 'score';
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'price_asc')  return (a.price + (a.shippingCost||0)) - (b.price + (b.shippingCost||0));
    if (sort === 'price_desc') return (b.price + (b.shippingCost||0)) - (a.price + (a.shippingCost||0));
    if (sort === 'ending') {
      const aMs = a.endTime ? new Date(a.endTime) - Date.now() : Infinity;
      const bMs = b.endTime ? new Date(b.endTime) - Date.now() : Infinity;
      return aMs - bMs;
    }
    // 'score' — default: highest score first
    return (b.aiScore || 0) - (a.aiScore || 0);
  });

  const margin = state.targetMarginPct ?? 30;
  const ship   = state.estShippingPhp  ?? 100;

  // Drawing thousands of cards at once makes the page crawl — show them in batches
  const limit = state.showCount || RESULTS_BATCH;
  const more  = sorted.length - limit;

  return sorted.slice(0, limit).map(r => {
    const score   = r.aiScore || 0;
    const verdict = scoreVerdict(score).label;
    const vCls    = verdict === 'buy now' ? 'badge-buy' : verdict === 'consider' ? 'badge-consider' : 'badge-skip';
    const barColor = score >= 70 ? '#3ecf8e' : score >= 45 ? '#f5a623' : '#f04444';
    const scoreLetterCls = score >= 70 ? 'score-A' : score >= 45 ? 'score-B' : 'score-C';
    const scaledScore = score >= 70 ? 'A' : score >= 45 ? 'B' : 'C';
    const totalPrice = r.price + (r.shippingCost || 0);
    const phpPrice   = toPhp(totalPrice, state.phpRate);        // e.g. ₱1,463
    const phpNum     = totalPrice * (state.phpRate || 57.2);    // numeric PHP cost
    const targetSellPhp = phpNum * (1 + margin / 100) + ship;   // breakeven sell price
    const fmtPhp = n => '₱' + Math.round(n).toLocaleString('en-PH');

    const isAuction = r.buyingOption === 'AUCTION' || r.buyingOption === 'AUCTION_WITH_BIN';
    const tLeft = isAuction ? timeLeft(r.endTime) : null;
    const tLeftMs = r.endTime ? new Date(r.endTime) - Date.now() : Infinity;
    const tCls = tLeftMs < 3600000 ? 'badge-skip' : tLeftMs < 14400000 ? 'badge-consider' : 'badge-gray';

    const watched = (state.watchlist || []).includes(r.itemId);

    return `
      <div class="listing-card">
        ${r.imgUrl
          ? `<img class="listing-img" src="${escHtml(r.imgUrl)}" alt="card" loading="lazy" onerror="this.style.display='none'" />`
          : `<div class="listing-img-ph">no image</div>`}

        <div class="listing-body">
          <div class="listing-title">${escHtml(r.title)}</div>
          <div class="listing-sub">${escHtml(r.condition)} · ${r.grade}</div>

          ${(() => {
            const pCat = getPlayerCategory(r.title, state.playerCategories);
            const pCatBadge = pCat ? `<span class="badge ${CAT_BADGE_CLASS[pCat] || 'badge-gray'}">${CAT_LABEL[pCat] || pCat}</span>` : '';
            return `
          <div class="listing-badges">
            <span class="badge ${vCls}">${verdict}</span>
            <span class="badge badge-blue">${r.grade}</span>
            ${pCatBadge}
            ${isAuction ? `<span class="badge badge-gray">Auction</span>` : ''}
            ${tLeft ? `<span class="badge ${tCls}">⏱ ${tLeft}</span>` : ''}
            <span class="badge badge-pink">aesthetic ${r.aestheticScore}/10</span>
          </div>`;
          })()}

          ${state.mlFeatureWeights && r.aiScore >= 45 ? (() => {
            const player  = (r.title || '').split(/\s+/).slice(0, 3).join(' ');
            const reasons = topFeatures(extractFeatures(r), state.mlFeatureWeights, 3, player);
            return reasons.length ? `<div class="listing-ai-reason">Matches your taste: ${reasons.join(' · ')}</div>` : '';
          })() : ''}

          <div class="score-bar-wrap">
            <div class="score-bar-meta">
              <span>deal score</span>
              <span>${score}/100</span>
            </div>
            <div class="score-track">
              <div class="score-fill" style="width:${score}%;background:${barColor}"></div>
            </div>
          </div>

          <!-- Price + Target Sell row -->
          <div style="display:flex;gap:0;margin-top:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
            <div style="flex:1;padding:8px 12px">
              <div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Card Price</div>
              <div style="font-size:20px;font-weight:700;color:var(--text-primary);font-family:var(--mono);line-height:1">$${totalPrice.toFixed(2)}</div>
              ${r.shippingCost > 0
                ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">$${r.price.toFixed(2)} + $${r.shippingCost.toFixed(2)} ship</div>`
                : `<div style="font-size:10px;color:var(--green);margin-top:2px">free shipping</div>`}
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${phpPrice}</div>
            </div>
            <div style="width:1px;background:var(--border)"></div>
            <div style="flex:1;padding:8px 12px;background:var(--bg-surface)">
              <div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Target Selling Price</div>
              <div style="font-size:20px;font-weight:700;color:var(--green);font-family:var(--mono);line-height:1">${fmtPhp(targetSellPhp)}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${margin}% profit · ₱${Math.round(ship)} ship out</div>
              <div style="font-size:10px;color:var(--text-muted)">profit: ${fmtPhp(phpNum * margin / 100)}</div>
            </div>
          </div>

          ${r.viewUrl
            ? `<a class="ebay-link" href="${escHtml(r.viewUrl)}" target="_blank" rel="noopener" style="margin-top:8px;display:inline-block">view on eBay →</a>`
            : ''}
        </div>

        <div class="listing-price" style="min-width:130px">
          <div class="score-ring ${scoreLetterCls}">${scaledScore}</div>

          <!-- Big watchlist button -->
          ${r.itemId ? `
          <button
            onclick="window.toggleWatch('${escHtml(r.itemId)}')"
            style="margin-top:10px;width:100%;padding:9px 0;border-radius:8px;border:1.5px solid ${watched ? 'var(--accent)' : 'var(--border)'};background:${watched ? 'var(--accent-dim)' : 'var(--bg)'};color:${watched ? 'var(--accent)' : 'var(--text-muted)'};font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.15s"
          >${watched ? '♥' : '♡'} ${watched ? 'Watching' : 'Watchlist'}</button>` : ''}

          <!-- Market price -->
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
            <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Market · ${r.grade}${r._marketLabel ? ` · ${r._marketLabel}` : ''}</div>
            ${r.marketValue != null
              ? `<div style="font-size:15px;font-weight:700;color:var(--text-primary)">~$${r.marketValue.toFixed(0)}</div>`
              : `<span style="font-size:11px;color:var(--text-muted)">-- no data</span>`}
          </div>
        </div>
      </div>
    `;
  }).join('') + (more > 0 ? `
    <div style="text-align:center;margin:18px 0 8px">
      <button class="pill" style="padding:10px 22px;font-size:14px;font-weight:600" onclick="window.showMoreResults()">
        Show ${Math.min(more, RESULTS_BATCH)} more <span style="color:var(--text-muted);font-weight:400">(${more} left)</span>
      </button>
    </div>` : '');
}

function renderEmptySearch() {
  return `
    <div class="empty-state">
      <div class="empty-icon">🏀</div>
      <h3>Ready to source</h3>
      <p>Enter a player name above to pull live eBay listings.</p>
    </div>`;
}


export async function doSearch() {
  state.query  = document.getElementById('q-input')?.value?.trim() || '';
  state.notify = null;

  if (!state.query) {
    state.notify = { type: 'err', msg: 'Enter a player name to search.' };
    window.renderApp();
    return;
  }

  state.loading       = true;
  state.results       = [];
  state.verdictFilter = '';
  state.showCount     = RESULTS_BATCH;
  window.renderApp();

  try {
    const [listings, soldData] = await Promise.all([
      searchEbay(state.query, '', state.listingType, state.itemLocation),
      fetchSoldMarketValue(state.query),
    ]);
    const marketData = soldData || computeMarketFromListings(listings);

    if (!listings.length) {
      state.loading = false;
      state.notify = { type: 'err', msg: 'No eBay results found. Try a broader search term.' };
      window.renderApp();
      return;
    }

    // Filter to listings that actually contain every word of the query
    const queryWords = state.query.toUpperCase().split(/\s+/).filter(Boolean);
    const relevant = listings.filter(l =>
      queryWords.every(w => l.title.toUpperCase().includes(w))
    );

    const _rules   = state.rules || DEFAULT_RULES;
    const _deals   = state.deals || SAMPLE_DEALS;
    const _weights = state.mlFeatureWeights || null;
    if (!state.playerCategories) state.playerCategories = DEFAULT_PLAYER_CATEGORIES;

    relevant.forEach(l => {
      try {
        l.aiScore = ruleMLScore(l, null, _rules, _deals, _weights, marketData);
        if (!Number.isFinite(l.aiScore)) l.aiScore = 0;
      } catch (err) {
        console.error('[score]', err.message, l.title);
        l.aiScore = 0;
      }
    });

    // Remove listings priced >25% above market value (only when we have enough sold data)
    const filtered = (marketData?.count >= 3)
      ? relevant.filter(l => l.realRoiPct === undefined || l.realRoiPct >= -25)
      : relevant;

    state.results = [...filtered].sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
    state.loading = false;
    window.renderApp();
  } catch (e) {
    state.loading = false;
    state.notify  = { type: 'err', msg: `Search failed: ${e.message}` };
    window.renderApp();
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


function renderNotify({ type, msg }) {
  const cls = type === 'ok' ? 'notify-ok' : type === 'info' ? 'notify-info' : 'notify-err';
  return `<div class="notify ${cls}">${msg}</div>`;
}
