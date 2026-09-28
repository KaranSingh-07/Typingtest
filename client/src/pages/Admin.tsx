import { useCallback, useEffect, useState } from 'react';
import type { AdminAction, AdminStats } from '../../../shared/protocol';
import { AnnouncementPanel, DqButton, PlayersPanel, RoundLengthControl, request } from './AdminPanels';
import { Leaderboard, Logo, btnCls, inputCls } from '../components/ui';
import { connect, fmtClock, useArena, useNow } from '../lib/arena';

const KEY = 'tf_admin';
const load = () => {
  try {
    return sessionStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
};
const save = (v: string) => {
  try {
    sessionStorage.setItem(KEY, v);
  } catch {
    /* ignore */
  }
};

export default function Admin() {
  const [token, setToken] = useState(load);
  const [draft, setDraft] = useState('');
  if (!token) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <form
          className="w-full max-w-sm bg-surface border border-line rounded-2xl p-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(draft);
            setToken(draft);
          }}
        >
          <Logo eventName="Organizer console" club />
          <input className={inputCls} type="password" placeholder="Admin token" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <button className={`${btnCls} bg-main text-bg`}>Enter</button>
        </form>
      </div>
    );
  }
  return (
    <Console
      token={token}
      onLogout={() => {
        save('');
        setToken('');
      }}
    />
  );
}

