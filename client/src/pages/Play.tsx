import { useCallback, useEffect, useState } from 'react';
import type { Me, MyResult } from '../../../shared/protocol';
import TypingBox, { Stat } from '../components/TypingBox';
import { Announcement, ConnectionBanner, Leaderboard, Logo, TouchWarning, btnCls, inputCls } from '../components/ui';
import { clearToken, fetchMe, getBest, getToken, register, setBest } from '../lib/api';
import { connect, fmtClock, useArena, useNow } from '../lib/arena';

export default function Play() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(() => !!getToken());
  const [bootError, setBootError] = useState('');

  const check = useCallback(() => {
    const token = getToken();
    if (!token) return setChecking(false);
    setChecking(true);
    setBootError('');
    fetchMe(token)
      .then((m) => {
        if (!m) clearToken();
        setMe(m);
      })
      .catch(() => setBootError('Can’t reach the contest server. Check your Wi-Fi and try again.'))
      .finally(() => setChecking(false));
  }, []);

  useEffect(check, [check]);

  if (bootError) {
    return (
      <Centered>
        <p className="text-sub mb-4">{bootError}</p>
        <button className={`${btnCls} bg-main text-bg`} onClick={check}>
          Retry
        </button>
      </Centered>
    );
  }
  if (checking) return <Centered><p className="text-sub">Loading…</p></Centered>;
  if (!me) return <Register onDone={setMe} />;
  return (
    <ArenaView
      me={me}
      onLogout={() => {
        clearToken();
        setMe(null);
      }}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh flex flex-col items-center justify-center p-4 text-center">{children}</div>;
}

function Register({ onDone }: { onDone: (me: Me) => void }) {
  const [roll, setRoll] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { me } = await register(roll, name, username);
      onDone(me);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col">
    <TouchWarning />
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Logo eventName="Typing contest" size="lg" />
        </div>
        <h1 className="text-2xl font-semibold mb-1">Register to race</h1>
        <p className="text-sub mb-6 text-sm">
          Short timed rounds start every couple of minutes. The final decides the prizes, so use your real roll number.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4 bg-surface border border-line rounded-2xl p-5">
          <Field label="Roll number" hint="Used to hand out prizes. Not shown publicly.">
            <input className={`${inputCls} font-mono uppercase`} value={roll} onChange={(e) => setRoll(e.target.value)} required minLength={3} maxLength={24} autoComplete="off" placeholder="e.g. 26B0001" />
          </Field>
          <Field label="Full name" hint="Not shown publicly.">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" placeholder="Your name" />
          </Field>
          <Field label="Username" hint="Shown on the leaderboard and the big screen. Keep it friendly.">
            <input className={`${inputCls} font-mono`} value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} required minLength={3} maxLength={16} pattern="[A-Za-z0-9_.]+" autoComplete="off" placeholder="speedy_fresher" />
          </Field>
          {error && <div className="text-error text-sm">{error}</div>}
          <button type="submit" disabled={busy} className={`${btnCls} bg-main text-bg hover:brightness-110 mt-1`}>
            {busy ? 'Registering…' : 'Join the contest'}
          </button>
        </form>
        <p className="text-sub text-xs mt-4 text-center">Playing on a laptop is strongly recommended.</p>
      </div>
    </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-sub text-xs">{hint}</span>}
    </label>
  );
}

