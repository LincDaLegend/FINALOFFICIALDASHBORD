'use client';

// Trip state + road distances for the Cebu trip planner (temporary feature).
import { useEffect, useRef, useState } from 'react';
import { DAYS, dayPoints, routeKey, estimateLegs, gasCost, nightlyFor, stayOf, emptyTrip, migrateTrip } from './tripData.js';

const KEY = 'cebuTrip_v2';
const OLD_KEY = 'cebuTrip_v1';
const BACKUP_KEY = 'cebuTrip_backup';
// Tests set localStorage.tripDoc = 'trip-test' so they never touch the real shared trip
const api = () => { try { return `/api/shared?key=${localStorage.getItem('tripDoc') === 'trip-test' ? 'trip-test' : 'trip'}`; } catch { return '/api/shared?key=trip'; } };
const POLL_MS = 10000;
const SAVE_MS = 900;

function loadLocal() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY));
    if (t?.days?.length === DAYS) return migrateTrip(t);
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if (old?.days?.length === DAYS) return migrateTrip(old); // carry the earlier plan over
  } catch {}
  return emptyTrip();
}

const hasContent = (t) => !!(t && (t.pool?.length || t.hotels?.length));

/**
 * The trip, shared with everyone who has the link (via /api/shared), with this browser's copy as a cache.
 * Returns [trip, setTrip, sync] where sync.status is 'connecting' | 'live' | 'saving' | 'offline' | 'local'.
 * `onRemote(kind)` is called when someone else's edit replaces what's on screen ('update' | 'conflict').
 */
export function useTrip({ onRemote } = {}) {
  const [trip, setTrip] = useState(loadLocal);
  const [status, setStatus] = useState('connecting');
  const [kick, setKick] = useState(0); // forces a save when this browser's plan seeds the shared one
  const etag = useRef(null);
  const serverJson = useRef(null); // the trip as the server has it (JSON), so we only send real edits
  const ready = useRef(false);
  const pending = useRef(false);
  const latest = useRef(trip);
  const notify = useRef(onRemote);
  latest.current = trip;
  notify.current = onRemote;

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(trip)); } catch {} }, [trip]);

  const adopt = (data, tag) => {
    const t = migrateTrip(data);
    etag.current = tag;
    serverJson.current = JSON.stringify(t);
    setTrip(t);
  };

  // Pull: first load, then every few seconds while the page is visible, and on focus
  useEffect(() => {
    let alive = true;
    const pull = async (first = false) => {
      if (pending.current || document.hidden) return;
      try {
        const r = await fetch(api(), { cache: 'no-store', headers: etag.current ? { 'If-None-Match': etag.current } : {} });
        if (!alive) return;
        if (r.status === 503) { setStatus('local'); return; }
        if (r.status === 304) { setStatus('live'); return; }
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (!alive || pending.current) return;
        const remote = d.data?.days?.length === DAYS ? d.data : null;
        const mine = latest.current;
        if (first && !hasContent(remote) && hasContent(mine)) {
          // Nothing shared yet: this browser's plan becomes the shared one
          etag.current = d.etag; serverJson.current = remote ? JSON.stringify(migrateTrip(remote)) : null;
          ready.current = true; setKick(k => k + 1); return;
        } else if (remote) {
          const json = JSON.stringify(migrateTrip(remote));
          if (json !== JSON.stringify(mine)) {
            if (first && hasContent(mine)) { try { localStorage.setItem(BACKUP_KEY, JSON.stringify(mine)); } catch {} }
            adopt(remote, d.etag);
            if (!first) notify.current?.('update');
          } else { etag.current = d.etag; serverJson.current = json; }
        } else { etag.current = d.etag; serverJson.current = null; }
        ready.current = true;
        setStatus('live');
      } catch { if (alive) setStatus(s => (s === 'local' ? s : 'offline')); }
    };
    pull(true);
    const id = setInterval(() => (ready.current ? pull() : pull(true)), POLL_MS);
    const onFocus = () => (ready.current ? pull() : pull(true));
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { alive = false; clearInterval(id); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Push: shortly after each edit
  useEffect(() => {
    if (!ready.current) return;
    const json = JSON.stringify(trip);
    if (json === serverJson.current) return;
    pending.current = true;
    setStatus('saving');
    const t = setTimeout(async () => {
      try {
        const r = await fetch(api(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: trip, etag: etag.current }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok) { etag.current = d.etag; serverJson.current = json; setStatus('live'); }
        else if (r.status === 409 && d.data) { adopt(d.data, d.etag); setStatus('live'); notify.current?.('conflict'); }
        else if (r.status === 503) setStatus('local');
        else setStatus('offline');
      } catch { setStatus('offline'); }
      finally { pending.current = false; }
    }, SAVE_MS);
    return () => { clearTimeout(t); pending.current = false; };
  }, [trip, kick]);

  return [trip, setTrip, { status }];
}

const inflight = new Set();

/** Driving legs per day from OSRM (via /api/trip), debounced; straight-line estimates until they arrive. */
export function useRoutes(trip) {
  const [routes, setRoutes] = useState({});
  const days = trip.days.map((_, i) => {
    const pts = dayPoints(trip, i);
    return { pts, key: pts.length > 1 ? routeKey(pts) : null };
  });
  const sig = days.map(d => d.key).join('|');

  useEffect(() => {
    const t = setTimeout(() => {
      days.forEach(({ key }) => {
        if (!key || routes[key] || inflight.has(key)) return;
        inflight.add(key);
        fetch(`/api/trip?kind=drive&pts=${encodeURIComponent(key)}`)
          .then(r => r.json())
          .then(d => setRoutes(r => ({ ...r, [key]: d.legs ? d : { error: d.error || 'Route unavailable' } })))
          .catch(() => setRoutes(r => ({ ...r, [key]: { error: 'You seem to be offline' } })))
          .finally(() => inflight.delete(key));
      });
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return days.map(({ pts, key }) => {
    if (!key) return { pts, legs: [], line: null };
    const r = routes[key];
    if (!r) return { pts, legs: estimateLegs(pts), line: null, loading: true };
    if (r.error) return { pts, legs: estimateLegs(pts), line: null, error: r.error };
    return { pts, legs: r.legs, line: r.line };
  });
}

export function dayCost(trip, i, route) {
  const km = route.legs.reduce((s, l) => s + l.km, 0);
  const ferryKm = route.legs.reduce((s, l) => s + (l.ferryKm || 0), 0);
  const min = route.legs.reduce((s, l) => s + l.min, 0);
  const visit = route.pts.filter(p => p.role === 'stop').reduce((s, p) => s + (p.mins || 0), 0);
  const hotel = i < DAYS - 1 ? stayOf(trip, i) : null;
  const stay = hotel ? nightlyFor(hotel) : 0;
  return { km, ferryKm, min, visit, gas: gasCost(km - ferryKm, trip.fuel), stay, estimated: route.legs.some(l => l.estimated) };
}