function Console({ token, onLogout }: { token: string; onLogout: () => void }) {
  const { state, live, connected, error } = useArena();
  const now = useNow(250);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [msg, setMsg] = useState('');
  const [hideName, setHideName] = useState('');

  useEffect(() => {
    const s = connect({ admin: token });
    return () => {
      s.disconnect();
    };
  }, [token]);

  const send = useCallback(async (action: AdminAction) => {
    const res = await request(action);
    if (!res) return setMsg('No response from server.');
    if (!res.ok) return setMsg(res.error);
    if (res.data) setStats(res.data);
    if (!['stats', 'findUsers', 'userResults'].includes(action.type)) setMsg(`Done: ${action.type}`);
    return res.data;
  }, []);

  useEffect(() => {
    if (!connected) return;
    send({ type: 'stats' });
    const id = setInterval(() => send({ type: 'stats' }), 5000);
    return () => clearInterval(id);
  }, [connected, send]);

  const download = async (kind: 'final' | 'players' | 'final-archive') => {
    const res = await fetch(`/api/admin/export/${kind}`, { headers: { 'x-admin-token': token } });
    if (!res.ok) return setMsg('Export failed (check the token).');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `typeflow-${kind}-${new Date().toISOString().slice(0, 16).replace(':', '')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (error === 'bad admin token') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
        <p className="text-error">Wrong admin token.</p>
        <button className={`${btnCls} bg-surface border border-line`} onClick={onLogout}>
          Try again
        </button>
      </div>
    );
  }

  const r = state?.round;
  const busy = state?.phase === 'countdown' || state?.phase === 'running';
  const confirmSend = (text: string, action: AdminAction) => window.confirm(text) && send(action);
  const finalDone = state?.phase === 'results' && state.results?.kind === 'final';
  const revealing = !!state?.revealAt && now < state.revealAt + state.revealMs;
  let timing = '';
  if (r?.startAt) {
    if (now < r.startAt) timing = `GO in ${fmtClock(r.startAt - now)}`;
    else if (r.closeAt && now < r.closeAt) timing = `closes in ${fmtClock(r.closeAt - now)}`;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <Logo eventName="Organizer console" club />
        <div className="flex items-center gap-4 text-sm">
          <span className={connected ? 'text-main' : 'text-error'}>{connected ? '● connected' : '● offline'}</span>
          <a className="text-sub hover:text-text" href="/screen" target="_blank" rel="noreferrer">
            open projector ↗
          </a>
          <button className="text-sub hover:text-text" onClick={onLogout}>
            sign out
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        <Card label="Mode" value={state?.mode ?? '–'} />
        <Card label="Phase" value={`${state?.phase ?? '–'}${r ? ` · ${r.kind === 'final' ? 'final' : `round ${r.number}`}` : ''}`} sub={timing} />
        <Card label="Online" value={stats?.online ?? state?.online ?? '–'} sub={live && busy ? `${live.typing} typing · ${live.finished} submitted` : ''} />
        <Card label="Registered" value={stats?.registered ?? '–'} sub={stats ? `${stats.rollingResults} rolling scores` : ''} />
      </section>

      <section className="rounded-2xl bg-surface border border-line p-5 flex flex-col gap-4">
        <h2 className="text-sub uppercase tracking-[0.2em] text-xs font-semibold">Rolling rounds</h2>
        <div className="flex flex-wrap gap-3">
          <button className={`${btnCls} bg-bg border border-line hover:border-main`} onClick={() => send({ type: 'resume' })}>
            ▶ Run rolling rounds
          </button>
          <button className={`${btnCls} bg-bg border border-line hover:border-main`} onClick={() => send({ type: 'pause' })}>
            ❚❚ Pause after this round
          </button>
          <button className={`${btnCls} bg-bg border border-line hover:border-error text-error`} disabled={!r || !(busy || state?.phase === 'waiting')} onClick={() => confirmSend('Abort the current round? Its scores are discarded.', { type: 'abort' })}>
            ✕ Abort current round
          </button>
        </div>
        <RoundLengthControl current={state?.rollingSeconds} send={send} />

        <h2 className="text-sub uppercase tracking-[0.2em] text-xs font-semibold mt-2">The final</h2>
        <ol className="text-sub text-sm list-decimal pl-5 space-y-1">
          <li><b className="text-text">Prepare final</b>: rolling rounds stop (a running round finishes first). Everyone sees "get ready".</li>
          <li><b className="text-text">Start final</b>: a 10s countdown, then one 60s attempt. A previous final's scores are archived.</li>
          <li><b className="text-text">Reveal podium</b>: the projector counts down 10th → 1st (about 25s). Players see the standings once it ends.</li>
          <li>Results stay up until you resume rolling rounds. Resuming before the reveal shows everyone the standings.</li>
        </ol>
        <div className="flex flex-wrap gap-3">
          <button className={`${btnCls} bg-bg border border-main text-main`} onClick={() => send({ type: 'prepareFinal' })}>
            1 · Prepare final
          </button>
          <button
            className={`${btnCls} bg-main text-bg`}
            disabled={!(state?.mode === 'final' && state.phase === 'waiting' && r?.kind === 'final')}
            onClick={() =>
              confirmSend(
                state?.final
                  ? `Start a NEW final? The current final results (${state.final.count} scores) will be archived and replaced. Download the final CSV first if you need it.`
                  : 'Start the FINAL now? Everyone gets a 10 second countdown.',
                { type: 'startFinal' },
              )
            }
          >
            2 · Start final
          </button>
          <button className={`${btnCls} bg-main text-bg`} disabled={!finalDone || revealing} onClick={() => send({ type: 'reveal' })}>
            {revealing ? 'Revealing…' : state?.revealAt ? '3 · Replay podium reveal' : '3 · Reveal podium'}
          </button>
          <button className={`${btnCls} bg-bg border border-line`} onClick={() => download('final')}>
            ⤓ Final results CSV
          </button>
          <button className={`${btnCls} bg-bg border border-line`} onClick={() => download('players')}>
            ⤓ All players CSV
          </button>
          <button className={`${btnCls} bg-bg border border-line`} onClick={() => download('final-archive')}>
            ⤓ Archived finals CSV
          </button>
        </div>
        {msg && <div className="text-sm text-main">{msg}</div>}
      </section>

      <AnnouncementPanel current={state?.announcement ?? null} send={send} />

      <PlayersPanel send={send} />

      <div className="grid gap-6 md:grid-cols-2 items-start">
        <div className="flex flex-col gap-6">
          {state?.final && <Leaderboard title={`Final · ${state.final.count} scores`} entries={state.final.top} />}
          <Leaderboard title="Tonight's best (rolling)" entries={state?.tonight ?? []} />
        </div>
        <div className="flex flex-col gap-6">
          <section className="rounded-2xl bg-surface border border-line p-5">
            <h2 className="text-sub uppercase tracking-[0.2em] text-xs font-semibold mb-3">Moderation</h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (hideName.trim()) send({ type: 'hideUser', username: hideName.trim(), hidden: true });
                setHideName('');
              }}
            >
              <input className={inputCls} placeholder="username to hide from boards" value={hideName} onChange={(e) => setHideName(e.target.value)} />
              <button className={`${btnCls} bg-bg border border-line shrink-0`}>Hide</button>
            </form>
            <button
              className={`${btnCls} bg-bg border border-line text-sm mt-3`}
              onClick={() => confirmSend('Delete every load-test bot (roll LT…, name "Load Test Bot") and their scores?', { type: 'purgeBots' })}
            >
              Remove load-test bots
            </button>
            {stats && stats.hidden.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.hidden.map((u) => (
                  <button key={u} className="text-xs font-mono rounded-full bg-bg border border-line px-2.5 py-1 hover:border-main" title="Unhide" onClick={() => send({ type: 'hideUser', username: u, hidden: false })}>
                    {u} ✕
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-2xl bg-surface border border-line p-5">
            <h2 className="text-sub uppercase tracking-[0.2em] text-xs font-semibold mb-1">Flagged scores</h2>
            <p className="text-sub text-xs mb-3">Automatic checks for unusually fast or machine-like typing. Verify in person before awarding prizes.</p>
            {!stats?.flagged.length ? (
              <div className="text-sub text-sm">Nothing flagged.</div>
            ) : (
              <ul className="text-sm font-mono space-y-1.5">
                {stats.flagged.map((f) => (
                  <li key={f.id} className="flex justify-between items-center gap-3">
                    <span className="truncate">
                      {f.username} <span className="text-sub">({f.roll}, {f.kind})</span>
                    </span>
                    <span className="text-error shrink-0">
                      {Math.round(f.wpm)} wpm · {f.reason}
                    </span>
                    <DqButton
                      onClick={() => confirmSend(`Disqualify ${f.username}'s ${Math.round(f.wpm)} wpm score? This deletes it.`, { type: 'disqualify', resultId: f.id })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <div className="text-sub uppercase tracking-[0.2em] text-[10px] font-semibold">{label}</div>
      <div className="text-xl font-mono mt-1">{value}</div>
      {sub && <div className="text-sub text-xs mt-1 font-mono">{sub}</div>}
    </div>
  );
}
