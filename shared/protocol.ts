import type { KeyEvent } from './engine';

export type Mode = 'rolling' | 'paused' | 'final';
export type Phase = 'idle' | 'waiting' | 'countdown' | 'running' | 'results';
export type RoundKind = 'rolling' | 'final';

export interface Entry {
  rank: number;
  username: string;
  wpm: number;
  acc: number;
  raw?: number;
}

export interface RoundInfo {
  id: string;
  kind: RoundKind;
  number: number;
  /** Server epoch ms when typing unlocks; null while a final waits for the organizer. */
  startAt: number | null;
  /** Players must press their first key before startAt + startWindowMs. */
  startWindowMs: number;
  durationMs: number;
  closeAt: number | null;
  /** Only sent once the countdown begins. */
  text?: string;
}

export interface ArenaState {
  eventName: string;
  publicUrl: string;
  mode: Mode;
  phase: Phase;
  serverNow: number;
  round: RoundInfo | null;
  /** Standings for the round that just closed (results phase), or the final's standings. */
  results: { roundId: string; kind: RoundKind; number: number; top: Entry[]; count: number } | null;
  /** Best rolling score per player tonight. */
  tonight: Entry[];
  final: { top: Entry[]; count: number } | null;
  online: number;
  players: number;
}

export interface LiveUpdate {
  roundId: string;
  top: Entry[];
  typing: number;
  finished: number;
}

export interface Me {
  id: number;
  roll: string;
  name: string;
  username: string;
}

export interface SubmitPayload {
  roundId: string;
  keys: KeyEvent[];
}

export interface MyResult {
  roundId: string;
  kind: RoundKind;
  wpm: number;
  raw: number;
  acc: number;
  rank?: number;
  of?: number;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

export type AdminAction =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'prepareFinal' }
  | { type: 'startFinal' }
  | { type: 'abort' }
  | { type: 'hideUser'; username: string; hidden: boolean }
  | { type: 'purgeBots' }
  | { type: 'stats' };

export interface AdminStats {
  registered: number;
  online: number;
  rollingResults: number;
  flagged: { username: string; roll: string; name: string; kind: RoundKind; wpm: number; acc: number; reason: string }[];
  hidden: string[];
}
