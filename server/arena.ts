import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { replay, type KeyEvent } from '../shared/engine';
import { randomWords } from '../shared/words';
import type { Ack, AdminAction, AdminStats, ArenaState, Entry, LiveUpdate, Me, Mode, MyResult, Phase, RoundKind, SubmitPayload } from '../shared/protocol';
import * as db from './db';

const sec = (name: string, fallback: number) => Number(process.env[name] || fallback) * 1000;

export const CONFIG = {
  durationMs: sec('ROUND_SECONDS', 60),
  intermissionMs: sec('INTERMISSION_SECONDS', 25), // time from a round being scheduled to GO
  countdownMs: sec('COUNTDOWN_SECONDS', 5),
  finalCountdownMs: sec('FINAL_COUNTDOWN_SECONDS', 10),
  startWindowMs: sec('START_WINDOW_SECONDS', 8), // players must start typing within this long after GO
  graceMs: sec('SUBMIT_GRACE_SECONDS', 5),
  resultsMs: sec('RESULTS_SECONDS', 15),
  wordsPerRound: 300,
};

interface Round {
  id: string;
  kind: RoundKind;
  number: number;
  text: string;
  words: string[];
  startAt: number | null;
  closeAt: number | null;
  live: Map<number, { username: string; wpm: number }>;
  attempts: Map<number, { id: string; at: number }>; // server receive time of each player's first keystroke
  submissions: Map<number, { username: string; wpm: number; raw: number; acc: number; at: number }>;
}

type Player = Me & { hidden: boolean };

const byScore = (a: { wpm: number; acc: number; at?: number }, b: { wpm: number; acc: number; at?: number }) =>
  b.wpm - a.wpm || b.acc - a.acc || (a.at ?? 0) - (b.at ?? 0);

function validateKeys(keys: unknown): keys is KeyEvent[] {
  if (!Array.isArray(keys) || keys.length > 6000) return false;
  let prev = 0;
  for (const k of keys) {
    if (!Array.isArray(k) || k.length !== 2) return false;
    const [key, t] = k;
    if (typeof key !== 'string' || key.length !== 1 || typeof t !== 'number' || !Number.isFinite(t) || t < prev) return false;
    prev = t;
  }
  return true;
}

function flagFor(keys: KeyEvent[], wpm: number): string | null {
  if (wpm > 200) return 'wpm over 200';
  if (keys.length > 60) {
    const gaps: number[] = [];
    for (let i = 1; i < keys.length; i++) gaps.push(keys[i]![1] - keys[i - 1]![1]);
    const tooFast = gaps.filter((g) => g < 15).length / gaps.length;
    if (tooFast > 0.4) return 'inhumanly fast keystrokes';
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
    if (sd < 4) return 'robotically even keystrokes';
  }
  return null;
}

export class Arena {
  mode: Mode = 'rolling';
  phase: Phase = 'idle';
  round: Round | null = null;
  private roundNumber = 0;
  private timers: NodeJS.Timeout[] = [];
  private liveTick: NodeJS.Timeout | null = null;
  private lastResults: ArenaState['results'] = null;
  private tonight: Entry[] = [];
  private final: ArenaState['final'] = null;
  private players = 0;
  private hidden = new Set<string>();

  constructor(private io: Server, private eventName: string, private publicUrl: string) {
    this.hidden = new Set(db.hiddenUsers().map((u) => u.toLowerCase()));
    this.refreshBoards();
    setInterval(() => {
      if (this.phase !== 'running' && this.phase !== 'countdown') this.broadcast();
    }, 5000).unref();
  }

  // ---------- state ----------

  state(): ArenaState {
    const r = this.round;
    const showText = r && (this.phase === 'countdown' || this.phase === 'running');
    return {
      eventName: this.eventName,
      publicUrl: this.publicUrl,
      mode: this.mode,
      phase: this.phase,
      serverNow: Date.now(),
      round: r
        ? {
            id: r.id,
            kind: r.kind,
            number: r.number,
            startAt: r.startAt,
            startWindowMs: CONFIG.startWindowMs,
            durationMs: CONFIG.durationMs,
            closeAt: r.closeAt,
            ...(showText ? { text: r.text } : {}),
          }
        : null,
      results: this.phase === 'results' ? this.lastResults : null,
      tonight: this.tonight,
      final: this.final,
      online: this.io.engine.clientsCount,
      players: this.players,
    };
  }

  broadcast() {
    this.io.emit('state', this.state());
  }

  refreshBoards() {
    this.tonight = db.tonightTop(10);
    const count = db.finalCount();
    this.final = count ? { top: db.finalTop(10), count } : null;
    this.players = db.countUsers();
  }

  onRegistered() {
    this.players = db.countUsers();
  }

