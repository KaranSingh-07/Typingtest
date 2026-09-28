// Load test: N simulated students register, join, and play real-time rounds exactly like the browser does
// (1 progress event/sec while typing, one keystroke-log submission at the end of their 60s).
//
//   npm run loadtest -- --url https://typing.example.com --bots 400 --rounds 2
//
// Bots register as roll numbers LT<run>-<n>. Hide or ignore them afterwards (use a scratch DATA_DIR when testing locally).
import { io, type Socket } from 'socket.io-client';
import { applyKey, BACKSPACE, computeStats, createState, replay, type KeyEvent } from '../shared/engine';
import type { Ack, ArenaState, LiveUpdate, MyResult } from '../shared/protocol';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const URL_ = arg('url', 'http://localhost:3000').replace(/\/$/, '');
const BOTS = Number(arg('bots', '400'));
const ROUNDS = Number(arg('rounds', '1'));
const RUN = arg('run', Math.random().toString(36).slice(2, 6));
const RAMP_MS = Number(arg('ramp', '20000')); // spread connections over this long

const stats = {
  registered: 0,
  registerFail: 0,
  connected: 0,
  connectFail: 0,
  disconnects: 0,
  submitted: 0,
  submitFail: [] as string[],
  scoreMismatch: 0,
  submitLatency: [] as number[],
  liveGaps: [] as number[],
  roundsDone: 0,
};

function pct(arr: number[], p: number) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!);
}

/** Generates a human-ish keystroke log at the given speed with occasional corrected typos. */
function simulateTyping(words: string[], wpm: number, durationMs: number): KeyEvent[] {
  const keys: KeyEvent[] = [];
  const s = createState(words);
  const meanGap = 60000 / (wpm * 5);
  let t = 0;
  const push = (k: string) => {
    keys.push([k, Math.round(t)]);
    applyKey(s, k);
    t += Math.max(8, meanGap * (0.4 + Math.random() * 1.2));
  };
  while (t <= durationMs && s.index < words.length) {
    const word = words[s.index]!;
    for (const ch of word) {
      if (Math.random() < 0.03) {
        push(ch === 'x' ? 'z' : 'x');
        if (Math.random() < 0.7) push(BACKSPACE);
      }
      push(ch);
      if (t > durationMs) break;
    }
    push(' ');
  }
  return keys.filter(([, time]) => time <= durationMs);
}

