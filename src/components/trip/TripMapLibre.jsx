'use client';

// Fallback 3D map (no Google key): MapLibre GL + free OpenFreeMap vector tiles (no key),
// AWS open terrain tiles for real mountains, 3D buildings, Apple Maps-style pins and route.
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';

// MapLibre 6 runs tile parsing in a separate module worker; have the bundler ship that file as a static asset
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl(new URL('../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());
}
import 'maplibre-gl/dist/maplibre-gl.css';
import './trip.css';
import { colorOf } from './tripData.js';
import { pinEl, dotEl } from './mapPins.js';

const CEBU = { center: [123.85, 10.25], zoom: 8.2 };
const STYLE = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' };
const TERRAIN_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
const PITCH_3D = 55;


// Softer, Apple Maps-like palette over the OpenFreeMap "liberty" style
const APPLE_LIGHT = [
  [/^background$/, 'background-color', '#F4F2EE'],
  [/^water$|^water_/, 'fill-color', '#A9D3F2'],
  [/park|wood|grass/, 'fill-color', '#CFE8C4'],
  [/^landuse_residential$/, 'fill-color', '#EFEDE8'],
  [/^building$/, 'fill-color', '#E4E1DB'],
];

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function decorate(map, dark) {
  const style = map.getStyle();
  if (!dark) {
    for (const layer of style.layers) {
      for (const [re, prop, color] of APPLE_LIGHT) {
        if (re.test(layer.id) && prop.startsWith(layer.type)) {
          try { map.setPaintProperty(layer.id, prop, color); } catch {}
        }
      }
    }
  }

  // Real terrain + gentle hill shading (Cebu's spine of mountains shows up when tilted)
  if (!map.getSource('terrain')) {
    map.addSource('terrain', { type: 'raster-dem', tiles: TERRAIN_TILES, encoding: 'terrarium', tileSize: 256, maxzoom: 13 });
    map.addSource('hillshade-src', { type: 'raster-dem', tiles: TERRAIN_TILES, encoding: 'terrarium', tileSize: 256, maxzoom: 13 });
  }
  const firstSymbol = style.layers.find(l => l.type === 'symbol')?.id;
  if (!map.getLayer('hills')) {
    map.addLayer({
      id: 'hills', type: 'hillshade', source: 'hillshade-src',
      paint: { 'hillshade-exaggeration': dark ? 0.35 : 0.25, 'hillshade-shadow-color': dark ? '#000000' : '#6E6A61', 'hillshade-highlight-color': '#FFFFFF' },
    }, firstSymbol);
  }
  map.setTerrain({ source: 'terrain', exaggeration: 1.4 });

  // 3D buildings (the dark style ships without them)
  const extrusions = style.layers.filter(l => l.type === 'fill-extrusion');
  if (extrusions.length) {
    extrusions.forEach(l => {
      try { map.setPaintProperty(l.id, 'fill-extrusion-color', dark ? '#3A3A3C' : '#E6E3DD'); map.setPaintProperty(l.id, 'fill-extrusion-opacity', 0.9); } catch {}
    });
  } else if (style.sources.openmaptiles) {
    map.addLayer({
      id: 'trip-buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': dark ? '#3A3A3C' : '#E6E3DD',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
      },
    }, firstSymbol);
  }

  // Sky and haze toward the horizon when tilted
  try {
    map.setSky(dark
      ? { 'sky-color': '#0B1220', 'horizon-color': '#1C2433', 'fog-color': '#111827', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4, 'atmosphere-blend': 0.6 }
      : { 'sky-color': '#9CCBF2', 'horizon-color': '#E8F1FA', 'fog-color': '#F1F4F7', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.3, 'atmosphere-blend': 0.6 });
  } catch {}

  // Route: white casing under a blue line, like Apple Maps directions
  if (!map.getSource('route')) map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const width = (base) => ['interpolate', ['linear'], ['zoom'], 8, base, 12, base * 1.6, 16, base * 2.6];
  if (!map.getLayer('route-casing')) {
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': dark ? '#0A3A80' : '#FFFFFF', 'line-width': width(7) } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': dark ? '#0A84FF' : '#007AFF', 'line-width': width(4.2) } });
  }
}

