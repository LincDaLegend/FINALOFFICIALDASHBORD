'use client';

// The day map: Google Maps when the server has a browser key (GOOGLE_MAPS_BROWSER_KEY), else, or if Google
// refuses it, the free MapLibre / OpenStreetMap map. Each draws its own provider's route line.
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Box = () => <div className="h-[300px] lg:h-[480px] rounded-[16px] bg-fill" />;
const GoogleMap = dynamic(() => import('./TripGoogleMap.jsx'), { ssr: false, loading: Box });
const MapLibreMap = dynamic(() => import('./TripMapLibre.jsx'), { ssr: false, loading: Box });

let config = null; // { key, mapId }, asked once per page

export default function TripMap({ line, osmLine, ...props }) {
  const [conf, setConf] = useState(config);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (config) return;
    fetch('/api/trip?kind=mapkey').then(r => r.json()).catch(() => ({ key: null }))
      .then(d => { config = d; setConf(d); });
  }, []);

  if (!conf) return <Box />;
  if (conf.key && !failed) {
    return <GoogleMap apiKey={conf.key} mapId={conf.mapId} line={line} {...props}
      onFail={(why) => { console.warn('Google map unavailable, using OpenStreetMap:', why); setFailed(true); }} />;
  }
  return <MapLibreMap line={osmLine === undefined ? line : osmLine} {...props} />;
}
