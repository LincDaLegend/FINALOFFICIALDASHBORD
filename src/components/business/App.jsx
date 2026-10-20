import { useState, useEffect } from 'react';
import Layout from './Layout.jsx';
import Watchlist from './Watchlist.jsx';
import Demo from './Demo.jsx';
import BusinessSettings from './BusinessSettings.jsx';
import { useBusinessStore } from './store.js';

// Lazy-boot the legacy search app only once; returns a promise
let legacyBootPromise = null;
function bootLegacy() {
  if (!legacyBootPromise) {
    legacyBootPromise = import('../../legacy/main.js').catch(e => {
      console.error('Legacy app failed to boot:', e);
      legacyBootPromise = null;
    });
  }
  return legacyBootPromise;
}

export default function BusinessApp() {
  // First visit opens the step-by-step Demo; after that, straight to Search
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem('demoSeen') ? 'search' : 'demo'; } catch { return 'search'; }
  });
  useEffect(() => { try { localStorage.setItem('demoSeen', '1'); } catch {} }, []);
  const [data, update] = useBusinessStore();

  // Boot legacy app on first Search visit; sync settings each time
  useEffect(() => {
    if (activeTab !== 'search') return;
    bootLegacy().then(() => {
      // Push business store values into legacy state so they stay in sync
      import('../../legacy/utils/state.js').then(({ state: ls, persistSettings }) => {
        ls.phpRate     = data.phpRate;
        if (data.ebayUserToken) ls.ebayToken = data.ebayUserToken;
        // Lock legacy app to search tab
        ls.tab = 'search';
        persistSettings?.();
        window.renderApp?.();
      }).catch(() => {});
    });
  }, [activeTab, data.phpRate, data.ebayUserToken]);

  const renderTab = () => {
    switch (activeTab) {
      case 'demo':         return <Demo setActiveTab={setActiveTab} />;
      case 'watchlist':    return <Watchlist phpRate={data.phpRate} setActiveTab={setActiveTab} />;
      case 'settings':     return <BusinessSettings data={data} update={update} />;
      case 'search':       return null;
      default:             return null;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {/* #app always in the DOM — legacy script must never lose its node.
          Visible only on Search tab; all legacy chrome stripped via CSS. */}
      <div
        id="app"
        suppressHydrationWarning
        style={{ display: activeTab === 'search' ? 'block' : 'none' }}
      />
      {renderTab()}
    </Layout>
  );
}
