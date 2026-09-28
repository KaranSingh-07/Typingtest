// Typing engine shared by the browser (live display) and the server (authoritative scoring).
// The server replays the exact keystroke log through the same code, so what a player saw is what gets scored.

export const BACKSPACE = '\b';
export const WORD_BACKSPACE = '\u0017'; // Ctrl/Alt+Backspace
export const MAX_EXTRA_CHARS = 12;

/** [key, ms since the player's first keystroke] */
export type KeyEvent = [string, number];

export interface TypingState {
  words: string[];
  typed: string[]; // committed input for every word before `index`
  input: string; // input for the current word
  index: number;
  totalKeys: number;
  correctKeys: number;
}

export interface Stats {
  wpm: number;
  raw: number;
  acc: number;
  correctChars: number;
  totalKeys: number;
}

export function createState(words: string[]): TypingState {
  return { words, typed: [], input: '', index: 0, totalKeys: 0, correctKeys: 0 };
}

/** Applies one key. Returns true if the visible state changed. Mirrors Monkeytype's default rules:
 * space submits a non-empty word, and backspace can only return to a previous word that was wrong. */
export function applyKey(s: TypingState, key: string): boolean {
  if (s.index >= s.words.length) return false;
  const target = s.words[s.index]!;

  if (key === ' ') {
    if (!s.input) return false;
    s.totalKeys++;
    if (s.input === target) s.correctKeys++;
    s.typed[s.index] = s.input;
    s.index++;
    s.input = '';
    return true;
  }

  if (key === BACKSPACE || key === WORD_BACKSPACE) {
    if (s.input) {
      s.input = key === BACKSPACE ? s.input.slice(0, -1) : '';
      return true;
    }
    const prev = s.index - 1;
    if (prev >= 0 && s.typed[prev] !== s.words[prev]) {
      s.index = prev;
      s.input = key === BACKSPACE ? s.typed[prev]! : '';
      s.typed.length = prev;
      return true;
    }
    return false;
  }

  if (key.length !== 1 || s.input.length >= target.length + MAX_EXTRA_CHARS) return false;
  s.totalKeys++;
  if (target[s.input.length] === key) s.correctKeys++;
  s.input += key;
  return true;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monkeytype-style stats: WPM counts characters of correctly typed words plus their spaces
 * (and a correct partial last word), divided by 5, per minute. Accuracy = correct / total keypresses. */
export function computeStats(s: TypingState, elapsedMs: number): Stats {
  let correct = 0;
  let all = 0;
  for (let i = 0; i < s.index; i++) {
    const typed = s.typed[i]!;
    all += typed.length + 1;
    if (typed === s.words[i]) correct += typed.length + 1;
  }
  all += s.input.length;
  if (s.input && s.words[s.index]?.startsWith(s.input)) correct += s.input.length;

  const minutes = Math.max(elapsedMs, 1000) / 60000;
  return {
    wpm: round2(correct / 5 / minutes),
    raw: round2(all / 5 / minutes),
    acc: s.totalKeys ? round2((s.correctKeys / s.totalKeys) * 100) : 0,
    correctChars: correct,
    totalKeys: s.totalKeys,
  };
}

export function replay(words: string[], keys: KeyEvent[], durationMs: number) {
  const s = createState(words);
  for (const [k, t] of keys) {
    if (t > durationMs) break;
    applyKey(s, k);
  }
  return { state: s, stats: computeStats(s, durationMs) };
}