async function register(i: number): Promise<string | null> {
  try {
    const res = await fetch(`${URL_}/api/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roll: `LT${RUN}-${i}`, name: 'Load Test Bot', username: `lt${RUN}_${i}` }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    stats.registered++;
    return (await res.json()).token;
  } catch (err) {
    stats.registerFail++;
    if (stats.registerFail < 5) console.error('register failed', (err as Error).message);
    return null;
  }
}

function runBot(i: number, token: string, onRoundDone: () => void) {
  const wpm = 30 + Math.random() * 80;
  const socket: Socket = io(URL_, { auth: { token }, transports: ['websocket'], reconnectionDelayMax: 3000 });
  let offset = 0;
  let playedRound = '';
  let lastLive = 0;

  socket.on('connect', () => stats.connected++);
  socket.on('connect_error', () => stats.connectFail++);
  socket.on('disconnect', (reason) => {
    stats.connected--;
    if (reason !== 'io client disconnect') stats.disconnects++;
  });
  socket.on('live', (_l: LiveUpdate) => {
    const now = Date.now();
    if (lastLive && i % 10 === 0) stats.liveGaps.push(now - lastLive);
    lastLive = now;
  });
  socket.on('state', (state: ArenaState) => {
    offset = state.serverNow - Date.now();
    const r = state.round;
    if (state.phase === 'results') lastLive = 0;
    if (!r?.text || !r.startAt || r.id === playedRound) return;
    if (state.phase !== 'countdown' && state.phase !== 'running') return;
    playedRound = r.id;

    const words = r.text.split(' ');
    const reaction = 300 + Math.random() * Math.min(3000, r.startWindowMs - 500);
    const firstKeyLocal = r.startAt - offset + reaction;
    const keys = simulateTyping(words, wpm, r.durationMs);
    const expected = replay(words, keys, r.durationMs).stats;

    const startIn = Math.max(0, firstKeyLocal - Date.now());
    const attemptId = `bot-${i}-${Math.random().toString(36).slice(2, 10)}`;
    setTimeout(() => {
      const t0 = Date.now();
      socket.emit('start', { roundId: r.id, attemptId }, (res: Ack<null>) => {
        if (!res.ok) stats.submitFail.push(`start: ${res.error}`);
      });
      const progress = setInterval(() => {
        const el = Date.now() - t0;
        const s = createState(words);
        for (const [k, t] of keys) if (t <= el) applyKey(s, k);
        socket.emit('progress', { roundId: r.id, wpm: computeStats(s, el).wpm });
      }, 1000);
      setTimeout(() => {
        clearInterval(progress);
        const sent = Date.now();
        socket.timeout(30000).emit('submit', { roundId: r.id, attemptId, keys }, (err: unknown, res: Ack<MyResult>) => {
          stats.submitLatency.push(Date.now() - sent);
          if (err) stats.submitFail.push('timeout');
          else if (!res.ok) stats.submitFail.push(res.error);
          else {
            stats.submitted++;
            if (res.data.wpm !== expected.wpm || res.data.acc !== expected.acc) stats.scoreMismatch++;
          }
          onRoundDone();
        });
      }, r.durationMs + 50);
    }, startIn);
  });
  return socket;
}

async function main() {
  console.log(`Load test → ${URL_} · ${BOTS} bots · ${ROUNDS} round(s) · run ${RUN}`);
  const health = async () => (await fetch(`${URL_}/api/health?metrics`)).json().catch(() => null);
  await fetch(`${URL_}/api/health?metrics&reset`);

  const sockets: Socket[] = [];
  let doneInRound = 0;
  let finish: () => void;
  const allDone = new Promise<void>((r) => (finish = r));
  const onRoundDone = () => {
    doneInRound++;
    if (doneInRound >= stats.registered) {
      stats.roundsDone++;
      doneInRound = 0;
      console.log(`round ${stats.roundsDone} complete · submitted so far ${stats.submitted}`);
      if (stats.roundsDone >= ROUNDS) finish();
    }
  };

  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: BOTS }, async (_, i) => {
      await new Promise((r) => setTimeout(r, (i / BOTS) * RAMP_MS));
      const token = await register(i);
      if (token) sockets.push(runBot(i, token, onRoundDone));
    }),
  );
  console.log(`registered ${stats.registered}/${BOTS} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const monitor = setInterval(async () => {
    const h = await health();
    console.log(
      `[${new Date().toLocaleTimeString()}] connected=${stats.connected} submitted=${stats.submitted} fails=${stats.submitFail.length}`,
      h ? `server phase=${h.phase} online=${h.online} loop p99=${h.eventLoopMs?.p99?.toFixed(1)}ms max=${h.eventLoopMs?.max?.toFixed(1)}ms rss=${h.rssMb}MB` : 'health: unreachable',
    );
  }, 5000);

  await allDone;
  clearInterval(monitor);
  const h = await health();
  sockets.forEach((s) => s.disconnect());

  const failReasons = stats.submitFail.reduce<Record<string, number>>((acc, r) => ((acc[r] = (acc[r] || 0) + 1), acc), {});
  console.log('\n===== RESULT =====');
  console.table({
    bots: BOTS,
    registered: stats.registered,
    registerFail: stats.registerFail,
    connectErrors: stats.connectFail,
    unexpectedDisconnects: stats.disconnects,
    submitted: stats.submitted,
    submitFailures: stats.submitFail.length,
    scoreMismatches: stats.scoreMismatch,
    submitAckP50ms: pct(stats.submitLatency, 50),
    submitAckP95ms: pct(stats.submitLatency, 95),
    submitAckMaxms: pct(stats.submitLatency, 100),
    liveGapP95ms: pct(stats.liveGaps, 95),
    liveGapMaxms: pct(stats.liveGaps, 100),
    serverLoopP99ms: h?.eventLoopMs?.p99,
    serverLoopMaxms: h?.eventLoopMs?.max,
    serverRssMb: h?.rssMb,
  });
  if (Object.keys(failReasons).length) console.log('submit failure reasons:', failReasons);
  process.exit(0);
}

void main();
