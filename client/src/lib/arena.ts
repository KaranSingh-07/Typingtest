import { useEffect, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ArenaState, LiveUpdate, MyResult } from '../../../shared/protocol';

interface Snapshot {
  connected: boolean;
  error: string | null;
  state: ArenaState | null;
  live: LiveUpdate | null;
  myResult: MyResult | null;
  /** Round in which this player already has an attempt running elsewhere (e.g. before a reload). */
  lockedRound: string | null;
}

let snapshot: Snapshot = { connected: false, error: null, state: null, live: null, myResult: null, lockedRound: null };
let socket: Socket | null = null;
let offset = 0; // server clock minus local clock, in ms
const listeners = new Set<() => void>();

const set = (patch: Partial<Snapshot>) => {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
};

/** Current time on the server's clock. */
export const serverNow = () => Date.now() + offset;

async function syncClock(s: Socket) {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const server = await new Promise<number>((resolve) => s.timeout(3000).emit('time', (err: unknown, t: number) => resolve(err ? NaN : t)));
    const rtt = Date.now() - t0;
    if (Number.isFinite(server) && rtt < best) {
      best = rtt;
      offset = server - (t0 + rtt / 2);
    }
  }
}

export function connect(auth: Record<string, string>) {
  socket?.disconnect();
  // Start clean so a previous session's error (e.g. "not registered") can't leak into this one.
  set({ connected: false, error: null, myResult: null, lockedRound: null });
  // Prefer WebSocket but fall back to HTTP long-polling if a network or proxy blocks it.
  const s = io({ auth, transports: ['websocket', 'polling'], tryAllTransports: true });
  socket = s;
  s.on('connect', () => {
    set({ connected: true, error: null });
    void syncClock(s);
  });
  // Ignore a replaced socket's late events (e.g. React StrictMode's double mount).
  s.on('disconnect', (reason) => {
    if (socket !== s) return;
    set({ connected: false });
    // The server drops a player's connections after an organizer edits their profile; reconnect to pick it up.
    if (reason === 'io server disconnect') s.connect();
  });
  s.on('connect_error', (err) => socket === s && set({ connected: false, error: err.message }));
  s.on('state', (state: ArenaState) => {
    if (!snapshot.state) offset = state.serverNow - Date.now(); // rough until the ping sync finishes
    set({ state, live: state.phase === 'running' ? snapshot.live : null });
  });
  s.on('live', (live: LiveUpdate) => set({ live }));
  s.on('my_result', (myResult: MyResult) => set({ myResult }));
  s.on('attempt_locked', ({ roundId }: { roundId: string }) => set({ lockedRound: roundId }));
  s.on('my_rank', ({ roundId, rank, of }: { roundId: string; rank: number; of: number }) => {
    if (snapshot.myResult?.roundId === roundId) set({ myResult: { ...snapshot.myResult, rank, of } });
  });
  return s;
}

export const getSocket = () => socket;
export const setMyResult = (myResult: MyResult | null) => set({ myResult });

export function useArena() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

/** Re-renders every `ms` and returns the server-clock time. */
export function useNow(ms = 250) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}`;
}
