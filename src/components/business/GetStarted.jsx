'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Sparkles } from 'lucide-react';
import { load, save } from '../../legacy/utils/storage.js';
import { useSettings, useSearch, loadSampleCards } from './stores.js';
import { useWatchlist } from './watchlistHooks.js';
import { Page, Group, Row, Chip, Button, SPRING } from './ui.jsx';

function StepIcon({ n, done }) {
  return (
    <span className={`w-[29px] h-[29px] rounded-full flex items-center justify-center shrink-0 text-[15px] font-semibold transition-colors duration-300 ${
      done ? 'bg-green text-white' : 'bg-fill text-label-2'}`}>
      {done ? <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={SPRING}><Check className="w-4 h-4" strokeWidth={3} aria-hidden /></motion.span> : n}
    </span>
  );
}

export default function GetStarted({ setActiveTab }) {
  const settings = useSettings();
  const search = useSearch();
  const { items } = useWatchlist();
  const [keysOk, setKeysOk] = useState(false);
  const [searched, setSearched] = useState(() => Boolean(load('hasSearched', false)));

  // Keys may live in this browser or on the server — ask the search route
  useEffect(() => {
    const headers = {};
    if (settings.ebayKey) headers['x-ebay-key'] = settings.ebayKey;
    if (settings.ebaySecret) headers['x-ebay-secret'] = settings.ebaySecret;
    fetch('/api/ebay/search', { headers }).then(r => setKeysOk(r.ok)).catch(() => {});
  }, [settings.ebayKey, settings.ebaySecret]);

  useEffect(() => {
    if (search.status === 'done' && !search.sample && !searched) { save('hasSearched', true); setSearched(true); }
  }, [search.status, search.sample, searched]);

  const saved = items.some(i => !String(i.itemId).startsWith('demo-'));
  const steps = [
    { title: 'Add your eBay keys', subtitle: 'Free from eBay — about 2 minutes', done: keysOk, go: 'settings' },
    { title: 'Find a card', subtitle: 'Type a player’s name and press Search', done: searched, go: 'search' },
    { title: 'Save one to your Watchlist', subtitle: 'Tap the heart on a card you like', done: saved, go: 'search' },
  ];
  const doneCount = steps.filter(s => s.done).length;

  return (
    <Page title="Get Started" subtitle="Baller finds cards on eBay and tells you which ones are worth buying.">
      <Group header={`Set up · ${doneCount} of ${steps.length} done`}
        footer={doneCount === steps.length ? 'All set. Go find some deals!' : 'Tap a step to go there.'}>
        {steps.map((s, i) => (
          <Row key={s.title} icon={<StepIcon n={i + 1} done={s.done} />} iconBg="transparent"
            title={<span className={s.done ? 'text-label-2' : ''}>{s.title}</span>} subtitle={s.subtitle}
            chevron onClick={() => setActiveTab(s.go)} />
        ))}
      </Group>

      <Group header="Reading a result" footer="Prices include shipping to you, converted at your exchange rate.">
        <Row title="Good price — worth buying" ><Chip tone="green">Buy</Chip></Row>
        <Row title="Maybe — check it first"><Chip tone="orange">Consider</Chip></Row>
        <Row title="Too pricey for what it is"><Chip tone="red">Skip</Chip></Row>
        <Row title="Sell for" subtitle={`What to charge to make your ${settings.targetMarginPct}% profit goal`} />
      </Group>

      <div className="space-y-2">
        <Button size="lg" onClick={() => { loadSampleCards(); setActiveTab('search'); }}>
          <Sparkles className="w-[18px] h-[18px]" aria-hidden /> Try with Sample Cards
        </Button>
        <p className="text-footnote text-label-2 text-center">No eBay keys needed — practice on three made-up cards.</p>
      </div>
    </Page>
  );
}
