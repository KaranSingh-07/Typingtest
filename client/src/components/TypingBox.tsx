import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { applyKey, BACKSPACE, computeStats, createState, WORD_BACKSPACE, type KeyEvent } from '../../../shared/engine';
import type { Ack, MyResult, RoundInfo } from '../../../shared/protocol';
import { fmtClock, getSocket, serverNow, setMyResult } from '../lib/arena';

type Status = 'locked' | 'ready' | 'typing' | 'submitting' | 'done' | 'missed' | 'blocked' | 'error';

const LINE_EM = 1.75; // must match .word line-height + margin-bottom in index.css

const Word = memo(function Word({ word, input, state }: { word: string; input: string; state: 'past' | 'current' | 'future' }) {
  if (state === 'future') return <span className="word">{word}</span>;
  const len = Math.max(word.length, input.length);
  const chars = [];
  for (let i = 0; i < len; i++) {
    const target = word[i];
    const typed = input[i];
    let cls = 'pending';
    if (target === undefined) cls = 'extra';
    else if (typed !== undefined) cls = typed === target ? 'correct' : 'incorrect';
    chars.push(
      <span key={i} className={cls}>
        {target ?? typed}
      </span>,
    );
  }
  return <span className={`word${state === 'past' && input !== word ? ' error' : ''}`}>{chars}</span>;
});

interface Props {
  round: RoundInfo & { text: string; startAt: number };
  /** The server says this player already started this round (e.g. before reloading the page). */
  locked?: boolean;
  onDone?: (result: MyResult) => void;
}

