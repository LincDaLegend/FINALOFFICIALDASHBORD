// Cebu trip planner backend (temporary feature: delete this folder to remove it).
// Free, keyless OpenStreetMap services:
//   ?kind=places&q=…         → Nominatim search, limited to Cebu province
//   ?kind=stays&lat=…&lon=…  → hotels / resorts / guesthouses / apartments near a point (Nominatim)
//   ?kind=drive&pts=lon,lat;… → OSRM driving route: per-leg km, minutes, ferry km, plus a line to draw
//   ?kind=ai                  → checks the Claude API key (x-anthropic-key header, else ANTHROPIC_API_KEY)
//   ?kind=photo&name&lat&lon  → a photo of the place from Wikipedia / Wikimedia Commons (matched by name)
//   POST { mode: 'route' }      → shortest order for a day or the whole trip (exact solver, no AI)
//   POST { mode: 'cost' }       → cheapest trip: day order, stop order and one hotel per night (gas + hotels, no AI)
//   POST { days, goal, … }      → Claude re-plans the itinerary using an OSRM drive-time matrix
// Both public services ask for at most ~1 request/second and an identifying User-Agent, so requests
// are spaced per host and cached in memory.
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const UA = 'BallerTripPlanner/1.0 (personal itinerary tool)';
const CEBU_VIEWBOX = '123.25,11.40,124.20,9.40'; // left,top,right,bottom; also catches Bohol/Negros, so results are filtered too

const cache = new Map();
const nextSlot = new Map(); // host → earliest time the next request may start
// OSM's free servers ask for ≤1 request/second; Wikimedia is fine with a short gap
const GAP = { 'en.wikipedia.org': 150, 'commons.wikimedia.org': 150 };

async function politeFetch(url) {
  if (cache.has(url)) return cache.get(url);
  const host = new URL(url).host;
  const now = Date.now();
  const start = Math.max(now, nextSlot.get(host) || 0);
  nextSlot.set(host, start + (GAP[host] ?? 1100));
  if (start > now) await new Promise(r => setTimeout(r, start - now));
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${host} answered ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return data;
}

const nominatim = (params) =>
  politeFetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ format: 'jsonv2', addressdetails: '1', countrycodes: 'ph', ...params }));

function areaOf(a = {}) {
  const local = a.suburb || a.village || a.hamlet || a.neighbourhood;
  const town = a.town || a.city || a.municipality;
  return [...new Set([local, town].filter(Boolean))].join(', ');
}

const toPlace = (r) => ({
  id: `${r.osm_type?.[0] || 'x'}${r.osm_id}`,
  name: r.name || r.display_name.split(',')[0],
  area: areaOf(r.address),
  lat: +(+r.lat).toFixed(5),
  lon: +(+r.lon).toFixed(5),
  kind: r.type,
  category: r.category,
  wiki: r.extratags?.wikipedia || null,
});

const inCebu = (r) => /\bCebu\b/.test(r.display_name);

// Nominatim matches category words in the singular ("waterfall", "beach") and understands "X near Town"
const ALIASES = {
  falls: 'waterfall', waterfalls: 'waterfall', beaches: 'beach', resorts: 'resort', hotels: 'hotel', food: 'restaurant',
  restaurants: 'restaurant', cafes: 'cafe', malls: 'mall', churches: 'church', islands: 'island', viewpoints: 'viewpoint',
  attractions: 'attraction', museums: 'museum', parks: 'park', diving: 'dive', 'things to do': 'attraction',
};
function normalise(q) {
  let s = q.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [from, to] of Object.entries(ALIASES)) s = s.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  return s.replace(/\b(in|at|around)\b/g, 'near');
}

async function places(q) {
  const query = normalise(q);
  const rows = (await nominatim({ q: query, limit: '25', viewbox: CEBU_VIEWBOX, bounded: '1', extratags: '1' })).filter(r => inCebu(r) && r.name);
  // A bare town name ("Moalboal") → the town itself plus the things to do around it
  if (rows.length <= 2 && !/\bnear\b/.test(query) && rows.every(r => r.category === 'place' || r.category === 'boundary')) {
    const near = await nominatim({ q: `attraction near ${query}`, limit: '25', extratags: '1' }).catch(() => []);
    rows.push(...near.filter(r => inCebu(r) && r.name));
  }
  const seen = new Set();
  return rows.map(toPlace).filter(p => !seen.has(p.id) && seen.add(p.id));
}

/** Coordinates typed or pasted: "10.31, 123.89" or a Google / Apple Maps link. */
function coordsIn(s) {
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|ll|query|sll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)\s*$/];
  for (const re of pats) {
    const m = s.match(re);
    if (m && inCebuBox(+m[1], +m[2])) return { lat: +(+m[1]).toFixed(5), lon: +(+m[2]).toFixed(5) };
  }
  return null;
}

/**
 * Pin a hotel from its name and/or address. Tries the most specific query first, then drops the
 * leading parts of the address (house no. → street → barangay) until something in Cebu matches.
 */
