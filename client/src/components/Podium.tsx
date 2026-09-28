import type { Entry } from '../../../shared/protocol';

// Reveal timeline in ms after the organizer presses "Reveal". The total must match CONFIG.revealMs on the server.
const INTRO_MS = 3000;
const LIST_STEP_MS = 1200; // 10th … 4th, one at a time
const THIRD_MS = 13000;
const SECOND_MS = 17000;
const FIRST_MS = 21000;

function shownAt(rank: number) {
  if (rank === 1) return FIRST_MS;
  if (rank === 2) return SECOND_MS;
  if (rank === 3) return THIRD_MS;
  return INTRO_MS + (10 - rank) * LIST_STEP_MS;
}

/** Projector podium for the final. `elapsed` is ms since the reveal started (Infinity = show everything). */
export default function Podium({ entries, elapsed, count }: { entries: Entry[]; elapsed: number; count: number }) {
  const byRank = new Map(entries.map((e) => [e.rank, e]));
  const visible = (rank: number) => elapsed >= shownAt(rank);
  const rest = entries.filter((e) => e.rank > 3);
  const intro = elapsed < INTRO_MS;

  return (
    <div className="w-full h-full flex flex-col">
      <div className={`text-center transition-all duration-700 ${intro ? 'mt-[18vh] scale-110' : 'mt-0'}`}>
        <div className="text-main uppercase tracking-[0.35em] font-semibold text-[1.4vw]">★ The final ★</div>
        <div className="font-semibold text-[3.2vw] leading-tight">{intro ? 'And the fastest typists are…' : 'Final standings'}</div>
        {!intro && <div className="text-sub text-[1.2vw]">{count} finalists</div>}
      </div>

      {!intro && (
        <div className="flex-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-[3vw] items-end mt-[2vw]">
          <ol className="flex flex-col gap-[0.5vw] self-center">
            {rest.map((e) => (
              <li
                key={e.rank}
                className={`flex items-center gap-[1vw] rounded-xl bg-surface border border-line px-[1.2vw] py-[0.6vw] font-mono text-[1.7vw] transition-all duration-500 ${
                  visible(e.rank) ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
                }`}
              >
                <span className="text-sub w-[2.5ch] text-right tabular-nums">{e.rank}</span>
                <span className="flex-1 truncate">{e.username}</span>
                <span className="tabular-nums">
                  {Math.round(e.wpm)}
                  <span className="text-sub text-[0.7em]"> wpm</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="grid grid-cols-3 gap-[1.2vw] items-end">
            {[2, 1, 3].map((rank) => {
              const e = byRank.get(rank);
              const show = visible(rank) && !!e;
              const height = rank === 1 ? 'h-[22vh]' : rank === 2 ? 'h-[15vh]' : 'h-[10vh]';
              return (
                <div key={rank} className="flex flex-col items-center min-w-0">
                  <div className={`text-center mb-[1vw] min-w-0 w-full transition-all duration-700 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                    {rank === 1 && show && <div className="text-[3vw] leading-none mb-[0.4vw] animate-bounce">🏆</div>}
                    <div className={`font-mono truncate ${rank === 1 ? 'text-[2.6vw] text-main' : 'text-[1.9vw]'}`}>{e?.username ?? '—'}</div>
                    <div className="font-mono text-sub text-[1.3vw] tabular-nums">
                      {e ? `${Math.round(e.wpm)} wpm · ${Math.round(e.acc)}%` : ''}
                    </div>
                  </div>
                  <div
                    className={`w-full ${height} rounded-t-2xl flex items-start justify-center pt-[1vw] font-mono font-semibold text-[3.5vw] transition-colors duration-700 ${
                      show ? (rank === 1 ? 'bg-main text-bg shadow-[0_0_60px_-10px_var(--color-main)]' : 'bg-surface border border-line text-text') : 'bg-surface/50 text-sub'
                    }`}
                  >
                    {rank}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
