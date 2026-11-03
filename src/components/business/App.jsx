'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import Layout, { TABS } from './Layout.jsx';
import GetStarted from './GetStarted.jsx';
import FindCards from './FindCards.jsx';
import Watchlist from './Watchlist.jsx';
import Settings from './Settings.jsx';
import { ToastProvider } from './ui.jsx';
import { useBusinessStore } from './store.js';
import { useWatchlist } from './watchlistHooks.js';

const isTab = (id) => TABS.some(t => t.id === id);

// The URL hash names the page, so Back and bookmarks work. First visit opens Get Started.
function initialTab() {
  const hash = window.location.hash.slice(1);
  if (isTab(hash)) return hash;
  try { return localStorage.getItem('demoSeen') ? 'search' : 'start'; } catch { return 'search'; }
}

export default function BusinessApp() {
  const [activeTab, setTab] = useState(initialTab);
  const [data, update] = useBusinessStore(); // older records — kept for backup/restore
  const { items } = useWatchlist();
  const reduce = useReducedMotion();

  useEffect(() => { try { localStorage.setItem('demoSeen', '1'); } catch {} }, []);

  useEffect(() => {
    const onHash = () => { const h = window.location.hash.slice(1); if (isTab(h)) setTab(h); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setActiveTab = (id) => {
    if (id === activeTab) { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); return; } // tap again → top
    window.history.pushState(null, '', `#${id}`);
    setTab(id);
    window.scrollTo(0, 0);
  };

  const page = {
    start:     <GetStarted setActiveTab={setActiveTab} />,
    search:    <FindCards setActiveTab={setActiveTab} />,
    watchlist: <Watchlist setActiveTab={setActiveTab} />,
    settings:  <Settings data={data} update={update} />,
  }[activeTab];

  return (
    <ToastProvider>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab} watchCount={items.length}>
        <AnimatePresence mode="wait" initial={false}>
          {/* A quick cross-fade between pages — no sliding, so it never feels like you went "somewhere" */}
          <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.12 }}>
            {page}
          </motion.div>
        </AnimatePresence>
      </Layout>
    </ToastProvider>
  );
}
