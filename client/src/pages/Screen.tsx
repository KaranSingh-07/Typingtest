import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Podium from '../components/Podium';
import { Announcement, ConnectionBanner, Leaderboard, Logo } from '../components/ui';
import { connect, fmtClock, useArena, useNow } from '../lib/arena';

/** Projector view: join QR, round status and the big leaderboard. */
export default function Screen() {
  const { state, live, connected, error } = useArena();
  const now = useNow(200);
  const [qr, setQr] = useState('');
  const url = state?.publicUrl || window.location.origin;
  const joinHost = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  useEffect(() => {
    const s = connect({ screen: '1' });
    return () => {
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#16181d', light: '#e8e6df' } }).then(setQr);
  }, [url]);

  if (!state) return <div className="min-h-dvh flex items-center justify-center text-sub text-2xl">Connecting…</div>;

  // After the final: hold the standings back until the organizer starts the podium reveal.
  if (state.phase === 'results' && state.results?.kind === 'final') {
    const finalTop = state.final?.top ?? state.results.top;
    return (
      <div className="min-h-dvh flex flex-col overflow-hidden">
        <Announcement message={state.announcement} size="lg" />
        <div className="flex-1 flex flex-col p-[3vw]">
          <Logo eventName={state.eventName} size="lg" />
          {state.revealAt === null ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="text-main uppercase tracking-[0.35em] font-semibold text-[1.6vw] mb-3">★ The final is complete ★</div>
              <div className="text-[5vw] font-semibold leading-tight">The results are in…</div>
              <div className="text-sub text-[1.6vw] mt-4">{state.results.count} finalists · winners revealed shortly</div>
            </div>
          ) : (
            <Podium entries={finalTop} count={state.final?.count ?? state.results.count} elapsed={now - state.revealAt} />
          )}
        </div>
        <ConnectionBanner connected={connected} error={error} />
      </div>
    );
  }

  const r = state.round;
  const final = r?.kind === 'final' || (state.mode === 'final' && state.phase !== 'results');
  let label = '';
  let big: React.ReactNode = null;
  let sub = '';

  if (state.phase === 'idle') {
    label = 'On a break';
    big = <span className="text-text text-[6vw]">Back soon</span>;
  } else if (state.phase === 'waiting') {
    if (final) {
      label = '★ The final ★';
      big = <span className="text-[6vw] leading-none">Get ready</span>;
      sub = `One attempt · ${(r?.durationMs ?? 60000) / 1000} seconds · prizes for the top typists`;
    } else {
      label = `Round ${r?.number} starts in`;
      big = fmtClock((r?.startAt ?? now) - now);
      sub = `Scan to join · ${(r?.durationMs ?? state.rollingSeconds * 1000) / 1000}-second rounds, back to back`;
    }
  } else if (state.phase === 'countdown') {
    label = final ? '★ The final starts in ★' : `Round ${r?.number} starts in`;
    big = fmtClock((r?.startAt ?? now) - now);
  } else if (state.phase === 'running' && r?.startAt) {
    label = final ? '★ The final is live ★' : `Round ${r.number} · live`;
    big = fmtClock(r.startAt + r.startWindowMs + r.durationMs - now);
    sub = live ? `${live.typing} typing · ${live.finished} finished` : '';
  } else if (state.phase === 'results' && state.results) {
    label = state.results.kind === 'final' ? '★ Final results ★' : `Round ${state.results.number} results`;
    big = <span className="text-[5vw]">{state.results.count} typists</span>;
  }

  let board: React.ReactNode;
  if (state.phase === 'running') {
    board = <Leaderboard size="lg" title="Live · top 10" entries={live?.top ?? []} showAcc={false} empty="Waiting for the first keystrokes…" />;
  } else if (state.phase === 'results' && state.results) {
    board = (
      <Leaderboard
        size="lg"
        title={state.results.kind === 'final' ? 'Final standings' : `Round ${state.results.number} · top 10`}
        entries={state.results.top}
        empty="No finishers this round."
      />
    );
  } else {
    board = <Leaderboard size="lg" title="Tonight's top typists" entries={state.tonight} empty="Scan the code and set the first score!" />;
  }

  return (
    <div className="min-h-dvh flex flex-col">
    <Announcement message={state.announcement} size="lg" />
    <div className="flex-1 grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-[3vw] p-[3vw]">
      <div className="flex flex-col justify-between min-w-0">
        <Logo eventName={state.eventName} size="lg" />
        <div>
          <div className={`uppercase tracking-[0.25em] font-semibold text-[1.6vw] mb-2 ${final ? 'text-main' : 'text-sub'}`}>{label}</div>
          <div className="font-mono text-main tabular-nums leading-none text-[11vw]">{big}</div>
          {sub && <div className="text-sub text-[1.5vw] mt-4">{sub}</div>}
        </div>
        <div className="flex items-center gap-[2vw]">
          <div className="w-[11vw] rounded-xl overflow-hidden shrink-0" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="min-w-0">
            <div className="text-sub text-[1.2vw]">Join at</div>
            {/* One line, shrunk to fit beside the QR code (~26vw; a mono glyph is ~0.62em wide). */}
            <div className="font-mono whitespace-nowrap" style={{ fontSize: `min(2.2vw, ${(26 / (0.62 * joinHost.length)).toFixed(2)}vw)` }}>
              {joinHost}
            </div>
            <div className="text-sub text-[1.1vw] mt-1">{state.online} online · {state.players} registered</div>
          </div>
        </div>
      </div>
      <div className="min-w-0 self-center">{board}</div>
      <ConnectionBanner connected={connected} error={error} />
    </div>
    </div>
  );
}
