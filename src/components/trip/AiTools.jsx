'use client';

// Plan tools: AI organizer (your notes), Least driving, Lowest cost (fit your times, then cheapest), Back by.
import { useState } from 'react';
import { WandSparkles, Loader2, Route, PiggyBank } from 'lucide-react';
import { Button, useToast } from '../business/ui.jsx';
import { useSettings } from '../business/stores.js';
import { asPlace } from './tripData.js';
import { KeyPrompt, ErrorLine, PlanPreview, postTrip, tripPayload, isKeyProblem, applyPlan, planSig } from './tripUi.jsx';


// ─── AI organiser + constraints ──────────────────────────────────────────────

export function AiOrganizer({ trip, setTrip, ops }) {
  const { anthropicKey } = useSettings();
  const toast = useToast();
  const prefs = trip.prefs;
  const [state, setState] = useState({ loading: null, res: null, error: null, code: null, sig: null });
  const set = (p) => ops.setPrefs(p);

  const run = async (kind, key = anthropicKey) => {
    const sig = planSig(trip);
    setState({ loading: kind, res: null, error: null, code: null, sig });
    try {
      const body = kind === 'route' ? { ...tripPayload(trip), mode: 'route', scope: 'trip', arrange: true, metric: 'km' }
        : kind === 'cost' ? { ...tripPayload(trip), mode: 'cost' }
        : tripPayload(trip);
      const res = await postTrip(body, kind === 'ai' ? key : undefined);
      setState({ loading: null, res: { ...res, kind }, error: null, code: null, sig });
    } catch (e) {
      setState({ loading: null, res: null, error: e.message, code: e.code, sig });
    }
  };

  const apply = () => {
    const prev = trip;
    setTrip(t => applyPlan(t, state.res, asPlace));
    setState({ loading: null, res: null, error: null, code: null, sig: null });
    toast('Days organized', <WandSparkles className="w-4 h-4 text-tint" aria-hidden />, { label: 'Undo', onClick: () => setTrip(prev) });
  };


  return (
    <section className="rounded-[18px] bg-surface overflow-hidden">
      <div className="p-4 sm:p-5 bg-gradient-to-br from-[var(--tint-soft)] to-transparent space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-tint text-white flex items-center justify-center shrink-0"><WandSparkles className="w-5 h-5" aria-hidden /></span>
          <div>
            <h2 className="text-title-2">Plan it for me</h2>
          </div>
        </div>

        {!state.res && (
          <>
            {/* One open box: the traveller writes their own criteria and constraints */}
            <label className="block">
              <span className="sr-only">How should AI plan your days?</span>
              <textarea value={prefs.note} onChange={e => set({ note: e.target.value })} maxLength={1500} rows={2}
                placeholder={'Your rules, e.g.\n- Kawasan Falls is a must\n- Back at the hotel by 9 PM\n- Max 3 h of driving a day'}
                className="w-full px-4 py-3 rounded-[14px] bg-surface text-callout leading-relaxed outline-none focus:ring-2 focus:ring-tint resize-y min-h-[72px] placeholder:text-label-3" />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => run('ai')} disabled={!!state.loading || !trip.pool.length}>
                {state.loading === 'ai' ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Organizing…</> : <><WandSparkles className="w-4 h-4" aria-hidden />Organize with AI</>}
              </Button>
              <Button variant="gray" title="Fewest km. No AI." onClick={() => run('route')} disabled={!!state.loading || !trip.pool.length}>
                {state.loading === 'route' ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Working…</> : <><Route className="w-4 h-4" aria-hidden />Least driving</>}
              </Button>
              <Button variant="gray" title="Makes every day fit your times, then cheapest gas + hotels. No AI." onClick={() => run('cost')} disabled={!!state.loading || !trip.days.some(d => d.stops.length)}>
                {state.loading === 'cost' ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Working…</> : <><PiggyBank className="w-4 h-4" aria-hidden />Lowest cost</>}
              </Button>
              <label className="ml-auto flex items-center gap-2 text-subhead text-label-2">
                Back by
                <input type="time" value={prefs.backBy || '21:00'} onChange={e => e.target.value && set({ backBy: e.target.value })}
                  className="h-9 px-2 rounded-[10px] bg-surface text-callout font-semibold text-label tabular outline-none focus:ring-2 focus:ring-tint" />
              </label>
            </div>
            {state.error && <ErrorLine>{state.error}</ErrorLine>}
            {isKeyProblem(state.code) && <KeyPrompt onKey={(k) => run('ai', k)} />}
          </>
        )}

        {state.res && (
          <PlanPreview res={state.res} trip={trip} stale={planSig(trip) !== state.sig} onApply={apply}
            onBack={() => setState({ loading: null, res: null, error: null, code: null, sig: null })} />
        )}
      </div>
    </section>
  );
}