  // ---------- scheduling ----------

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.liveTick) clearInterval(this.liveTick);
    this.liveTick = null;
  }

  private at(time: number, fn: () => void) {
    this.timers.push(setTimeout(fn, Math.max(0, time - Date.now())));
  }

  private newRound(kind: RoundKind): Round {
    const text = randomWords(CONFIG.wordsPerRound);
    return {
      id: randomUUID(),
      kind,
      number: kind === 'rolling' ? ++this.roundNumber : 0,
      text,
      words: text.split(' '),
      startAt: null,
      closeAt: null,
      live: new Map(),
      attempts: new Map(),
      submissions: new Map(),
    };
  }

  private arm(round: Round, startAt: number, countdownMs: number) {
    round.startAt = startAt;
    round.closeAt = startAt + CONFIG.startWindowMs + CONFIG.durationMs + CONFIG.graceMs;
    this.at(startAt - countdownMs, () => {
      this.phase = 'countdown';
      this.broadcast();
    });
    this.at(startAt, () => {
      this.phase = 'running';
      this.broadcast();
      this.liveTick = setInterval(() => this.emitLive(), 1000);
    });
    this.at(round.closeAt, () => this.close());
  }

  startRolling() {
    this.clearTimers();
    this.mode = 'rolling';
    this.round = this.newRound('rolling');
    this.phase = 'waiting';
    this.arm(this.round, Date.now() + CONFIG.intermissionMs, CONFIG.countdownMs);
    this.broadcast();
  }

  private goIdle() {
    this.clearTimers();
    this.round = null;
    this.phase = 'idle';
    this.broadcast();
  }

  private enterFinalWaiting() {
    this.clearTimers();
    this.mode = 'final';
    this.round = this.newRound('final');
    this.phase = 'waiting';
    this.broadcast();
  }

  private close() {
    const r = this.round;
    if (!r) return;
    this.clearTimers();
    const standings = [...r.submissions.entries()]
      .filter(([, s]) => !this.hidden.has(s.username.toLowerCase()))
      .sort(([, a], [, b]) => byScore(a, b));
    standings.forEach(([userId], i) => {
      this.io.to(`user:${userId}`).emit('my_rank', { roundId: r.id, rank: i + 1, of: standings.length });
    });
    this.lastResults = {
      roundId: r.id,
      kind: r.kind,
      number: r.number,
      count: standings.length,
      top: standings.slice(0, 10).map(([, s], i) => ({ rank: i + 1, username: s.username, wpm: s.wpm, acc: s.acc, raw: s.raw })),
    };
    this.refreshBoards();
    this.phase = 'results';
    this.broadcast();

    if (r.kind === 'final') return; // stays on final results until an organizer acts
    const next = Date.now() + CONFIG.resultsMs;
    if (this.mode === 'rolling') this.at(next, () => this.startRolling());
    else if (this.mode === 'final') this.at(next, () => this.enterFinalWaiting());
    else this.at(next, () => this.goIdle());
  }

  private emitLive() {
    const r = this.round;
    if (!r) return;
    const top = [...r.live.values()]
      .filter((p) => !this.hidden.has(p.username.toLowerCase()))
      .sort((a, b) => b.wpm - a.wpm)
      .slice(0, 10)
      .map((p, i) => ({ rank: i + 1, username: p.username, wpm: p.wpm, acc: 0 }));
    const update: LiveUpdate = { roundId: r.id, top, typing: r.live.size - r.submissions.size, finished: r.submissions.size };
    this.io.emit('live', update);
  }

  // ---------- player events ----------

  onProgress(user: Player, payload: { roundId?: unknown; wpm?: unknown }) {
    const r = this.round;
    if (!r || this.phase !== 'running' || payload?.roundId !== r.id || r.submissions.has(user.id)) return;
    const wpm = Math.max(0, Math.min(400, Math.round(Number(payload.wpm) || 0)));
    r.live.set(user.id, { username: user.username, wpm });
  }

  /** True if the player began an attempt in the current round that hasn't been submitted yet. */
  hasOpenAttempt(userId: number) {
    const r = this.round;
    return !!r && this.phase === 'running' && r.attempts.has(userId) && !r.submissions.has(userId);
  }

  /** Called on a player's first keystroke. Each player gets exactly one attempt per round,
   * so reloading the page (or opening a second tab) can't restart a bad start. */
  onStart(user: Player, payload: { roundId?: unknown; attemptId?: unknown }): Ack<null> {
    const r = this.round;
    if (!r || this.phase !== 'running' || payload?.roundId !== r.id) return { ok: false, error: 'This round is no longer active.' };
    if (typeof payload.attemptId !== 'string' || payload.attemptId.length > 64) return { ok: false, error: 'Invalid attempt.' };
    const existing = r.attempts.get(user.id);
    if (existing) {
      return existing.id === payload.attemptId ? { ok: true, data: null } : { ok: false, error: 'You already started this round, and attempts can’t be restarted.' };
    }
    // Allow a little slack beyond the start window for network latency.
    if (Date.now() > r.startAt! + CONFIG.startWindowMs + 2000) return { ok: false, error: 'This round’s start window has closed.' };
    r.attempts.set(user.id, { id: payload.attemptId, at: Date.now() });
    return { ok: true, data: null };
  }

  onSubmit(user: Player, payload: SubmitPayload): Ack<MyResult> {
    const r = this.round;
    if (!r || payload?.roundId !== r.id) return { ok: false, error: 'This round is no longer active.' };
    if (this.phase !== 'running') return { ok: false, error: 'Submissions for this round are closed.' };
    if (r.submissions.has(user.id)) return { ok: false, error: 'You already submitted this round.' };
    if (!validateKeys(payload.keys) || payload.keys.length === 0) return { ok: false, error: 'Invalid submission.' };

    // Only the attempt registered first counts. If its start message was lost, register this one now.
    const attempt = r.attempts.get(user.id);
    if (attempt && attempt.id !== payload.attemptId) {
      return { ok: false, error: 'You already started this round in another tab or before reloading. Only that attempt counts.' };
    }
    if (!attempt) {
      if (typeof payload.attemptId !== 'string') return { ok: false, error: 'Invalid attempt.' };
      r.attempts.set(user.id, { id: payload.attemptId, at: Date.now() });
    }

    // A test can't finish faster than real time: the keystrokes must fit between GO (or the attempt's start) and now.
    const lastT = Math.min(payload.keys[payload.keys.length - 1]![1], CONFIG.durationMs);
    const startedAt = attempt ? Math.max(r.startAt!, attempt.at - 1000) : r.startAt!;
    if (Date.now() + 3000 < startedAt + lastT) return { ok: false, error: 'Submission rejected (timing).' };

    const { stats } = replay(r.words, payload.keys, CONFIG.durationMs);
    const flag = flagFor(payload.keys, stats.wpm);
    const saved = db.saveResult({ roundId: r.id, kind: r.kind, userId: user.id, flag, ...stats });
    if (!saved) return { ok: false, error: 'You already submitted this round.' };

    r.submissions.set(user.id, { username: user.username, wpm: stats.wpm, raw: stats.raw, acc: stats.acc, at: Date.now() });
    r.live.set(user.id, { username: user.username, wpm: Math.round(stats.wpm) });
    return { ok: true, data: { roundId: r.id, kind: r.kind, wpm: stats.wpm, raw: stats.raw, acc: stats.acc } };
  }

  // ---------- organizer controls ----------

  admin(action: AdminAction): Ack<AdminStats | null> {
    const busy = this.phase === 'countdown' || this.phase === 'running';
    switch (action.type) {
      case 'pause':
        if (busy && this.round?.kind === 'final') return { ok: false, error: 'The final is running. Use Abort to cancel it.' };
        this.mode = 'paused';
        if (busy) this.broadcast(); // a running rolling round finishes, then the arena goes idle
        else this.goIdle();
        break;
      case 'resume':
        if (busy && this.round?.kind === 'final') return { ok: false, error: 'The final is running. Abort it first.' };
        this.mode = 'rolling';
        if (!busy) this.startRolling();
        else this.broadcast();
        break;
      case 'prepareFinal':
        if (busy && this.round?.kind === 'final') return { ok: false, error: 'The final is already running.' };
        this.mode = 'final';
        if (busy) this.broadcast(); // the current rolling round finishes first
        else this.enterFinalWaiting();
        break;
      case 'startFinal': {
        const r = this.round;
        if (this.mode !== 'final' || !r || r.kind !== 'final' || this.phase !== 'waiting' || r.startAt) {
          return { ok: false, error: 'Prepare the final first and wait for any running round to end.' };
        }
        db.clearFinal();
        this.refreshBoards();
        this.clearTimers();
        this.phase = 'countdown';
        this.arm(r, Date.now() + CONFIG.finalCountdownMs, CONFIG.finalCountdownMs);
        this.broadcast();
        break;
      }
      case 'abort': {
        const r = this.round;
        if (!r || this.phase === 'results' || this.phase === 'idle') return { ok: false, error: 'No round to abort.' };
        this.clearTimers();
        db.deleteRound(r.id);
        this.refreshBoards();
        if (r.kind === 'final') this.enterFinalWaiting();
        else if (this.mode === 'rolling') this.startRolling();
        else if (this.mode === 'final') this.enterFinalWaiting();
        else this.goIdle();
        break;
      }
      case 'hideUser': {
        if (!db.setHidden(action.username, action.hidden)) return { ok: false, error: 'No such username.' };
        if (action.hidden) this.hidden.add(action.username.toLowerCase());
        else this.hidden.delete(action.username.toLowerCase());
        this.refreshBoards();
        this.broadcast();
        break;
      }
      case 'purgeBots': {
        if (busy) return { ok: false, error: 'Wait until no round is running.' };
        const removed = db.purgeLoadTestBots();
        console.log(`[admin] removed ${removed} load-test bots`);
        this.refreshBoards();
        this.broadcast();
        break;
      }
      case 'stats':
        break;
      default:
        return { ok: false, error: 'Unknown action.' };
    }
    return {
      ok: true,
      data: {
        registered: db.countUsers(),
        online: this.io.engine.clientsCount,
        rollingResults: db.countRolling(),
        flagged: db.flaggedResults(),
        hidden: db.hiddenUsers(),
      },
    };
  }
}