/**
 * Draws one day: numbered stops, purple bed pins where you sleep, the driving line,
 * and orange dots for search results (`extras`) you can tap to add.
 */
export default function TripMapLibre({ points, line, extras = [], onPick }) {
  const box = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const ready = useRef(false);
  const latest = useRef({});
  const [is3d, setIs3d] = useState(true);
  latest.current = { points, line, extras, onPick };

  function draw(animate = true) {
    const m = map.current;
    if (!m || !ready.current) return;
    const { points, line, extras, onPick } = latest.current;

    const coords = line?.length > 1 ? line.map(([lat, lon]) => [lon, lat]) : points.map(p => [p.lon, p.lat]);
    m.getSource('route')?.setData({
      type: 'FeatureCollection',
      features: coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [],
    });

    markers.current.forEach(mk => mk.remove());
    markers.current = [];
    let n = 0;
    const seen = new Set();
    points.forEach((p) => {
      const stay = p.role !== 'stop';
      const key = `${p.lat},${p.lon}`;
      if (stay && seen.has(key)) return; // same hotel morning and night → one pin
      seen.add(key);
      const el = pinEl({ stay, name: p.name, n: stay ? null : ++n, color: stay ? null : colorOf(p) });
      markers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(m));
    });
    extras.forEach((p) => {
      markers.current.push(new maplibregl.Marker({ element: dotEl(p, onPick), anchor: 'center' }).setLngLat([p.lon, p.lat]).addTo(m));
    });

    const all = [...points.map(p => [p.lon, p.lat]), ...extras.map(p => [p.lon, p.lat])];
    const duration = animate ? 1400 : 0;
    if (all.length === 1) m.flyTo({ center: all[0], zoom: 13.5, duration, essential: true });
    else if (all.length > 1) {
      const b = all.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(all[0], all[0]));
      m.fitBounds(b, { padding: { top: 80, bottom: 50, left: 50, right: 50 }, maxZoom: 14.5, duration, pitch: m.getPitch(), bearing: m.getBearing(), essential: true });
    } else m.flyTo({ ...CEBU, duration, essential: true });
  }

  useEffect(() => {
    let dark = prefersDark();
    const m = new maplibregl.Map({
      container: box.current,
      style: dark ? STYLE.dark : STYLE.light,
      ...CEBU,
      pitch: PITCH_3D,
      bearing: -12,
      maxPitch: 75,
      attributionControl: { compact: true },
      cooperativeGestures: true, // page scroll stays page scroll; ⌘/Ctrl + scroll or two fingers move the map
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true }), 'top-right');
    m.on('style.load', () => {
      decorate(m, dark);
      ready.current = true;
      draw(false);
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = (e) => { dark = e.matches; ready.current = false; m.setStyle(dark ? STYLE.dark : STYLE.light); };
    mq.addEventListener('change', onScheme);
    return () => { mq.removeEventListener('change', onScheme); markers.current.forEach(mk => mk.remove()); m.remove(); map.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw (and glide the camera) only when what's on the map actually changes
  const sig = JSON.stringify([points.map(p => [p.lat, p.lon, p.role, p.name]), line?.length || 0, line?.[0], extras.map(p => p.id)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => draw(true), [sig]);

  const toggle3d = () => {
    const m = map.current;
    if (!m) return;
    const next = !is3d;
    setIs3d(next);
    try { m.setTerrain(next ? { source: 'terrain', exaggeration: 1.4 } : null); } catch {}
    m.easeTo({ pitch: next ? PITCH_3D : 0, bearing: next ? -12 : 0, duration: 900 });
  };

  return (
    <div className="relative">
      <div ref={box} className="trip-map h-[300px] lg:h-[480px] w-full rounded-[16px] overflow-hidden bg-fill" role="region" aria-label="Map of this day's route" />
      <button type="button" onClick={toggle3d} aria-pressed={is3d}
        className="absolute top-2.5 left-2.5 h-8 px-3 rounded-full text-[13px] font-semibold material-bar shadow-[0_2px_10px_rgba(0,0,0,0.15)] text-label pressable">
        {is3d ? '2D' : '3D'}
      </button>
    </div>
  );
}