async function geocode(name, address) {
  const ll = coordsIn(address) || coordsIn(name);
  if (ll) return [{ ...ll, label: 'Pinned from coordinates', area: '', precision: 'exact' }];
  const parts = address.split(',').map(s => s.trim()).filter(s => s && !/^(cebu|philippines|ph|\d{4})$/i.test(s));
  const tries = [];
  if (name && parts.length) tries.push([`${name}, ${parts.join(', ')}`, 'exact']);
  for (let i = 0; i < parts.length; i++) tries.push([parts.slice(i).join(', '), i === 0 && parts.length > 1 ? 'street' : parts.length - i <= 1 ? 'town' : 'street']);
  if (name) tries.push([name, 'exact']);
  const seen = new Set(), out = [];
  for (const [q, precision] of tries) {
    if (out.length >= 5) break;
    const rows = (await nominatim({ q, limit: '5', viewbox: CEBU_VIEWBOX, bounded: '1' }).catch(() => [])).filter(inCebu);
    for (const r of rows) {
      const id = `${r.osm_type?.[0] || 'x'}${r.osm_id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const town = r.category === 'boundary' || r.category === 'place';
      out.push({ lat: +(+r.lat).toFixed(5), lon: +(+r.lon).toFixed(5), label: r.display_name.split(', ').slice(0, 3).join(', '), area: areaOf(r.address), precision: town ? 'town' : precision });
    }
    if (out.some(o => o.precision !== 'town')) break; // a real match — stop asking
  }
  return out.slice(0, 5);
}

const STAY_WORDS =/resort|hotel|inn|lodge|hostel|guest ?house|suites|apartment|pension|villa|b&b|bnb|homestay|cottage|condo|residence/i;

async function stays(lat, lon) {
  const d = 0.045; // ~5 km each way
  const viewbox = `${lon - d},${lat + d},${lon + d},${lat - d}`;
  const queries = ['hotel', 'resort', 'guest house', 'apartment'];
  const results = await Promise.allSettled(queries.map(q => nominatim({ q, viewbox, bounded: '1', limit: '15', extratags: '1' })));
  const seen = new Set();
  const out = [];
  // Real lodging tags first, so "X Resort and Restaurant" keeps its resort entry, not the restaurant one
  const rows = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => (b.category === 'tourism' || b.category === 'leisure') - (a.category === 'tourism' || a.category === 'leisure'));
  for (const row of rows) {
    const p = toPlace(row);
    const ok = row.category === 'tourism' || row.category === 'leisure' || STAY_WORDS.test(p.name);
    const nameKey = p.name.toLowerCase();
    if (!ok || seen.has(p.id) || seen.has(nameKey) || !row.name) continue;
    seen.add(p.id); seen.add(nameKey);
    const tags = row.extratags || {};
    out.push({ ...p, stars: tags.stars || null, website: tags.website || tags['contact:website'] || null });
  }
  if (!out.length && results.every(r => r.status === 'rejected')) throw results[0].reason;
  return out;
}

async function drive(pts) {
  const url = `https://router.project-osrm.org/route/v1/driving/${pts}?overview=simplified&geometries=geojson&steps=true`;
  const data = await politeFetch(url);
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error(data.message || 'No route found');
  const route = data.routes[0];
  return {
    legs: route.legs.map(l => ({
      km: l.distance / 1000,
      min: l.duration / 60,
      ferryKm: (l.steps || []).filter(s => s.mode === 'ferry').reduce((sum, s) => sum + s.distance, 0) / 1000,
    })),
    line: route.geometry.coordinates.map(([x, y]) => [+y.toFixed(5), +x.toFixed(5)]), // [lat, lon] for Leaflet
  };
}

// ─── Photos ──────────────────────────────────────────────────────────────────
// Only photos whose Wikipedia article or Commons file name matches the place's own name (or, for
// Commons files taken within 300 m, its town), so a card never shows an unrelated picture.

const GENERIC = new Set(['falls', 'fall', 'beach', 'island', 'islet', 'cebu', 'city', 'church', 'temple', 'park', 'resort', 'hotel', 'boat', 'food', 'strip',
  'center', 'centre', 'shrine', 'peak', 'mall', 'market', 'national', 'road', 'street', 'house', 'restaurant', 'view', 'point', 'river', 'mountain',
  'garden', 'gardens', 'museum', 'minore', 'basilica', 'parish', 'ferry', 'with', 'from', 'panoramio']);
const keyWords = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !GENERIC.has(w));
const matchScore = (words, title) => { const t = new Set(keyWords(title)); return words.filter(w => t.has(w)).length; };
const bigger = (url) => (url ? url.replace(/\/(\d{2,4})px-/, '/640px-') : url);

async function photo({ name, area, lat, lon, wiki }) {
  const words = keyWords(name);
  const areaWords = keyWords(area);

  // 1. OpenStreetMap already links the place to its Wikipedia article
  if (wiki) {
    const [lang, ...rest] = wiki.includes(':') ? wiki.split(':') : ['en', wiki];
    try {
      const d = await politeFetch(`https://${/^[a-z-]{2,12}$/.test(lang) ? lang : 'en'}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(rest.join(':').replace(/ /g, '_'))}`);
      if (d.thumbnail?.source) return { url: bigger(d.thumbnail.source), page: d.content_urls?.desktop?.page || null, source: 'Wikipedia' };
    } catch {}
  }

  // 2. A nearby Wikipedia article with the same name
  if (words.length) {
    try {
      const d = await politeFetch(`https://en.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}%7C${lon}&ggsradius=5000&ggslimit=20&prop=pageimages&piprop=thumbnail&pithumbsize=640&format=json`);
      const best = Object.values(d.query?.pages || {})
        .filter(pg => pg.thumbnail?.source)
        .map(pg => ({ pg, score: matchScore(words, pg.title) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)[0];
      if (best) return { url: best.pg.thumbnail.source, page: `https://en.wikipedia.org/?curid=${best.pg.pageid}`, source: 'Wikipedia' };
    } catch {}
  }

  // 3. A geotagged photo on Wikimedia Commons taken right there
  try {
    const d = await politeFetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}%7C${lon}&ggsradius=300&ggsnamespace=6&ggslimit=20&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json`);
    const files = Object.values(d.query?.pages || {}).filter(pg => /\.(jpe?g|png|webp)$/i.test(pg.title) && pg.imageinfo?.[0]?.thumburl);
    const pick = files.map(pg => ({ pg, score: matchScore(words, pg.title) * 2 + matchScore(areaWords, pg.title) }))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score)[0];
    if (pick) return { url: pick.pg.imageinfo[0].thumburl, page: pick.pg.imageinfo[0].descriptionurl, source: 'Wikimedia Commons' };
  } catch {}
  return { url: null };
}

// ─── Shortest route (no AI) ──────────────────────────────────────────────────

/** Exact shortest open path through `free`, from s (or anywhere) to e (or anywhere). Held–Karp, fine up to ~11 stops. */
function heldKarp(free, s, e, w) {
  const m = free.length;
  if (m === 0) return [];
  const FULL = 1 << m;
  const dp = new Float64Array(FULL * m).fill(Infinity);
  const par = new Int8Array(FULL * m).fill(-1);
  for (let j = 0; j < m; j++) dp[(1 << j) * m + j] = s == null ? 0 : w(s, free[j]);
  for (let mask = 1; mask < FULL; mask++) {
    for (let j = 0; j < m; j++) {
      if (!((mask >> j) & 1)) continue;
      const cur = dp[mask * m + j];
      if (cur === Infinity) continue;
      for (let k = 0; k < m; k++) {
        if ((mask >> k) & 1) continue;
        const nm = mask | (1 << k), v = cur + w(free[j], free[k]);
        if (v < dp[nm * m + k]) { dp[nm * m + k] = v; par[nm * m + k] = j; }
      }
    }
  }
  let best = Infinity, bj = 0;
  for (let j = 0; j < m; j++) { const v = dp[(FULL - 1) * m + j] + (e == null ? 0 : w(free[j], e)); if (v < best) { best = v; bj = j; } }
  const out = [];
  for (let mask = FULL - 1, j = bj; j !== -1;) { out.push(free[j]); const pj = par[mask * m + j]; mask ^= 1 << j; j = pj; }
  return out.reverse();
}

/** Nearest neighbour + 2-opt, for unusually long days. */
function twoOpt(free, s, e, w) {
  const left = [...free], path = [];
  let cur = s;
  while (left.length) {
    let bi = 0;
    if (cur != null) left.forEach((k, i) => { if (w(cur, k) < w(cur, left[bi])) bi = i; });
    cur = left.splice(bi, 1)[0];
    path.push(cur);
  }
  const len = (p) => { let c = s == null ? 0 : w(s, p[0]); for (let i = 1; i < p.length; i++) c += w(p[i - 1], p[i]); return c + (e == null ? 0 : w(p[p.length - 1], e)); };
  for (let improved = true, guard = 0; improved && guard < 200; guard++) {
    improved = false;
    for (let i = 0; i < path.length - 1; i++) for (let j = i + 1; j < path.length; j++) {
      const next = [...path.slice(0, i), ...path.slice(i, j + 1).reverse(), ...path.slice(j + 1)];
      if (len(next) < len(path) - 1e-9) { path.splice(0, path.length, ...next); improved = true; }
    }
  }
  return path;
}

/**
 * Orders stops to minimise km (or drive minutes). Hotels stay fixed; so do the trip's first stop
 * (e.g. arriving at the airport) and last stop. "trip" scope may also move stops between days and
 * fit in wishlist places that aren't on any day yet (`extra`), as long as no day runs past its
 * time window. A day that has plans never ends up empty.
 */
function shortestRoute({ dayInfo, stops, M, metric, scope, dayIndex, extra = [], windows }) {
  const n = stops.length, D = dayInfo.length;
  const W = metric === 'min' ? M.min : M.km;
  const w = (a, b) => (a === b ? 0 : W[a]?.[b] ?? 1e6);
  const head = (i) => (i > 0 && dayInfo[i - 1].hotel != null ? n + dayInfo[i - 1].hotel : null);
  const tail = (i) => (i < D - 1 && dayInfo[i].hotel != null ? n + dayInfo[i].hotel : null);
  const pinFirst = dayInfo[0].ids[0] ?? null;
  const lastIds = dayInfo[D - 1].ids;
  const pinLast = lastIds.length && lastIds[lastIds.length - 1] !== pinFirst ? lastIds[lastIds.length - 1] : null;

  const memo = new Map();
  const solve = (i, ids) => {
    const key = `${i}:${[...ids].sort((a, b) => a - b).join(',')}`;
    if (memo.has(key)) return memo.get(key);
    const first = i === 0 && ids.includes(pinFirst) ? pinFirst : null;
    const last = i === D - 1 && ids.includes(pinLast) ? pinLast : null;
    const free = ids.filter(k => k !== first && k !== last);
    const s = first ?? head(i), e = last ?? tail(i);
    const mid = free.length <= 11 ? heldKarp(free, s, e, w) : twoOpt(free, s, e, w);
    const order = [...(first != null ? [first] : []), ...mid, ...(last != null ? [last] : [])];
    const seq = [...(head(i) != null ? [head(i)] : []), ...order, ...(tail(i) != null ? [tail(i)] : [])];
    let cost = 0, drive = 0;
    for (let k = 1; k < seq.length; k++) { cost += w(seq[k - 1], seq[k]); drive += M.min[seq[k - 1]]?.[seq[k]] || 0; }
    const out = { order, cost, minutes: drive + order.reduce((t, k) => t + stops[k].mins, 0) };
    memo.set(key, out);
    return out;
  };

  const assign = dayInfo.map(d => [...d.ids]);
  if (scope === 'day') { assign[dayIndex] = solve(dayIndex, assign[dayIndex]).order; return { days: assign, left: extra }; }
  if (scope === 'each') return { days: assign.map((ids, i) => solve(i, ids).order), left: extra };

  const limit = dayInfo.map((d, i) => Math.max(windows[i], solve(i, d.ids).minutes));
  // Wishlist places not on any day yet go where they add the least driving (must-dos first)
  const left = [];
  for (const k of [...extra].sort((a, b) => Number(stops[b].must) - Number(stops[a].must))) {
    let best = null;
    for (let b = 0; b < D; b++) {
      const rb = solve(b, [...assign[b], k]);
      if (rb.minutes > limit[b]) continue;
      const delta = rb.cost - solve(b, assign[b]).cost;
      if (!best || delta < best.delta) best = { b, delta };
    }
    if (best) assign[best.b].push(k); else left.push(k);
  }
  const own = (ids) => ids.filter(k => k !== pinFirst && k !== pinLast).length;
  for (let improved = true, guard = 0; improved && guard < 30; guard++) {
    improved = false;
    for (let a = 0; a < D; a++) {
      for (const k of [...assign[a]]) {
        if (k === pinFirst || k === pinLast) continue;
        const without = assign[a].filter(x => x !== k);
        if (own(without) === 0) continue;
        const saved = solve(a, assign[a]).cost - solve(a, without).cost;
        let best = null;
        for (let b = 0; b < D; b++) {
          if (b === a) continue;
          const rb = solve(b, [...assign[b], k]);
          if (rb.minutes > limit[b]) continue;
          const delta = rb.cost - solve(b, assign[b]).cost - saved;
          if (delta < -0.01 && (!best || delta < best.delta)) best = { b, delta };
        }
        if (best) { assign[a] = without; assign[best.b] = [...assign[best.b], k]; improved = true; }
      }
    }
  }
  return { days: assign.map((ids, i) => solve(i, ids).order), left };
}

// ─── Lowest cost: gas + hotels (no AI) ───────────────────────────────────────

/**
 * Finds the cheapest trip. `slots` are the current days (their stops + leave time); `cands` are the
 * hotel options (point index n + h, with `nightly` = what the group pays per night). Every night
 * gets exactly one hotel from the options. Unless `hotelsOnly`, whole days may swap places (the
 * day with the trip's first stop stays first, the one with its last stop stays last), stops are
 * re-ordered inside each day, and stops may move between days. The cost is only gas + hotels;
 * a rearrangement is kept only if it is cheaper AND doesn't make the days run later than before.
 */
/**
 * The hotels an optimizer may choose from, from the request: priced ones, plus any unpriced one you
 * starred or already put on a night (those keep their spot; others with no price are left out).
 * `fixed[night]` = the option index for nights you pinned.
 */
function hotelOptions(body, days) {
  const str = (v, n = 120) => String(v ?? '').slice(0, n);
  const price = (h) => (Number.isFinite(+h.nightly) ? Math.max(0, +h.nightly) : 0);
  const nights = days.slice(0, Math.max(0, days.length - 1));
  const onNight = new Set(nights.map(d => d?.hotel).filter(Boolean));
  const sent = (Array.isArray(body.hotels) ? body.hotels : []).filter(h => Number.isFinite(+h.lat) && Number.isFinite(+h.lon) && h.lat !== null && h.lon !== null);
  const keep = (h) => price(h) > 0 || h.must || onNight.has(h.uid);
  const cands = sent.filter(keep).slice(0, 12)
    .map(h => ({ uid: str(h.uid, 40), name: str(h.name), area: str(h.area), lat: +h.lat, lon: +h.lon, nightly: price(h), must: !!h.must }));
  // While choosing, a hotel with no price counts as your priciest one, so it's never picked for looking free
  const guess = Math.max(0, ...cands.map(c => c.nightly)) || 3000;
  cands.forEach(c => { c.weigh = c.nightly || guess; });
  const idx = new Map(cands.map((c, k) => [c.uid, k]));
  const fixed = nights.map(d => (d?.pin && idx.has(d.hotel) ? idx.get(d.hotel) : null));
  return { cands, fixed, idx, unpriced: sent.filter(h => !keep(h)).map(h => str(h.name)) };
}

function minCost(args) {
  const res = solveCost(args);
  if (args.hotelsOnly) return res;
  // Safety net: never hand back something pricier or later than "your days as they are + cheapest hotels"
  const keep = solveCost({ ...args, hotelsOnly: true });
  return res.raw.total > keep.raw.total + 0.5 || res.raw.late > keep.raw.late + 0.5 ? keep : res;
}

function solveCost({ stops, slots, cands, M, gasPerKm, backBy, hotelsOnly, fixed = [] }) {
  const n = stops.length, D = slots.length, H = cands.length;
  // Pinned nights keep their hotel; must-stay hotels get used at least once (up to 4 of them)
  const mustIdx = cands.map((c, h) => (c.must ? h : -1)).filter(h => h >= 0).slice(0, 4);
  const bit = (h) => { const k = mustIdx.indexOf(h); return k < 0 ? 0 : 1 << k; };
  const pop = (m) => { let c = 0; for (; m; m &= m - 1) c++; return c; };
  const allowed = (night) => (fixed[night] != null ? [fixed[night]] : cands.map((_, h) => h));
  const pinFirst = slots[0].ids[0] ?? null;
  const lastIds = slots[D - 1].ids;
  const pinLast = lastIds.length && lastIds[lastIds.length - 1] !== pinFirst ? lastIds[lastIds.length - 1] : null;
  const km = (a, b) => (a === b ? 0 : M.km[a]?.[b] ?? 1e6);
  const mn = (a, b) => (a === b ? 0 : M.min[a]?.[b] ?? 1e6);
  const hhmmToMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : 8 * 60; };
  const windowOf = (start) => Math.max(4 * 60, backBy - hhmmToMin(start));

  const memo = new Map();
  const route = (ids, s, e) => {
    const key = `${hotelsOnly ? 'F' + ids.join(',') : [...ids].sort((a, b) => a - b).join(',')}|${s}|${e}`;
    if (memo.has(key)) return memo.get(key);
    let order = ids;
    if (!hotelsOnly) {
      const first = ids.includes(pinFirst) ? pinFirst : null;
      const last = ids.includes(pinLast) ? pinLast : null;
      const free = ids.filter(k => k !== first && k !== last);
      const ss = first ?? s, ee = last ?? e;
      const mid = free.length <= 10 ? heldKarp(free, ss, ee, km) : twoOpt(free, ss, ee, km);
      order = [...(first != null ? [first] : []), ...mid, ...(last != null ? [last] : [])];
    }
    const seq = [...(s != null ? [s] : []), ...order, ...(e != null ? [e] : [])];
    let dist = 0, drive = 0;
    for (let k = 1; k < seq.length; k++) { dist += km(seq[k - 1], seq[k]); drive += mn(seq[k - 1], seq[k]); }
    const out = { order, km: dist, min: drive, minutes: drive + order.reduce((t, k) => t + stops[k].mins, 0) };
    memo.set(key, out);
    return out;
  };
  // Cost is only what you pay: gas + hotels. Running late is never traded for money; it's a guard on rearranging (below).
  const dayPrice = (r) => r.km * gasPerKm;
  const lateBy = (r, start) => Math.max(0, r.minutes - windowOf(start));

  // Cheapest hotel per night for a given arrangement of days (dynamic programming over nights)
  const evaluate = (arr) => {
    if (H === 0 || D === 1) {
      let total = 0;
      arr.forEach(sl => { total += dayPrice(route(sl.ids, null, null)); });
      const hotels = Array(Math.max(0, D - 1)).fill(null);
      return { total, hotels, late: lateOf(arr, hotels), cover: 0 };
    }
    // State per night: (hotel tonight, which must-stay hotels used so far) → cheapest way there
    const put = (m, h, mask, cost, path) => { const k = h * 16 + mask; const o = m.get(k); if (!o || cost < o.cost) m.set(k, { h, mask, cost, path }); };
    let f = new Map();
    for (const h of allowed(0)) put(f, h, bit(h), dayPrice(route(arr[0].ids, null, n + h)) + (cands[h].weigh ?? cands[h].nightly), [h]);
    for (let i = 1; i < D - 1; i++) {
      const g = new Map();
      for (const prev of f.values()) {
        for (const h of allowed(i)) put(g, h, prev.mask | bit(h), prev.cost + dayPrice(route(arr[i].ids, n + prev.h, n + h)) + (cands[h].weigh ?? cands[h].nightly), [...prev.path, h]);
      }
      f = g;
    }
    // Use as many must-stays as possible first, then cheapest
    let best = null;
    for (const prev of f.values()) {
      const v = prev.cost + dayPrice(route(arr[D - 1].ids, n + prev.h, null));
      const cover = pop(prev.mask);
      if (!best || cover > best.cover || (cover === best.cover && v < best.cost)) best = { cost: v, path: prev.path, cover };
    }
    return { total: best.cost, hotels: best.path, late: lateOf(arr, best.path), cover: best.cover };
  };
  // Minutes past the day's hours, summed over the trip, for an arrangement + hotel choice
  function lateOf(arr, hotels) {
    const at = (night) => (night < 0 || night >= D - 1 || hotels[night] == null ? null : n + hotels[night]);
    return arr.reduce((t, sl, i) => t + lateBy(route(sl.ids, at(i - 1), at(i)), sl.start), 0);
  }
  // A rearrangement must be cheaper and must not make the days run later than they already do
  const better = (ev, cur) => ev.total < cur.total - 0.5 && ev.late <= cur.late;

  let arr = slots.map(sl => ({ ids: [...sl.ids], start: sl.start }));
  let cur = evaluate(arr);

  if (!hotelsOnly) {
    // 1. Try every order of the days (≤ 120 for 5 days)
    const fixFirst = pinFirst != null, fixLast = pinLast != null;
    const perms = [];
    const permute = (rest, acc) => {
      if (!rest.length) { perms.push(acc); return; }
      rest.forEach((x, k) => permute([...rest.slice(0, k), ...rest.slice(k + 1)], [...acc, x]));
    };
    const middle = [...Array(D).keys()].filter(k => !(fixFirst && k === 0) && !(fixLast && k === D - 1));
    permute(middle, []);
    for (const p of perms) {
      const order = [...(fixFirst ? [0] : []), ...p, ...(fixLast ? [D - 1] : [])];
      const trial = order.map(k => slots[k]).map(sl => ({ ids: [...sl.ids], start: sl.start }));
      const ev = evaluate(trial);
      if (better(ev, cur)) { arr = trial; cur = ev; }
    }
    // 2. Move single stops to another day when it saves money (kept small so it stays fast)
    if (H <= 6 && n <= 30) {
      const own = (ids) => ids.filter(k => k !== pinFirst && k !== pinLast).length;
      for (let pass = 0, improved = true; improved && pass < 3; pass++) {
        improved = false;
        for (let a = 0; a < D; a++) {
          for (const k of [...arr[a].ids]) {
            if (k === pinFirst || k === pinLast) continue;
            const without = arr[a].ids.filter(x => x !== k);
            if (own(without) === 0) continue;
            for (let b = 0; b < D; b++) {
              if (b === a) continue;
              const trial = arr.map((sl, i) => (i === a ? { ...sl, ids: without } : i === b ? { ...sl, ids: [...sl.ids, k] } : sl));
              const ev = evaluate(trial);
              if (better(ev, cur)) { arr = trial; cur = ev; improved = true; break; }
            }
          }
        }
      }
    }
  }

  // Final routes with the chosen hotels
  const hotelPoint = (night) => (night < 0 || night >= D - 1 || cur.hotels[night] == null ? null : n + cur.hotels[night]);
  let dist = 0, drive = 0, stay = 0, late = 0;
  const days = arr.map((sl, i) => {
    const r = route(sl.ids, hotelPoint(i - 1), hotelPoint(i));
    dist += r.km; drive += r.min; late += lateBy(r, sl.start);
    return { ids: r.order, start: sl.start };
  });
  cur.hotels.forEach(h => { if (h != null) stay += cands[h].nightly; });
  return { days, hotels: cur.hotels, raw: { total: dist * gasPerKm + stay, late }, totals: { km: Math.round(dist), min: Math.round(drive), gas: Math.round(dist * gasPerKm), stay: Math.round(stay), total: Math.round(dist * gasPerKm + stay) } };
}

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const kind = p.get('kind');
  try {
    if (kind === 'places') {
      const q = (p.get('q') || '').trim().slice(0, 120);
      if (!q) return NextResponse.json({ results: [] });
      return NextResponse.json({ results: await places(q) });
    }
    if (kind === 'geocode') {
      const name = (p.get('name') || '').trim().slice(0, 120), address = (p.get('address') || '').trim().slice(0, 300);
      if (!name && !address) return NextResponse.json({ results: [] });
      return NextResponse.json({ results: await geocode(name, address) });
    }
    if (kind === 'stays') {
      const lat = Number(p.get('lat')), lon = Number(p.get('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 });
      return NextResponse.json({ results: await stays(lat, lon) });
    }
    if (kind === 'drive') {
      const raw = (p.get('pts') || '').split(';').map(s => s.split(',').map(Number));
      if (raw.length < 2 || raw.length > 25 || raw.some(c => c.length !== 2 || !c.every(Number.isFinite))) {
        return NextResponse.json({ error: 'pts must be 2–25 "lon,lat" pairs separated by ;' }, { status: 400 });
      }
      return NextResponse.json(await drive(raw.map(c => c.map(n => n.toFixed(5)).join(',')).join(';')));
    }
    if (kind === 'ai') return NextResponse.json(await checkAiKey(req));
    if (kind === 'photo') {
      const lat = Number(p.get('lat')), lon = Number(p.get('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 });
      const found = await photo({ name: (p.get('name') || '').slice(0, 120), area: (p.get('area') || '').slice(0, 80), lat, lon, wiki: (p.get('wiki') || '').slice(0, 200) });
      return NextResponse.json(found, { headers: { 'Cache-Control': 'public, max-age=86400' } });
    }
    return NextResponse.json({ error: 'kind must be places, stays, drive or ai' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Lookup failed' }, { status: 502 });
  }
}

// ─── AI planning ─────────────────────────────────────────────────────────────

const MODEL = 'claude-opus-5-5';

// A key pasted in Settings (sent per request, never stored on the server) wins over the server's env key
const aiKey = (req) => (req.headers.get('x-anthropic-key') || '').trim() || process.env.ANTHROPIC_API_KEY || '';

async function checkAiKey(req) {
  const apiKey = aiKey(req);
  const source = (req.headers.get('x-anthropic-key') || '').trim() ? 'browser' : 'server';
  if (!apiKey) return { ok: false, code: 'no_key' };
  try {
    await new Anthropic({ apiKey, maxRetries: 0 }).models.retrieve(MODEL); // free call: proves the key works
    return { ok: true, source };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { ok: false, code: 'bad_key', source };
    return { ok: false, code: 'unreachable', source, error: e.message };
  }
}

const CATS = ['water', 'beach', 'dive', 'worship', 'landmark', 'view', 'food', 'shop', 'transport', 'park', 'pin'];

// Only the plan comes back: no summaries, reasons or tips
const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['days', 'nights'],
  properties: {
    nights: {
      type: 'array',
      description: 'The hotel for each night, night 1 = after day 1.',
      items: {
        type: 'object', additionalProperties: false, required: ['night', 'hotel'],
        properties: {
          night: { type: 'integer', description: 'Night number, 1-based.' },
          hotel: { type: 'string', description: 'Hotel id (H1, H2, ...), or "" when there are no hotel options.' },
        },
      },
    },
    days: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['day', 'title', 'start', 'stops'],
        properties: {
          day: { type: 'integer', description: 'Day number, 1-based.' },
          title: { type: 'string', description: 'Theme of the day in 2-5 words, e.g. "Old Cebu City".' },
          start: { type: 'string', description: 'Leave time, HH:MM 24-hour.' },
          stops: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['ref', 'name', 'area', 'cat', 'mins', 'lat', 'lon'],
              properties: {
                ref: { type: 'string', description: 'The id of an existing stop (S1, S2, ...), or "" for a place you are adding.' },
                name: { type: 'string', description: 'Official name of the place.' },
                area: { type: 'string', description: 'Town or city in Cebu.' },
                cat: { type: 'string', enum: CATS },
                mins: { type: 'integer', description: 'Minutes spent there, 15-480.' },
                lat: { type: 'number' },
                lon: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
};

const ORGANIZE_SYSTEM = `You organise a traveller's wishlist for a road trip around Cebu province, Philippines, into days. You receive the wishlist (S ids, must-dos marked), the day each item is on now (if any), the hotel options (H ids, price per night for the whole group, must-stays marked), which nights are fixed to a hotel, a driving matrix (minutes / km) between all of them, and the traveller's own notes on how they want to travel. Return the complete day-by-day itinerary and the hotel for each night.

You decide which wishlist places to include, which day each goes on, their order, each day's leave time, and how long to spend at each.
- Follow the traveller's notes closely: they are your criteria and constraints (pace, hours, driving limits, must-dos, timing wishes). Where the notes don't say, plan a balanced trip: leave from 07:00, back by 21:00, under about 4 hours of driving a day.
- Include every must-do unless it truly cannot fit. Include other wishlist places when they fit; leave the rest out (they stay on the wishlist).
- Only add places that are not on the wishlist (ref "") when the notes ask for it, for example "add a lunch spot each day". Then add only real, well-known places in Cebu province you are confident exist, with their official name, town, category and coordinates.
- Hotels: pick one hotel (H id) for every night; a night comes after each day except the last. Keep every fixed night as given. Use each MUST-STAY hotel for at least one night. Otherwise choose hotels that keep the whole trip cheap (nightly price plus driving to and from them) and sit well for the next day's places, unless the notes say otherwise. Use "" only when there are no hotel options.
- Day N starts at the previous night's hotel and ends at that night's hotel; day 1 starts at its first stop and the last day ends at its last stop.
- Take drive times between listed places from the matrix.
- Plan around opening hours, morning-only activities, sunrise and sunset viewpoints, and midday heat.
- Each place appears at most once. "start" is HH:MM, 24-hour; "mins" is 15 to 480. Return every day, numbered from 1.`;

const SUGGEST_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['places'],
  properties: {
    places: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'area', 'cat', 'mins', 'lat', 'lon', 'tag'],
        properties: {
          name: { type: 'string', description: 'Official name of the place.' },
          area: { type: 'string', description: 'Town or city in Cebu.' },
          cat: { type: 'string', enum: CATS },
          mins: { type: 'integer', description: 'Typical visit length in minutes.' },
          lat: { type: 'number' },
          lon: { type: 'number' },
          tag: { type: 'string', description: 'What it is best for, at most 4 words, e.g. "Sunset views".' },
        },
      },
    },
  },
};

const SUGGEST_SYSTEM = `You suggest places to visit in Cebu province, Philippines, for a traveller's wishlist. Suggest 10 real, well-known places you are confident exist, each with its official name, town, category, a typical visit length in minutes, coordinates, and a tag of at most 4 words saying what it is best for. Match the traveller's interests and wishes, spread the places sensibly, and favour areas near their hotels when they have some. Never repeat a place already on their wishlist.`;

const label = (i, n) => (i < n ? `S${i + 1}` : `H${i - n + 1}`);
const inCebuBox = (lat, lon) => lat > 9.3 && lat < 11.45 && lon > 123.2 && lon < 124.25;
const kmBetween = (a, b) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const hhmm = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };

async function driveMatrix(points) {
  if (points.length < 2) return { min: [[0]], km: [[0]], approx: false };
  const coords = points.map(p => `${(+p.lon).toFixed(5)},${(+p.lat).toFixed(5)}`).join(';');
  try {
    const d = await politeFetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`);
    if (d.code !== 'Ok') throw new Error(d.message);
    return { min: d.durations.map(r => r.map(v => (v == null ? null : v / 60))), km: d.distances.map(r => r.map(v => (v == null ? null : v / 1000))), approx: false };
  } catch {
    // Straight line × road factor at 35 km/h if the routing service is down
    const km = points.map(a => points.map(b => kmBetween(a, b) * 1.35));
    return { min: km.map(r => r.map(k => (k / 35) * 60)), km, approx: true };
  }
}

/** Total km and minutes for a plan, given each day's ordered point indices. */
function totals(sequences, M) {
  let km = 0, min = 0;
  for (const seq of sequences) for (let k = 1; k < seq.length; k++) { km += M.km[seq[k - 1]]?.[seq[k]] || 0; min += M.min[seq[k - 1]]?.[seq[k]] || 0; }
  return { km: Math.round(km), min: Math.round(min) };
}

/** Pin a place the AI named to real OpenStreetMap coordinates (nearest match to its own guess). */
async function locate(place) {
  const guess = { lat: +place.lat, lon: +place.lon };
  const hasGuess = Number.isFinite(guess.lat) && Number.isFinite(guess.lon) && inCebuBox(guess.lat, guess.lon);
  const pick = (rows) => {
    const hits = rows.filter(r => inCebu(r)).map(r => ({ lat: +r.lat, lon: +r.lon, wiki: r.extratags?.wikipedia || null }));
    if (!hits.length) return null;
    if (!hasGuess) return hits[0];
    const best = hits.reduce((a, b) => (kmBetween(a, guess) <= kmBetween(b, guess) ? a : b));
    return kmBetween(best, guess) < 30 ? best : null;
  };
  try {
    const found = pick(await nominatim({ q: `${place.name}, ${place.area}`, limit: '5', viewbox: CEBU_VIEWBOX, bounded: '1', extratags: '1' }))
      || pick(await nominatim({ q: place.name, limit: '5', viewbox: CEBU_VIEWBOX, bounded: '1', extratags: '1' }));
    if (found) return { ...found, exact: true };
  } catch {}
  return hasGuess ? { ...guess, exact: false } : null;
}

/** Pins AI-named places and drops ones that can't be found or duplicate a place already in `taken`. */
async function pinNew(items, taken) {
  const located = await Promise.all(items.map(locate));
  return items.map((item, j) => {
    const loc = located[j];
    if (!loc || taken.some(t => kmBetween(t, loc) < 0.15)) return null;
    taken.push(loc);
    return { ...item, lat: +loc.lat.toFixed(5), lon: +loc.lon.toFixed(5), wiki: loc.wiki || null, id: `ai-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}` };
  }).filter(Boolean);
}

async function askClaude({ apiKey, system, prompt, schema }) {
  try {
    const stream = new Anthropic({ apiKey }).beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // if Claude declines, the API retries on a fallback model instead of failing
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') return { error: 'The AI declined this request. Try different wishes.' };
    if (message.stop_reason === 'max_tokens') return { error: 'The AI answer was cut off. Try again.' };
    return { data: JSON.parse(message.content.find(b => b.type === 'text')?.text || '') };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { status: 401, code: 'bad_key', error: 'That Claude API key was rejected. Paste a working one.' };
    if (e instanceof Anthropic.RateLimitError) return { status: 429, error: 'Too many AI requests right now. Try again in a minute.' };
    if (e instanceof Anthropic.APIError) return { error: `AI request failed (${e.status ?? 'network'}): ${e.message}` };
    if (e instanceof SyntaxError) return { error: 'The AI returned an unreadable answer. Try again.' };
    return { error: e.message || 'AI request failed' };
  }
}

const fail = (r) => NextResponse.json({ code: r.code, error: r.error }, { status: r.status || 502 });

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const str = (v, n = 120) => String(v ?? '').slice(0, n);
  const num = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);
  const days = Array.isArray(body.days) ? body.days.slice(0, 10) : [];
  const prefs = body.prefs || {};

  // Wishlist places (S) and distinct hotels (H)
  const stops = (Array.isArray(body.places) ? body.places : []).slice(0, 60)
    .filter(p => num(p.lat) != null && num(p.lon) != null)
    .map(p => ({ uid: str(p.uid, 40), name: str(p.name), area: str(p.area), lat: +p.lat, lon: +p.lon, mins: Math.round(num(p.mins) || 60), must: !!p.must }));
  const n = stops.length;
  const idx = new Map(stops.map((s, k) => [s.uid, k]));
  const hotels = [], hotelIdx = new Map(), onDay = new Map();
  const dayInfo = days.map((d, i) => {
    const ids = [];
    for (const u of (Array.isArray(d.order) ? d.order : [])) {
      const k = idx.get(u);
      if (k == null || onDay.has(k)) continue;
      onDay.set(k, i);
      ids.push(k);
    }
    let hotel = null;
    if (d.stay && num(d.stay.lat) != null && num(d.stay.lon) != null) {
      const key = `${(+d.stay.lat).toFixed(5)},${(+d.stay.lon).toFixed(5)}`;
      if (!hotelIdx.has(key)) { hotels.push({ name: str(d.stay.name), area: str(d.stay.area), lat: +d.stay.lat, lon: +d.stay.lon }); hotelIdx.set(key, hotels.length - 1); }
      hotel = hotelIdx.get(key);
    }
    return { date: str(d.date, 30), start: /^\d{1,2}:\d{2}$/.test(d.start) ? d.start : '08:00', ids, hotel };
  });
  const extra = stops.map((_, k) => k).filter(k => !onDay.has(k));

  // ── Lowest cost: gas + one hotel per night (no AI) ──
  if (body.mode === 'cost') {
    if (!n) return NextResponse.json({ error: 'Add some places first.' }, { status: 400 });
    const { cands, fixed, unpriced } = hotelOptions(body, days);
    const fuel = body.fuel || {};
    const gasPerKm = (num(fuel.pricePerL) || 65) / Math.max(1, num(fuel.kmPerL) || 10);
    const Mc = await driveMatrix([...stops, ...cands]);
    const slots = dayInfo.map(d => ({ ids: d.ids, start: d.start }));
    const backByMin = hhmm(prefs.backBy) ?? 21 * 60;
    // Today's plan, priced the same way (current hotel choices, current order)
    const candIdx = new Map(cands.map((c, h) => [c.uid, h]));
    const curHotels = days.slice(0, Math.max(0, days.length - 1)).map(d => (candIdx.has(d.hotel) ? candIdx.get(d.hotel) : null));
    let bKm = 0, bMin = 0, bStay = 0;
    dayInfo.forEach((d, i) => {
      const seq = [...(i > 0 && curHotels[i - 1] != null ? [n + curHotels[i - 1]] : []), ...d.ids, ...(i < dayInfo.length - 1 && curHotels[i] != null ? [n + curHotels[i]] : [])];
      for (let k = 1; k < seq.length; k++) { bKm += Mc.km[seq[k - 1]]?.[seq[k]] || 0; bMin += Mc.min[seq[k - 1]]?.[seq[k]] || 0; }
    });
    curHotels.forEach(h => { if (h != null) bStay += cands[h].nightly; });
    const res = minCost({ stops, slots, cands, M: Mc, gasPerKm, backBy: backByMin, hotelsOnly: !!body.hotelsOnly, fixed });
    const usedH = new Set(res.hotels);
    return NextResponse.json({
      days: res.days.map(d => ({ title: '', start: d.start, stops: d.ids.map(k => ({ uid: stops[k].uid, mins: stops[k].mins })) })),
      // No priced hotels → don't touch the nights at all
      hotels: cands.length ? res.hotels.map(h => (h == null ? null : cands[h].uid)) : undefined,
      unscheduled: extra.map(k => stops[k].uid),
      before: { km: Math.round(bKm), min: Math.round(bMin), gas: Math.round(bKm * gasPerKm), stay: Math.round(bStay), total: Math.round(bKm * gasPerKm + bStay) },
      after: res.totals, metric: 'cost', noHotels: cands.length === 0, approx: Mc.approx,
      unpriced,
      noPrice: cands.filter((c, h) => !c.nightly && usedH.has(h)).map(c => c.name),
      mustMissed: cands.filter((c, h) => c.must && !usedH.has(h)).map(c => c.name),
    });
  }

  // ── AI: suggest places for the wishlist ──
  if (body.mode === 'suggest') {
    const apiKey = aiKey(req);
    if (!apiKey) return NextResponse.json({ code: 'no_key', error: 'Add your Claude API key to get suggestions.' }, { status: 401 });
    const interests = (Array.isArray(body.interests) ? body.interests : []).slice(0, 10).map(x => str(x, 40));
    const prompt = `Interests: ${interests.length ? interests.join(', ') : 'a good mix'}
${str(body.note, 400).trim() ? `Wishes: "${str(body.note, 400).trim()}"\n` : ''}Group: ${Math.max(1, Math.round(num(body.people) || 2))} people, ${dayInfo.length} days.
Hotels: ${hotels.map(h => `${h.name} (${h.area || 'Cebu'})`).join('; ') || 'none chosen yet'}
Already on the wishlist: ${stops.map(s => `${s.name} (${s.area || 'Cebu'})`).join('; ') || 'nothing yet'}`;
    const r = await askClaude({ apiKey, system: SUGGEST_SYSTEM, prompt, schema: SUGGEST_SCHEMA });
    if (r.error) return fail(r);
    const names = new Set(stops.map(s => s.name.toLowerCase()));
    const items = (r.data.places || []).slice(0, 14)
      .filter(p => p?.name && !names.has(String(p.name).toLowerCase()))
      .map(p => ({ name: str(p.name).trim(), area: str(p.area, 60), cat: CATS.includes(p.cat) ? p.cat : 'pin', mins: Math.min(480, Math.max(15, Math.round(+p.mins || 90))), lat: +p.lat, lon: +p.lon, tag: str(p.tag, 40) }));
    return NextResponse.json({ places: await pinNew(items, stops.map(s => ({ lat: s.lat, lon: s.lon }))) });
  }

  const points = [...stops, ...hotels];
  const M = await driveMatrix(points);
  const withHotels = (perDay, nStops) => perDay.map((ids, i) => {
    const seq = [];
    const prev = i > 0 ? dayInfo[i - 1].hotel : null;
    if (prev != null) seq.push(nStops + prev);
    seq.push(...ids);
    if (dayInfo[i].hotel != null && i < dayInfo.length - 1) seq.push(nStops + dayInfo[i].hotel);
    return seq;
  });
  const before = totals(withHotels(dayInfo.map(d => d.ids), n), M);
  const backBy = hhmm(prefs.backBy) ?? 21 * 60;
  const windows = dayInfo.map(d => Math.max(4 * 60, backBy - (hhmm(d.start) ?? 8 * 60)));

  // ── Shortest route (exact, no AI) ──
  if (body.mode === 'route') {
    if (!n) return NextResponse.json({ error: 'Add some places first.' }, { status: 400 });
    const metric = body.metric === 'min' ? 'min' : 'km';
    const scope = ['day', 'each'].includes(body.scope) ? body.scope : 'trip';
    const dayIndex = Math.min(dayInfo.length - 1, Math.max(0, Math.round(num(body.day) || 0)));
    const res = shortestRoute({ dayInfo, stops, M, metric, scope, dayIndex, extra: scope === 'trip' && body.arrange ? extra : [], windows });
    const left = new Set(scope === 'trip' && body.arrange ? res.left : extra);
    return NextResponse.json({
      days: res.days.map((ids, i) => ({ title: '', start: dayInfo[i].start, stops: ids.map(k => ({ uid: stops[k].uid, mins: stops[k].mins })) })),
      unscheduled: stops.filter((_, k) => left.has(k)).map(s => s.uid),
      before, after: totals(withHotels(res.days, n), M), approx: M.approx, metric, scope,
    });
  }

  // ── AI: organise the wishlist into days ──
  const apiKey = aiKey(req);
  if (!apiKey) return NextResponse.json({ code: 'no_key', error: 'Add your Claude API key to use AI planning.' }, { status: 401 });
  if (!n) return NextResponse.json({ error: 'Add places to your wishlist first.' }, { status: 400 });

  // Hotel options the AI may choose from (same rules as Lowest cost), and nights you pinned
  const opt = hotelOptions(body, days);
  const H = opt.cands, NN = Math.max(0, dayInfo.length - 1);
  const pointsAI = [...stops, ...H];
  const MA = await driveMatrix(pointsAI);
  const fuel = body.fuel || {};
  const gasPerKm = (num(fuel.pricePerL) || 65) / Math.max(1, num(fuel.kmPerL) || 10);
  const nowNight = days.slice(0, NN).map(d => (opt.idx.has(d.hotel) ? opt.idx.get(d.hotel) : null));

  const notes = str(prefs.note, 1500).trim();
  const peso = (v) => '₱' + Math.round(v).toLocaleString('en-PH');
  const wishText = stops.map((s, k) => `${label(k, n)} ${s.name} (${s.area || 'Cebu'}), about ${s.mins} min${s.must ? ', MUST-DO' : ''}${onDay.has(k) ? `, now on day ${onDay.get(k) + 1}` : ''}`).join('\n');
  const dayText = dayInfo.map((d, i) => `Day ${i + 1} (${d.date})`).join('\n');
  const hotelText = H.map((h, k) => `${label(n + k, n)} ${h.name} (${h.area || 'Cebu'}), ${h.nightly ? `${peso(h.nightly)}/night` : 'price unknown'}${h.must ? ', MUST-STAY' : ''}`).join('\n') || '(no hotel options)';
  const nightText = Array.from({ length: NN }, (_, i) => `Night ${i + 1} (after day ${i + 1}): ${opt.fixed[i] != null ? `${label(n + opt.fixed[i], n)} (fixed)` : `choose${nowNight[i] != null ? ` (now ${label(n + nowNight[i], n)})` : ''}`}`).join('\n');
  const matrixText = pointsAI.length > 1
    ? `Driving matrix${MA.approx ? ' (straight-line estimates)' : ''}, row = from, columns in order ${pointsAI.map((_, k) => label(k, n)).join(' ')}:\n`
      + pointsAI.map((_, a) => `${label(a, n)}: ` + pointsAI.map((__, b) => (a === b ? '-' : `${Math.round(MA.min[a][b] ?? 0)}m/${Math.round(MA.km[a][b] ?? 0)}km`)).join(' ')).join('\n')
    : '';
  const prompt = `Traveller's notes:
${notes ? `---\n${notes}\n---` : '(none: plan a balanced trip)'}

Group: ${Math.max(1, Math.round(num(body.people) || 2))} people. Gas costs about ${peso(gasPerKm)} per km.

Wishlist:
${wishText}

Days:
${dayText}

Hotel options (price per night for the whole group):
${hotelText}

Nights:
${nightText || '(one-day trip: no nights)'}

${matrixText}`;

  const r = await askClaude({ apiKey, system: ORGANIZE_SYSTEM, prompt, schema: PLAN_SCHEMA });
  if (r.error) return fail(r);

  const idOf = (ref) => { const m = /^S(\d+)$/.exec(String(ref).trim()); const k = m ? +m[1] - 1 : -1; return k >= 0 && k < n ? k : null; };
  const used = new Set();
  const names = new Set(stops.map(s => s.name.toLowerCase()));
  const out = dayInfo.map(d => ({ title: '', start: d.start, stops: [] }));
  const fresh = [];
  for (const d of r.data.days || []) {
    const i = Math.round(d.day) - 1;
    if (i < 0 || i >= out.length) continue;
    if (/^\d{1,2}:\d{2}$/.test(d.start)) out[i].start = d.start.padStart(5, '0');
    out[i].title = str(d.title, 60);
    for (const s of d.stops || []) {
      const mins = Math.min(480, Math.max(15, Math.round(+s.mins || 60)));
      const k = idOf(s.ref);
      if (k != null) {
        if (used.has(k)) continue;
        used.add(k);
        out[i].stops.push({ uid: stops[k].uid, mins, k });
      } else {
        const name = str(s.name).trim();
        if (!name || names.has(name.toLowerCase())) continue;
        names.add(name.toLowerCase());
        const item = { isNew: true, name, area: str(s.area, 60), cat: CATS.includes(s.cat) ? s.cat : 'pin', mins, lat: +s.lat, lon: +s.lon, slot: [i, out[i].stops.length] };
        out[i].stops.push(item);
        fresh.push(item);
      }
    }
  }
  const pinned = new Set(await pinNew(fresh, stops.map(s => ({ lat: s.lat, lon: s.lon }))).then(list => list.map(x => { Object.assign(fresh.find(f => f.name === x.name), x, { ok: true }); return x.name; })));
  out.forEach(d => { d.stops = d.stops.filter(s => !s.isNew || pinned.has(s.name)).map(({ slot, ok, ...s }) => s); });

  // The AI's hotel picks; pinned nights always win, anything missing or invalid gets filled cheapest
  const aiNight = Array(NN).fill(null);
  for (const x of r.data.nights || []) {
    const i = Math.round(x.night) - 1;
    const m = /^H(\d+)$/.exec(String(x.hotel || '').trim());
    if (i >= 0 && i < NN && m && +m[1] >= 1 && +m[1] <= H.length) aiNight[i] = +m[1] - 1;
  }
  const finalStops = out.flatMap(d => d.stops.map(s => (s.isNew ? { ...s, mins: s.mins } : { ...stops[s.k], mins: s.mins })));
  const M2 = await driveMatrix([...finalStops, ...H]);
  let c = 0;
  const slotsAI = out.map(d => ({ ids: d.stops.map(() => c++), start: d.start }));
  const solveH = (fixed) => solveCost({ stops: finalStops, slots: slotsAI, cands: H, M: M2, gasPerKm, backBy, hotelsOnly: true, fixed });
  let plan = solveH(aiNight.map((h, i) => opt.fixed[i] ?? h));
  const musts = H.filter(h => h.must).length;
  const covered = (p) => new Set(p.hotels.filter(h => h != null && H[h].must)).size;
  if (covered(plan) < Math.min(musts, NN)) plan = solveH(opt.fixed); // AI skipped a must-stay → cheapest plan that includes it

  // Before = today's plan (your order, your nights); after = the AI's plan with its hotels
  const costOf = (dayIds, nights, M, nStops, list) => {
    let km = 0, min = 0, stay = 0;
    dayIds.forEach((ids, i) => {
      const seq = [...(i > 0 && nights[i - 1] != null ? [nStops + nights[i - 1]] : []), ...ids, ...(i < NN && nights[i] != null ? [nStops + nights[i]] : [])];
      for (let k = 1; k < seq.length; k++) { km += M.km[seq[k - 1]]?.[seq[k]] ?? 0; min += M.min[seq[k - 1]]?.[seq[k]] ?? 0; }
    });
    nights.forEach(h => { if (h != null) stay += list[h].nightly; });
    return { km: Math.round(km), min: Math.round(min), gas: Math.round(km * gasPerKm), stay: Math.round(stay), total: Math.round(km * gasPerKm + stay) };
  };
  const was = costOf(dayInfo.map(d => d.ids), nowNight, MA, n, H);
  const usedH = new Set(plan.hotels);

  return NextResponse.json({
    days: out.map(d => ({ title: d.title, start: d.start, stops: d.stops.map(({ k, ...s }) => s) })),
    hotels: H.length ? plan.hotels.map(h => (h == null ? null : H[h].uid)) : undefined,
    unscheduled: stops.filter((_, k) => !used.has(k)).map(s => s.uid),
    before: was, after: plan.totals, metric: 'cost', approx: MA.approx || M2.approx,
    unpriced: opt.unpriced,
    noPrice: H.filter((h, k) => !h.nightly && usedH.has(k)).map(h => h.name),
    mustMissed: H.filter((h, k) => h.must && !usedH.has(k)).map(h => h.name),
  });
}
