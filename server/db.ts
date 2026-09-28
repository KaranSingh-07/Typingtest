import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Entry, Me, RoundKind } from '../shared/protocol';

const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, 'typeflow.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    roll TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    token TEXT NOT NULL UNIQUE,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY,
    round_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    wpm REAL NOT NULL,
    raw REAL NOT NULL,
    acc REAL NOT NULL,
    correct_chars INTEGER NOT NULL,
    total_keys INTEGER NOT NULL,
    flag TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (round_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS results_kind ON results(kind, wpm DESC, acc DESC);
`);

interface UserRow {
  id: number;
  roll: string;
  name: string;
  username: string;
  token: string;
  hidden: number;
}

const toMe = (u: UserRow): Me => ({ id: u.id, roll: u.roll, name: u.name, username: u.username });

const q = {
  byToken: db.prepare('SELECT * FROM users WHERE token = ?'),
  byRoll: db.prepare('SELECT * FROM users WHERE roll = ?'),
  byUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  insertUser: db.prepare('INSERT INTO users (roll, name, username, token, created_at) VALUES (?, ?, ?, ?, ?)'),
  insertResult: db.prepare(`INSERT OR IGNORE INTO results
    (round_id, kind, user_id, wpm, raw, acc, correct_chars, total_keys, flag, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  tonight: db.prepare(`
    SELECT username, wpm, acc, raw FROM (
      SELECT u.username, r.wpm, r.acc, r.raw, r.created_at,
        ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY r.wpm DESC, r.acc DESC, r.created_at) AS rn
      FROM results r JOIN users u ON u.id = r.user_id
      WHERE r.kind = 'rolling' AND u.hidden = 0
    ) WHERE rn = 1 ORDER BY wpm DESC, acc DESC, created_at LIMIT ?`),
  finalAll: db.prepare(`
    SELECT u.username, u.roll, u.name, r.wpm, r.acc, r.raw, r.total_keys, r.flag, r.created_at
    FROM results r JOIN users u ON u.id = r.user_id
    WHERE r.kind = 'final' AND u.hidden = 0
    ORDER BY r.wpm DESC, r.acc DESC, r.created_at`),
  finalCount: db.prepare(`SELECT COUNT(*) AS n FROM results r JOIN users u ON u.id = r.user_id WHERE r.kind = 'final' AND u.hidden = 0`),
  clearFinal: db.prepare(`DELETE FROM results WHERE kind = 'final'`),
  deleteRound: db.prepare('DELETE FROM results WHERE round_id = ?'),
  setHidden: db.prepare('UPDATE users SET hidden = ? WHERE username = ?'),
  countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
  countRolling: db.prepare(`SELECT COUNT(*) AS n FROM results WHERE kind = 'rolling'`),
  flagged: db.prepare(`
    SELECT u.username, u.roll, u.name, r.kind, r.wpm, r.acc, r.flag AS reason
    FROM results r JOIN users u ON u.id = r.user_id WHERE r.flag IS NOT NULL
    ORDER BY r.created_at DESC LIMIT 50`),
  hidden: db.prepare('SELECT username FROM users WHERE hidden = 1'),
  bestPerUser: db.prepare(`
    SELECT u.roll, u.name, u.username, MAX(r.wpm) AS best_wpm, COUNT(r.id) AS rounds
    FROM users u LEFT JOIN results r ON r.user_id = u.id AND r.kind = 'rolling'
    GROUP BY u.id ORDER BY best_wpm DESC`),
};

export type RegisterResult = { ok: true; me: Me; token: string } | { ok: false; error: string };

export function registerUser(roll: string, name: string, username: string): RegisterResult {
  const existing = q.byRoll.get(roll) as UserRow | undefined;
  if (existing) {
    // Same person on a new device/browser: let them back in if the name matches.
    if (existing.name.trim().toLowerCase() === name.trim().toLowerCase()) {
      return { ok: true, me: toMe(existing), token: existing.token };
    }
    return { ok: false, error: 'This roll number is already registered under a different name. Ask an organizer for help.' };
  }
  if (q.byUsername.get(username)) return { ok: false, error: 'That username is taken. Pick another one.' };
  const token = randomBytes(24).toString('base64url');
  q.insertUser.run(roll, name, username, token, Date.now());
  const user = q.byToken.get(token) as unknown as UserRow;
  return { ok: true, me: toMe(user), token };
}

export function userByToken(token: string): (Me & { hidden: boolean }) | null {
  const u = q.byToken.get(token) as UserRow | undefined;
  return u ? { ...toMe(u), hidden: !!u.hidden } : null;
}

export function saveResult(r: {
  roundId: string;
  kind: RoundKind;
  userId: number;
  wpm: number;
  raw: number;
  acc: number;
  correctChars: number;
  totalKeys: number;
  flag: string | null;
}): boolean {
  const res = q.insertResult.run(r.roundId, r.kind, r.userId, r.wpm, r.raw, r.acc, r.correctChars, r.totalKeys, r.flag, Date.now());
  return res.changes > 0;
}

const rank = (rows: { username: string; wpm: number; acc: number; raw: number }[]): Entry[] =>
  rows.map((r, i) => ({ rank: i + 1, username: r.username, wpm: r.wpm, acc: r.acc, raw: r.raw }));

export const tonightTop = (limit = 10) => rank(q.tonight.all(limit) as any[]);
export const finalRows = () => q.finalAll.all() as any[];
export const finalTop = (limit = 10) => rank(finalRows().slice(0, limit));
export const finalCount = () => (q.finalCount.get() as { n: number }).n;
export const clearFinal = () => q.clearFinal.run();
export const deleteRound = (roundId: string) => q.deleteRound.run(roundId);
export const setHidden = (username: string, hidden: boolean) => q.setHidden.run(hidden ? 1 : 0, username).changes > 0;
export const countUsers = () => (q.countUsers.get() as { n: number }).n;
export const countRolling = () => (q.countRolling.get() as { n: number }).n;
export const flaggedResults = () => q.flagged.all() as any[];
export const hiddenUsers = () => (q.hidden.all() as { username: string }[]).map((r) => r.username);
export const bestPerUser = () => q.bestPerUser.all() as any[];

/** Removes users created by loadtest/bots.ts, plus their scores. */
export function purgeLoadTestBots(): number {
  const bots = `SELECT id FROM users WHERE name = 'Load Test Bot' AND roll LIKE 'LT%'`;
  db.exec(`DELETE FROM results WHERE user_id IN (${bots})`);
  return Number(db.prepare(`DELETE FROM users WHERE id IN (${bots})`).run().changes);
}
