import type { Entry } from '../../../shared/protocol';

export function Logo({ eventName, size = 'md' }: { eventName?: string; size?: 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <svg viewBox="0 0 32 32" className={size === 'lg' ? 'w-12 h-12' : 'w-8 h-8'} aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--color-surface)" />
        <rect x="7" y="9" width="3" height="14" rx="1.5" fill="var(--color-main)" />
        <path d="M14 11h11M14 16h8M14 21h11" stroke="var(--color-text)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div className="min-w-0">
        <div className={`font-mono font-semibold leading-tight ${size === 'lg' ? 'text-3xl' : 'text-lg'}`}>
          type<span className="text-main">flow</span>
        </div>
        {eventName && <div className={`text-sub truncate ${size === 'lg' ? 'text-lg' : 'text-xs'}`}>{eventName}</div>}
      </div>
    </div>
  );
}

export function Leaderboard({
  title,
  entries,
  highlight,
  empty = 'No scores yet.',
  showAcc = true,
  size = 'md',
  footer,
}: {
  title: React.ReactNode;
  entries: Entry[];
  highlight?: string;
  empty?: string;
  showAcc?: boolean;
  size?: 'md' | 'lg';
  footer?: React.ReactNode;
}) {
  const lg = size === 'lg';
  return (
    <section className={`rounded-2xl bg-surface border border-line ${lg ? 'p-[1.6vw]' : 'p-4 sm:p-5'}`}>
      <h2 className={`text-sub uppercase tracking-[0.2em] font-semibold mb-3 ${lg ? 'text-[clamp(0.9rem,1.1vw,1.5rem)]' : 'text-xs'}`}>{title}</h2>
      {entries.length === 0 ? (
        <div className={`text-sub py-6 text-center ${lg ? 'text-xl' : 'text-sm'}`}>{empty}</div>
      ) : (
        <ol className="flex flex-col gap-0.5">
          {entries.map((e) => {
            const me = highlight && e.username.toLowerCase() === highlight.toLowerCase();
            return (
              <li
                key={e.username}
                className={`flex items-center gap-3 rounded-lg px-3 font-mono ${lg ? 'py-[0.45vw] text-[clamp(1.25rem,2.1vw,3.25rem)]' : 'py-1.5 text-sm sm:text-base'} ${
                  me ? 'bg-main/15 text-main' : e.rank <= 3 ? 'text-text' : 'text-text/80'
                }`}
              >
                <span className={`tabular-nums text-right ${lg ? 'w-[2.5ch]' : 'w-6'} ${e.rank <= 3 ? 'text-main' : 'text-sub'}`}>{e.rank}</span>
                <span className="flex-1 truncate">{e.username}</span>
                <span className="tabular-nums font-semibold">
                  {Math.round(e.wpm)}
                  <span className="text-sub font-normal text-[0.7em]"> wpm</span>
                </span>
                {showAcc && (
                  <span className={`tabular-nums text-sub text-right ${lg ? 'w-[5ch]' : 'w-14'}`}>{Math.round(e.acc)}%</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {footer && <div className="text-sub text-xs mt-3">{footer}</div>}
    </section>
  );
}

export function ConnectionBanner({ connected, error }: { connected: boolean; error: string | null }) {
  if (connected) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-surface border border-line px-4 py-2 text-sm text-sub shadow-lg">
      <span className="inline-block w-2 h-2 rounded-full bg-error mr-2 animate-pulse" />
      {error ? `Connection problem: ${error}` : 'Reconnecting…'}
    </div>
  );
}

export const inputCls =
  'w-full rounded-lg bg-bg border border-line px-3.5 py-2.5 text-text placeholder:text-sub/70 outline-none focus:border-main transition-colors';
export const btnCls =
  'rounded-lg px-4 py-2.5 font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
