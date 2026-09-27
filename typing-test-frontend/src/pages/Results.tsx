import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Trophy, Zap, Target, RotateCcw, Home as HomeIcon, Share2, Check, Award, Flame, Clock } from 'lucide-react';
import { useAppStore } from '../store';
import { formatDurationLabel } from '../utils/timer';

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const { code } = useParams();
  const { userId, username } = useAppStore();
  const [copied, setCopied] = useState(false);

  const {
    wpm = 0,
    grossWpm = 0,
    accuracy = 100,
    totalKeystrokes = 0,
    correctKeystrokes = 0,
    errorCount = 0,
    timeElapsed = 60,
    leaderboard = []
  } = location.state || {};

  const handleCopyScore = () => {
    const timeLabel = formatDurationLabel(timeElapsed);
    const text = `⚡ TypeFlow Speed Test Results\n👤 Racer: ${username}\n🚀 Net Speed: ${wpm} WPM\n🎯 Accuracy: ${accuracy}%\n⏱️ Time: ${timeLabel}\n⌨️ Keystrokes: ${totalKeystrokes} (${errorCount} errors)\nPlay at http://localhost:5173`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlayAgain = () => {
    if (code?.startsWith('SOLO-')) {
      const newSolo = `SOLO-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      navigate(`/test/${newSolo}`);
    } else if (code) {
      navigate(`/lobby/${code}`);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto flex flex-col justify-between">
      {/* Top Banner */}
      <div className="text-center my-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-correct/10 border border-correct/30 text-correct text-xs font-semibold uppercase tracking-wider mb-3">
          <Award className="w-4 h-4" /> Race Completed
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
          Performance <span className="text-accent">Breakdown</span>
        </h1>
      </div>

      {/* Main Scorecard Banner */}
      <div className="glass-card rounded-3xl p-6 sm:p-10 border border-gray-800 shadow-2xl mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center border-b border-gray-800/80 pb-8 mb-8">
          {/* Main WPM */}
          <div className="flex flex-col items-center md:items-start">
            <span className="text-xs uppercase font-bold text-textSecondary tracking-widest mb-1">Net Typing Speed</span>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl sm:text-7xl font-black font-mono text-white tracking-tight">{wpm}</span>
              <span className="text-2xl font-bold text-accent">WPM</span>
            </div>
            <p className="text-xs text-textSecondary mt-2">
              Standard 5-keystroke words per minute
            </p>
          </div>

          {/* Main Accuracy */}
          <div className="flex flex-col items-center md:items-start">
            <span className="text-xs uppercase font-bold text-textSecondary tracking-widest mb-1">Keystroke Accuracy</span>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl sm:text-7xl font-black font-mono text-correct tracking-tight">{accuracy}%</span>
              <Target className="w-8 h-8 text-correct self-center" />
            </div>
            <p className="text-xs text-textSecondary mt-2">
              {errorCount === 0 ? 'Flawless precision! Zero errors detected.' : `${errorCount} mistake${errorCount > 1 ? 's' : ''} recorded`}
            </p>
          </div>
        </div>

        {/* Detailed 4-Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-bgPrimary/70 border border-gray-800/80">
            <div className="text-textSecondary text-[11px] font-bold uppercase tracking-wider mb-1">Raw Speed</div>
            <div className="text-2xl font-black text-purple-400 font-mono">{grossWpm} <span className="text-xs text-textSecondary">WPM</span></div>
          </div>

          <div className="p-4 rounded-xl bg-bgPrimary/70 border border-gray-800/80">
            <div className="text-textSecondary text-[11px] font-bold uppercase tracking-wider mb-1">Keystrokes</div>
            <div className="text-2xl font-black text-white font-mono">{totalKeystrokes}</div>
          </div>

          <div className="p-4 rounded-xl bg-bgPrimary/70 border border-gray-800/80">
            <div className="text-textSecondary text-[11px] font-bold uppercase tracking-wider mb-1">Correct Chars</div>
            <div className="text-2xl font-black text-correct font-mono">{correctKeystrokes}</div>
          </div>

          <div className="p-4 rounded-xl bg-bgPrimary/70 border border-gray-800/80">
            <div className="text-textSecondary text-[11px] font-bold uppercase tracking-wider mb-1">Errors</div>
            <div className="text-2xl font-black text-rose-400 font-mono">{errorCount}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4">
          <button
            onClick={handlePlayAgain}
            className="flex-1 py-3.5 px-6 bg-accent hover:bg-accentHover text-white font-bold rounded-xl transition-all shadow-lg shadow-accent/25 flex items-center justify-center gap-2 text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Play Again</span>
          </button>

          <button
            onClick={handleCopyScore}
            className="py-3.5 px-6 bg-bgPrimary hover:bg-gray-800 border border-gray-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
          >
            {copied ? <Check className="w-4 h-4 text-correct" /> : <Share2 className="w-4 h-4" />}
            <span>{copied ? 'Scorecard Copied!' : 'Share Score'}</span>
          </button>

          <button
            onClick={() => navigate('/')}
            className="py-3.5 px-6 bg-bgPrimary hover:bg-gray-800 border border-gray-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
          >
            <HomeIcon className="w-4 h-4" />
            <span>Home</span>
          </button>
        </div>
      </div>

      {/* Leaderboard Table (if available) */}
      {leaderboard.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-gray-800 shadow-xl mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <h2 className="text-base font-bold text-white uppercase tracking-wider">Final Standings</h2>
            </div>
            <span className="text-xs text-textSecondary">{leaderboard.length} Racers Ranked</span>
          </div>

          <div className="space-y-2">
            {leaderboard.map((item: any, i: number) => {
              const isCurrentUser = item.userId === userId;
              return (
                <div
                  key={item.userId || i}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    isCurrentUser 
                      ? 'bg-accent/15 border-accent/40 shadow-sm' 
                      : 'bg-bgPrimary/60 border-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold w-7 text-center">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </span>
                    <span className="font-semibold text-sm text-white">
                      {item.username || item.userId?.substring(0, 8)} {isCurrentUser && <span className="text-xs text-accent font-normal">(You)</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-6">
                    {item.accuracy !== undefined && (
                      <span className="text-xs font-mono text-gray-400">{item.accuracy}% acc</span>
                    )}
                    <span className="text-base font-mono font-bold text-accent">{item.wpm} WPM</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-gray-600 py-2">
        TypeFlow • Keep pushing your limits!
      </footer>
    </div>
  );
}

