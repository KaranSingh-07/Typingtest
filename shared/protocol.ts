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
  /** Organizer message shown on every player page and the projector. */
  announcement: string | null;
  /** Server time the projector's podium reveal of the final began (null = not started). */
  revealAt: number | null;
  /** How long the reveal animation runs; players see final standings only after it ends. */
  revealMs: number;
  /** Length of rolling rounds in seconds (the final has its own fixed length). */
  rollingSeconds: number;
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
  /** Random id the browser picks on its first keystroke; ties the submission to the registered attempt. */
  attemptId: string;
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

/** `code` lets the client react to specific failures without matching on the message. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: string; code?: 'already_started' | 'window_closed' };

export type AdminAction =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'prepareFinal' }
  | { type: 'startFinal' }
  | { type: 'abort' }
  | { type: 'hideUser'; username: string; hidden: boolean }
  | { type: 'purgeBots' }
  | { type: 'setRoundLength'; seconds: number }
  | { type: 'announce'; message: string }
  | { type: 'reveal' }
  | { type: 'findUsers'; query: string }
  | { type: 'userResults'; userId: number }
  | { type: 'updateUser'; userId: number; roll: string; name: string; username: string }
  | { type: 'deleteUser'; userId: number }
  | { type: 'disqualify'; resultId: number }
  | { type: 'stats' };

export interface AdminUser {
  id: number;
  roll: string;
  name: string;
  username: string;
  hidden: boolean;
  best: number | null;
  final: number | null;
  rounds: number;
}

export interface AdminResult {
  id: number;
  kind: string;
  wpm: number;
  acc: number;
  flag: string | null;
  created_at: number;
}

export interface AdminStats {
  registered: number;
  online: number;
  rollingResults: number;
  flagged: { id: number; username: string; roll: string; name: string; kind: RoundKind; wpm: number; acc: number; reason: string }[];
  hidden: string[];
  /** Filled by findUsers / userResults. */
  users?: AdminUser[];
  results?: AdminResult[];
}