export default function TypingBox({ round, locked, onDone }: Props) {
  const words = useMemo(() => round.text.split(' '), [round.text]);
  const engine = useRef(createState(words));
  const keys = useRef<KeyEvent[]>([]);
  const firstKeyAt = useRef(0);
  // Not crypto.randomUUID(): that's unavailable on plain-http LAN addresses.
  const attemptId = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  const initial: Status = serverNow() < round.startAt ? 'locked' : serverNow() > round.startAt + round.startWindowMs ? 'missed' : 'ready';
  const [status, setStatusState] = useState<Status>(initial);
  const statusRef = useRef<Status>(initial);
  const setStatus = (s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  };

  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(serverNow);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);

  const finish = useCallback(() => {
    setStatus('submitting');
    const log = keys.current.filter(([, t]) => t <= round.durationMs);
    getSocket()
      ?.timeout(20000)
      .emit('submit', { roundId: round.id, attemptId: attemptId.current, keys: log }, (err: unknown, res: Ack<MyResult>) => {
        if (err) {
          setError('Could not reach the server to submit your score.');
          setStatus('error');
        } else if (!res.ok) {
          setError(res.error);
          setStatus('error');
        } else {
          setMyResult(res.data);
          onDone?.(res.data);
          setStatus('done');
        }
      });
  }, [round.id, round.durationMs, onDone]);

  // Clock: unlock at GO, close the start window, end the personal 60s.
  useEffect(() => {
    const id = setInterval(() => {
      const t = serverNow();
      setNow(t);
      const st = statusRef.current;
      if (st === 'locked' && t >= round.startAt) {
        setStatus('ready');
        inputRef.current?.focus();
      } else if (st === 'ready' && t > round.startAt + round.startWindowMs) {
        setStatus('missed');
      } else if (st === 'typing') {
        const el = performance.now() - firstKeyAt.current;
        if (el >= round.durationMs) {
          setElapsed(round.durationMs);
          finish();
        } else setElapsed(el);
      }
    }, 50);
    return () => clearInterval(id);
  }, [round.startAt, round.startWindowMs, round.durationMs, finish]);

  useEffect(() => {
    if (locked && (statusRef.current === 'locked' || statusRef.current === 'ready')) setStatus('blocked');
  }, [locked]);

  // Live progress to the server, once a second.
  useEffect(() => {
    if (status !== 'typing') return;
    const send = () => {
      const el = performance.now() - firstKeyAt.current;
      getSocket()?.emit('progress', { roundId: round.id, wpm: computeStats(engine.current, el).wpm });
    };
    send();
    const id = setInterval(send, 1000);
    return () => clearInterval(id);
  }, [status, round.id]);

  useEffect(() => {
    inputRef.current?.focus();
    // Any keypress while unfocused brings focus back to the typing box.
    const refocus = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', refocus);
    return () => window.removeEventListener('keydown', refocus);
  }, []);

  const handleKey = (k: string) => {
    const st = statusRef.current;
    if (st === 'ready') {
      if (k === ' ' || k === BACKSPACE || k === WORD_BACKSPACE) return;
      firstKeyAt.current = performance.now();
      setStatus('typing');
      // Register the attempt. Typing continues meanwhile; if the server already has an attempt
      // from this player (a reload or second tab), this one is stopped.
      getSocket()
        ?.timeout(10000)
        .emit('start', { roundId: round.id, attemptId: attemptId.current }, (err: unknown, res: Ack<null>) => {
          // Other failures (e.g. a timeout while reconnecting) are left to the submission to sort out.
          if (err || res.ok || statusRef.current !== 'typing') return;
          if (res.code === 'already_started') {
            setError(res.error);
            setStatus('blocked');
          } else if (res.code === 'window_closed') setStatus('missed');
        });
    } else if (st !== 'typing') return;
    const t = Math.round(performance.now() - firstKeyAt.current);
    if (t > round.durationMs) return;
    keys.current.push([k, t]);
    if (applyKey(engine.current, k)) rerender();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      handleKey(e.ctrlKey || e.altKey || e.metaKey ? WORD_BACKSPACE : BACKSPACE);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleKey(e.key);
    }
  };

  // Fallback for mobile keyboards that don't report keys on keydown.
  const onInput = (e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const native = e.nativeEvent as InputEvent;
    const value = el.value;
    el.value = '';
    if (native.inputType === 'insertFromPaste' || native.inputType === 'insertFromDrop') return;
    for (const ch of value) handleKey(ch);
  };

  const s = engine.current;

  // Keep the current word on the second visible line and move the caret.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    const caret = caretRef.current;
    if (!inner || !caret) return;
    const wordEl = inner.children[s.index] as HTMLElement | undefined;
    if (!wordEl) return;
    const pitch = parseFloat(getComputedStyle(inner).fontSize) * LINE_EM;
    const next = Math.max(0, wordEl.offsetTop - pitch);
    if (next !== scroll) setScroll(next);
    const chars = wordEl.children;
    let left = wordEl.offsetLeft;
    if (s.input.length < chars.length) left = (chars[s.input.length] as HTMLElement).offsetLeft;
    else if (chars.length) {
      const last = chars[chars.length - 1] as HTMLElement;
      left = last.offsetLeft + last.offsetWidth;
    }
    caret.style.transform = `translate(${left}px, ${wordEl.offsetTop}px)`;
  });

  const stats = computeStats(s, Math.max(elapsed, 1000));
  const timeLeft = status === 'typing' ? round.durationMs - elapsed : status === 'locked' || status === 'ready' ? round.durationMs : 0;
  const renderUpTo = Math.min(words.length, s.index + 120);

  return (
    <div className="w-full">
      <div className="flex items-end justify-between mb-3 font-mono h-10">
        <div className="text-3xl sm:text-4xl text-main tabular-nums">{fmtClock(timeLeft)}</div>
        <div className="text-sub text-sm sm:text-base tabular-nums">
          {status === 'typing' ? (
            <>
              <span className="text-text text-xl sm:text-2xl">{Math.round(stats.wpm)}</span> wpm
            </>
          ) : status === 'ready' ? (
            <span className="text-main">Start typing — must begin within {fmtClock(round.startAt + round.startWindowMs - now)}s</span>
          ) : null}
        </div>
      </div>

      <div
        className="relative cursor-text"
        onClick={() => inputRef.current?.focus()}
        onMouseDown={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <input
          ref={inputRef}
          className="absolute inset-0 opacity-0 cursor-text"
          aria-label="Typing input"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          onKeyDown={onKeyDown}
          onInput={onInput}
          onPaste={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <div
          className={`typing-viewport font-mono text-[1.35rem] sm:text-[1.75rem] transition-[filter] duration-300 ${
            status === 'locked' || (!focused && (status === 'ready' || status === 'typing')) ? 'blur-[6px]' : ''
          }`}
        >
          <div ref={innerRef} className="relative flex flex-wrap" style={{ transform: `translateY(${-scroll}px)` }}>
            {words.slice(0, renderUpTo).map((w, i) => (
              <Word
                key={i}
                word={w}
                input={i < s.index ? s.typed[i]! : i === s.index ? s.input : ''}
                state={i < s.index ? 'past' : i === s.index ? 'current' : 'future'}
              />
            ))}
            <div ref={caretRef} className={`caret ${status === 'typing' ? '' : 'caret-blink'}`} />
          </div>
        </div>

        {status === 'locked' && (
          <Overlay>
            <div className="text-sub uppercase tracking-[0.3em] text-sm mb-2">Get ready</div>
            <div className="text-main font-mono text-7xl sm:text-8xl tabular-nums">{fmtClock(round.startAt - now)}</div>
          </Overlay>
        )}
        {!focused && (status === 'ready' || status === 'typing') && (
          <Overlay>
            <div className="text-text text-lg">Click here or press any key to focus</div>
          </Overlay>
        )}
        {status === 'blocked' && (
          <Overlay solid>
            <div className="text-text text-xl mb-1 text-center max-w-md">{error || 'You already started this round'}</div>
            <div className="text-sub">Attempts can't be restarted by reloading. Wait for the next round.</div>
          </Overlay>
        )}
        {status === 'missed' && (
          <Overlay solid>
            <div className="text-text text-xl mb-1">This round's start window has closed</div>
            <div className="text-sub">You'll be in the next one. Watch the timer.</div>
          </Overlay>
        )}
        {(status === 'submitting' || status === 'done' || status === 'error') && (
          <Overlay solid>
            {status === 'submitting' && <div className="text-sub text-lg">Submitting your score…</div>}
            {status === 'error' && <div className="text-error text-lg max-w-md text-center">{error}</div>}
            {status === 'done' && (
              <>
                <div className="text-sub uppercase tracking-[0.3em] text-xs mb-3">Time's up</div>
                <div className="flex gap-10 font-mono">
                  <Stat label="wpm" value={Math.round(stats.wpm)} big />
                  <Stat label="acc" value={`${Math.round(stats.acc)}%`} big />
                </div>
                <div className="text-sub text-sm mt-4">Verified by the server. Rankings appear when the round closes.</div>
              </>
            )}
          </Overlay>
        )}
      </div>
    </div>
  );
}

function Overlay({ children, solid }: { children: React.ReactNode; solid?: boolean }) {
  return (
    <div
      className={`absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl pointer-events-none ${solid ? 'bg-bg/95' : 'bg-bg/40'}`}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-sub text-sm">{label}</div>
      <div className={`text-main tabular-nums leading-none ${big ? 'text-6xl' : 'text-3xl'}`}>{value}</div>
    </div>
  );
}