function ArenaView({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const { state, live, myResult, lockedRound, connected, error } = useArena();
  const now = useNow(250);
  const [best, setBestState] = useState(() => getBest(me.id));

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const s = connect({ token });
    return () => {
      s.disconnect();
    };
  }, []);

  // An organizer deleted this player: go back to registration.
  useEffect(() => {
    if (error === 'not registered') onLogout();
  }, [error, onLogout]);

  const onDone = useCallback(
    (r: MyResult) => {
      if (r.kind === 'rolling' && r.wpm > getBest(me.id)) {
        setBest(me.id, r.wpm);
        setBestState(r.wpm);
      }
    },
    [me.id],
  );

  if (!state) return <Centered><p className="text-sub">Connecting…</p><ConnectionBanner connected={connected} error={error} /></Centered>;

  const r = state.round;
  const isFinal = r?.kind === 'final' || state.mode === 'final';
  const inRound = (state.phase === 'countdown' || state.phase === 'running') && r?.text && r.startAt;

  let main: React.ReactNode;
  if (inRound) {
    main = (
      <div className="w-full">
        <RoundLabel final={r.kind === 'final'} number={r.number} />
        <TypingBox key={r.id} round={{ ...r, text: r.text!, startAt: r.startAt! }} locked={lockedRound === r.id} onDone={onDone} />
        {state.phase === 'running' && live && (myResult?.roundId === r.id || now > r.startAt! + r.startWindowMs) && (
          <div className="mt-8 max-w-xl mx-auto">
            <Leaderboard title={`Live · ${live.finished} finished · ${live.typing} typing`} entries={live.top} highlight={me.username} showAcc={false} />
          </div>
        )}
      </div>
    );
  } else if (state.phase === 'results' && state.results) {
    const res = state.results;
    const mine = myResult?.roundId === res.roundId ? myResult : null;
    main = (
      <div className="w-full max-w-3xl mx-auto grid gap-6 md:grid-cols-[1fr_1.3fr] items-start">
        <div className="rounded-2xl bg-surface border border-line p-6 text-center">
          <div className="text-sub uppercase tracking-[0.2em] text-xs mb-4">
            {res.kind === 'final' ? 'Your final result' : `Round ${res.number} · your result`}
          </div>
          {mine ? (
            <>
              <div className="flex justify-center gap-8 font-mono mb-4">
                <Stat label="wpm" value={Math.round(mine.wpm)} big />
                <Stat label="acc" value={`${Math.round(mine.acc)}%`} big />
              </div>
              <div className="font-mono text-sub text-sm">
                raw {Math.round(mine.raw)}
                {mine.rank && (
                  <>
                    {' · '}
                    <span className="text-text">
                      #{mine.rank} of {mine.of}
                    </span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="text-sub py-6">You didn't play this round.</div>
          )}
          {res.kind === 'rolling' && <div className="text-sub text-sm mt-5">Next round starting in a few seconds…</div>}
          {res.kind === 'final' && <div className="text-main text-sm mt-5">Winners are revealed on the big screen!</div>}
        </div>
        {res.kind === 'final' && res.top.length === 0 && res.count > 0 ? (
          <div className="rounded-2xl bg-surface border border-line p-6 text-center">
            <div className="text-main uppercase tracking-[0.2em] text-xs font-semibold mb-3">Final standings</div>
            <div className="text-xl font-semibold mb-1">Eyes on the big screen 👀</div>
            <p className="text-sub text-sm">The standings appear here once the winners have been revealed.</p>
          </div>
        ) : (
          <Leaderboard
            title={res.kind === 'final' ? 'Final standings' : `Round ${res.number} · top ${res.top.length} of ${res.count}`}
            entries={res.top}
            highlight={me.username}
          />
        )}
      </div>
    );
  } else {
    const countdown = r?.startAt ? r.startAt - now : null;
    main = (
      <div className="w-full max-w-4xl mx-auto grid gap-6 md:grid-cols-[1.1fr_1fr] items-start">
        <div className="rounded-2xl bg-surface border border-line p-6 sm:p-8">
          {state.phase === 'idle' ? (
            <>
              <div className="text-sub uppercase tracking-[0.2em] text-xs mb-3">On a break</div>
              <div className="text-2xl font-semibold mb-2">Rounds are paused</div>
              <p className="text-sub">The organizers will start the next round shortly. Stay on this page.</p>
            </>
          ) : isFinal ? (
            <>
              <div className="text-main uppercase tracking-[0.2em] text-xs mb-3 font-semibold">The final</div>
              <div className="text-3xl font-semibold mb-3">The prize round is about to begin</div>
              <ul className="text-sub space-y-1.5 text-sm list-disc pl-5">
                <li>One {r ? r.durationMs / 1000 : 60}-second attempt. It can't be retried.</li>
                <li>Ranked by WPM, with accuracy breaking ties.</li>
                <li>Your timer begins on your first keystroke, within {r ? r.startWindowMs / 1000 : 8}s of GO.</li>
                <li>Keep this tab focused. Don't refresh.</li>
              </ul>
              <div className="mt-6 font-mono text-main text-lg">Waiting for the organizers…</div>
            </>
          ) : (
            <>
              <div className="text-sub uppercase tracking-[0.2em] text-xs mb-3">Round {r?.number} starts in</div>
              <div className="font-mono text-main text-7xl sm:text-8xl tabular-nums mb-5">{countdown !== null ? fmtClock(countdown) : '–'}</div>
              <ul className="text-sub space-y-1.5 text-sm">
                <li>{r ? r.durationMs / 1000 : state.rollingSeconds} seconds · Monkeytype-style scoring</li>
                <li>Your timer starts on your first keystroke</li>
                <li>Play as many rounds as you like. Your best counts for tonight's board.</li>
              </ul>
            </>
          )}
          {best > 0 && (
            <div className="mt-6 pt-4 border-t border-line text-sm text-sub">
              Your best tonight: <span className="font-mono text-text">{Math.round(best)} wpm</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-6">
          {state.final && state.mode !== 'final' && <Leaderboard title="Final standings" entries={state.final.top} highlight={me.username} />}
          <Leaderboard title="Tonight's top typists" entries={state.tonight} highlight={me.username} empty="Be the first on the board!" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <Announcement message={state.announcement} />
      <TouchWarning />
      <header className="flex items-center justify-between gap-4 px-4 sm:px-8 py-4 max-w-6xl w-full mx-auto">
        <Logo eventName={state.eventName} />
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline text-sub">{state.online} online</span>
          <span className="rounded-full bg-surface border border-line px-3 py-1.5 font-mono">{me.username}</span>
          <button className="text-sub hover:text-text text-xs" onClick={onLogout} title="Sign out on this device">
            not you?
          </button>
        </div>
      </header>
      <main className="flex-1 flex items-center px-4 sm:px-8 py-6 max-w-5xl w-full mx-auto">{main}</main>
      <ConnectionBanner connected={connected} error={error} />
    </div>
  );
}

function RoundLabel({ final, number }: { final: boolean; number: number }) {
  return (
    <div className="text-center mb-6">
      <span className={`uppercase tracking-[0.3em] text-xs font-semibold ${final ? 'text-main' : 'text-sub'}`}>
        {final ? '★ The final ★' : `Round ${number}`}
      </span>
    </div>
  );
}
