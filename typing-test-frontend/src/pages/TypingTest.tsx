import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../store';
import { Zap, Target, Clock, Trophy, RotateCcw, AlertCircle, Sparkles, Flag } from 'lucide-react';
import { formatTimeLeft, getSoloTextForDuration } from '../utils/timer';

export default function TypingTest() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, username, testDuration, testText } = useAppStore();

  const isSolo = code?.startsWith('SOLO-');

  // Test setup
  const totalDuration = location.state?.duration || testDuration || 60;
  const rawText = useMemo(() => {
    if (location.state?.text) return location.state.text;
    if (testText) return testText;
    return getSoloTextForDuration(totalDuration);
  }, [location.state?.text, testText, totalDuration]);

  const words = useMemo(() => rawText.trim().split(/\s+/), [rawText]);

  // Typing state
  const [typedWords, setTypedWords] = useState<string[]>(() => new Array(words.length).fill(''));
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState('');
  
  // Timing & metrics
  const [testStarted, setTestStarted] = useState(false);
  const [testFinished, setTestFinished] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(totalDuration);
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  // Multiplayer state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isFocused, setIsFocused] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);

  // Socket connection
  useEffect(() => {
    if (!isSolo) {
      const newSocket = io('http://localhost:3000');
      setSocket(newSocket);

      newSocket.on('connect', () => {
        newSocket.emit('join_lobby', { sessionCode: code, userId, username });
      });

      newSocket.on('leaderboard_update', (data) => {
        if (data.leaderboard) setLeaderboard(data.leaderboard);
      });

      newSocket.on('user_completed', (data) => {
        if (data.leaderboard) setLeaderboard(data.leaderboard);
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [code, isSolo, userId, username]);

  // Focus input automatically
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Compute live metrics
  const { netWpm, grossWpm, accuracy, progressPercentage } = useMemo(() => {
    if (!startTime || !testStarted) {
      return { netWpm: 0, grossWpm: 0, accuracy: 100, progressPercentage: 0 };
    }

    const elapsedSeconds = Math.max(0.5, (Date.now() - startTime) / 1000);
    const elapsedMinutes = elapsedSeconds / 60;

    // Calculate correctly typed characters across all completed words
    let correctChars = 0;
    for (let i = 0; i < currentWordIndex; i++) {
      const target = words[i];
      const typed = typedWords[i];
      if (typed === target) {
        correctChars += target.length + 1; // Word chars + 1 for space
      } else {
        // Count matching characters
        for (let c = 0; c < Math.min(typed.length, target.length); c++) {
          if (typed[c] === target[c]) correctChars++;
        }
      }
    }

    // Add correctly typed chars in the current word
    const currentTarget = words[currentWordIndex] || '';
    for (let c = 0; c < Math.min(currentInput.length, currentTarget.length); c++) {
      if (currentInput[c] === currentTarget[c]) correctChars++;
    }

    const net = Math.max(0, Math.round((correctChars / 5) / elapsedMinutes));
    const gross = Math.max(0, Math.round((totalKeystrokes / 5) / elapsedMinutes));
    const acc = totalKeystrokes > 0 
      ? Math.max(0, Math.min(100, Math.round((correctKeystrokes / totalKeystrokes) * 100))) 
      : 100;

    const progress = Math.min(100, Math.round((currentWordIndex / words.length) * 100));

    return {
      netWpm: net,
      grossWpm: gross,
      accuracy: acc,
      progressPercentage: progress
    };
  }, [startTime, testStarted, words, typedWords, currentWordIndex, currentInput, totalKeystrokes, correctKeystrokes]);

  // Broadcast progress to socket
  useEffect(() => {
    if (socket && !isSolo && testStarted && !testFinished) {
      socket.emit('update_progress', {
        sessionCode: code,
        userId,
        wpm: netWpm,
        accuracy,
        progress: progressPercentage
      });
    }
  }, [socket, isSolo, code, userId, netWpm, accuracy, progressPercentage, testStarted, testFinished]);

  // Finish test callback
  const completeTest = useCallback(() => {
    if (testFinished) return;
    setTestFinished(true);

    if (socket && !isSolo) {
      socket.emit('test_finished', {
        sessionId: code,
        userId,
        wpm: netWpm,
        accuracy
      });
    }

    navigate(`/results/${code}`, {
      state: {
        wpm: netWpm,
        grossWpm,
        accuracy,
        totalKeystrokes,
        correctKeystrokes,
        errorCount,
        timeElapsed: totalDuration - timeLeft,
        leaderboard: leaderboard.length > 0 ? leaderboard : [{ rank: 1, userId, username, wpm: netWpm, accuracy }]
      }
    });
  }, [testFinished, socket, isSolo, code, userId, username, netWpm, grossWpm, accuracy, totalKeystrokes, correctKeystrokes, errorCount, totalDuration, timeLeft, leaderboard, navigate]);

  // Timer countdown
  useEffect(() => {
    if (!testStarted || testFinished) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          completeTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [testStarted, testFinished, completeTest]);

  // Handle typing input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (testFinished) return;

    // Start timer on first keystroke
    if (!testStarted) {
      setTestStarted(true);
      setStartTime(Date.now());
    }

    const currentTargetWord = words[currentWordIndex] || '';

    // Space key: submit current word
    if (e.key === ' ') {
      e.preventDefault();
      if (currentInput.length === 0) return; // Disallow skipping empty words

      const isExactMatch = currentInput === currentTargetWord;
      setTotalKeystrokes(prev => prev + 1);
      if (isExactMatch) {
        setCorrectKeystrokes(prev => prev + 1);
      } else {
        setErrorCount(prev => prev + 1);
      }

      const updatedWords = [...typedWords];
      updatedWords[currentWordIndex] = currentInput;
      setTypedWords(updatedWords);

      if (currentWordIndex >= words.length - 1) {
        // Last word finished!
        completeTest();
      } else {
        setCurrentWordIndex(prev => prev + 1);
        setCurrentInput('');
      }
      return;
    }

    // Backspace key
    if (e.key === 'Backspace') {
      if (currentInput.length === 0 && currentWordIndex > 0) {
        e.preventDefault();
        // Jump back to previous word to allow fixing mistakes
        const prevIndex = currentWordIndex - 1;
        setCurrentWordIndex(prevIndex);
        setCurrentInput(typedWords[prevIndex] || '');
      }
      return;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (testFinished) return;
    const value = e.target.value;
    
    // Ignore space character inside input (handled by keydown)
    if (value.endsWith(' ')) return;

    const targetWord = words[currentWordIndex] || '';
    
    // Keystroke accuracy evaluation
    if (value.length > currentInput.length) {
      const addedChar = value[value.length - 1];
      const charIndex = value.length - 1;
      const isCorrect = charIndex < targetWord.length && addedChar === targetWord[charIndex];

      setTotalKeystrokes(prev => prev + 1);
      if (isCorrect) {
        setCorrectKeystrokes(prev => prev + 1);
      } else {
        setErrorCount(prev => prev + 1);
      }
    }

    setCurrentInput(value);
  };

  const currentTargetWord = words[currentWordIndex] || '';

  return (
    <div 
      className="min-h-screen p-4 sm:p-8 max-w-5xl mx-auto flex flex-col justify-between select-none"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Hidden Focus Input */}
      <input
        ref={inputRef}
        type="text"
        className="opacity-0 absolute -top-9999px left-0"
        value={currentInput}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />

      {/* Top HUD */}
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl glass-card border border-gray-800 shadow-xl">
          {/* WPM Counter */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
              <Zap className="w-6 h-6 fill-accent" />
            </div>
            <div>
              <div className="text-3xl font-black text-white font-mono tracking-tight">{netWpm}</div>
              <div className="text-[11px] text-textSecondary uppercase font-bold tracking-wider">Net WPM</div>
            </div>
          </div>

          {/* Accuracy Counter */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-correct/20 border border-correct/40 flex items-center justify-center text-correct">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="text-3xl font-black text-correct font-mono tracking-tight">{accuracy}%</div>
              <div className="text-[11px] text-textSecondary uppercase font-bold tracking-wider">Accuracy</div>
            </div>
          </div>

          {/* Timer Display */}
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all ${
              timeLeft <= 10 
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 animate-pulse-fast' 
                : 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400'
            }`}>
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="text-3xl font-black text-white font-mono tracking-tight">{formatTimeLeft(timeLeft)}</div>
              <div className="text-[11px] text-textSecondary uppercase font-bold tracking-wider">Time Left</div>
            </div>
          </div>

          {/* Quick Restart */}
          <button
            onClick={() => window.location.reload()}
            className="p-3 rounded-xl bg-bgPrimary hover:bg-gray-800 text-textSecondary hover:text-white transition-all border border-gray-800"
            title="Restart Test"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Multiplayer Live Race Track (If in multiplayer room) */}
      {!isSolo && leaderboard.length > 0 && (
        <section className="mb-6 p-4 rounded-2xl glass-card border border-gray-800 shadow-lg">
          <div className="flex items-center justify-between mb-3 text-xs text-textSecondary font-bold uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-accent" /> Live Race Track
            </div>
            <span>{leaderboard.length} Racers</span>
          </div>

          <div className="space-y-3">
            {leaderboard.slice(0, 4).map((racer, idx) => {
              const isMe = racer.userId === userId;
              const racerProgress = Math.min(100, Math.max(0, racer.progress || 0));
              return (
                <div key={racer.userId || idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className={isMe ? 'text-accent font-bold' : 'text-gray-300'}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`} {racer.username || 'Racer'} {isMe && '(You)'}
                    </span>
                    <span className="font-mono text-gray-400">{racer.wpm || 0} WPM</span>
                  </div>
                  
                  <div className="h-3 w-full bg-bgPrimary rounded-full overflow-hidden relative border border-gray-800/80">
                    <div 
                      className={`h-full transition-all duration-300 rounded-full ${
                        isMe 
                          ? 'bg-gradient-to-r from-accent to-pink-500 shadow-md shadow-accent/50' 
                          : 'bg-gray-600'
                      }`}
                      style={{ width: `${racerProgress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Interactive Typing Area */}
      <main className="my-auto relative">
        <div className="glass-card p-6 sm:p-10 rounded-2xl border border-gray-800/80 shadow-2xl relative min-h-[260px] flex flex-col justify-between overflow-hidden">
          
          {/* Out of focus warning banner */}
          {!isFocused && !testFinished && (
            <div className="absolute inset-0 z-20 bg-bgPrimary/80 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer transition-all">
              <AlertCircle className="w-10 h-10 text-yellow-400 mb-2 animate-bounce" />
              <div className="text-white font-bold text-lg">Click anywhere or press any key to focus</div>
              <div className="text-textSecondary text-xs mt-1">Typing is paused while inactive</div>
            </div>
          )}

          {/* Words Container */}
          <div className="typing-area flex flex-wrap content-start">
            {words.map((word, wordIdx) => {
              const isCurrent = wordIdx === currentWordIndex;
              const isPast = wordIdx < currentWordIndex;
              const pastTyped = typedWords[wordIdx] || '';
              const isPastCorrect = isPast && pastTyped === word;

              let wordClass = 'word';
              if (isCurrent) wordClass += ' current';
              else if (isPast) {
                wordClass += isPastCorrect ? ' completed-correct' : ' completed-incorrect';
              }

              return (
                <span key={wordIdx} className={wordClass}>
                  {isCurrent ? (
                    <>
                      {word.split('').map((char, charIdx) => {
                        let charClass = 'char-pending';
                        if (charIdx < currentInput.length) {
                          charClass = currentInput[charIdx] === char ? 'char-correct' : 'char-incorrect';
                        }
                        return (
                          <span key={charIdx} className={charClass}>
                            {char}
                          </span>
                        );
                      })}
                      {/* Overflow extra characters */}
                      {currentInput.length > word.length && (
                        <span className="char-extra">
                          {currentInput.substring(word.length)}
                        </span>
                      )}
                    </>
                  ) : isPast ? (
                    <>
                      {word.split('').map((char, charIdx) => {
                        let charClass = 'char-pending';
                        if (charIdx < pastTyped.length) {
                          charClass = pastTyped[charIdx] === char ? 'char-correct' : 'char-incorrect';
                        }
                        return (
                          <span key={charIdx} className={charClass}>
                            {char}
                          </span>
                        );
                      })}
                      {pastTyped.length > word.length && (
                        <span className="char-extra">
                          {pastTyped.substring(word.length)}
                        </span>
                      )}
                    </>
                  ) : (
                    word.split('').map((char, charIdx) => (
                      <span key={charIdx} className="char-pending">
                        {char}
                      </span>
                    ))
                  )}
                </span>
              );
            })}
          </div>

          {/* Bottom Progress Indicator Bar */}
          <div className="mt-8 pt-4 border-t border-gray-800/80 flex items-center justify-between text-xs text-textSecondary font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-correct"></span>
              <span>{currentWordIndex} of {words.length} words typed</span>
            </div>
            <div className="font-semibold text-textPrimary">
              {!testStarted ? 'Start typing to begin...' : `${progressPercentage}% Completed`}
            </div>
          </div>
        </div>
      </main>

      {/* Live Leaderboard / Solo Metrics Footer */}
      <footer className="mt-6">
        <div className="glass-card p-4 rounded-xl border border-gray-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4 text-textSecondary">
            <span>Keystrokes: <b className="text-white font-mono">{totalKeystrokes}</b></span>
            <span>Correct: <b className="text-correct font-mono">{correctKeystrokes}</b></span>
            <span>Errors: <b className="text-rose-400 font-mono">{errorCount}</b></span>
            <span>Raw WPM: <b className="text-purple-400 font-mono">{grossWpm}</b></span>
          </div>

          <div className="text-textSecondary flex items-center gap-2">
            <kbd className="px-2 py-1 rounded bg-bgPrimary border border-gray-800 font-mono text-[10px]">SPACE</kbd> next word
            <kbd className="px-2 py-1 rounded bg-bgPrimary border border-gray-800 font-mono text-[10px]">BACKSPACE</kbd> edit
          </div>
        </div>
      </footer>
    </div>
  );
}

