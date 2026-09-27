import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Keyboard, Users, Zap, Trophy, Sparkles, ArrowRight, UserCheck, Flame, Clock } from 'lucide-react';
import { DURATION_OPTIONS, formatDurationLabel, getSoloTextForDuration } from '../utils/timer';

export default function Home() {
  const [code, setCode] = useState('');
  const [soloDuration, setSoloDuration] = useState(60);
  const [isEditingName, setIsEditingName] = useState(false);
  const navigate = useNavigate();
  const { username, setUsername, setSession } = useAppStore();
  const [tempName, setTempName] = useState(username);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      const formatted = code.trim().toUpperCase();
      setSession(formatted, formatted);
      navigate(`/lobby/${formatted}`);
    }
  };

  const handleCreate = () => {
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setSession(newCode, newCode);
    navigate(`/lobby/${newCode}`);
  };

  const handleSolo = () => {
    const soloCode = `SOLO-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    setSession(soloCode, soloCode);
    const text = getSoloTextForDuration(soloDuration);
    navigate(`/test/${soloCode}`, { state: { duration: soloDuration, text } });
  };

  const saveUsername = () => {
    if (tempName.trim()) {
      setUsername(tempName.trim());
      setIsEditingName(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      {/* Top Navbar */}
      <header className="flex justify-between items-center py-4 border-b border-gray-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent to-purple-600 flex items-center justify-center shadow-lg shadow-accent/25">
            <Keyboard className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
              Type<span className="text-accent">Flow</span>
            </span>
          </div>
        </div>

        {/* User Profile Pill */}
        <div className="flex items-center gap-3 bg-bgSecondary/80 border border-gray-700/60 rounded-full px-4 py-1.5 shadow-sm">
          <div className="w-7 h-7 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs">
            {username.charAt(0).toUpperCase()}
          </div>
          {isEditingName ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveUsername()}
                className="bg-bgPrimary text-white text-xs px-2 py-1 rounded border border-accent outline-none w-24"
                autoFocus
              />
              <button onClick={saveUsername} className="text-correct hover:text-emerald-400 text-xs font-semibold">
                Save
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-textPrimary">{username}</span>
              <button 
                onClick={() => { setTempName(username); setIsEditingName(true); }}
                className="text-xs text-textSecondary hover:text-accent transition-colors"
                title="Edit username"
              >
                ✏️
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="my-auto py-12">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-semibold tracking-wide uppercase mb-6">
            <Sparkles className="w-3.5 h-3.5" /> High Precision Typing Engine & Races
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
            Master Your Speed, <br />
            <span className="bg-gradient-to-r from-accent via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Race in Real-Time.
            </span>
          </h1>
          <p className="text-lg text-textSecondary max-w-xl mx-auto">
            Accurate WPM calculation, key-level accuracy tracking, and live multiplayer competition with friends and typists worldwide.
          </p>
        </div>

        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Multiplayer Card */}
          <div className="glass-card rounded-2xl p-7 flex flex-col justify-between border border-gray-700/60 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-2xl group-hover:bg-accent/20 transition-all pointer-events-none"></div>
            
            <div>
              <div className="w-12 h-12 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center mb-5 text-accent">
                <Users className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Multiplayer Arena</h2>
              <p className="text-sm text-textSecondary mb-6">
                Host a private typing room or join with a 6-character room code to race head-to-head live.
              </p>

              <form onSubmit={handleJoin} className="space-y-3 mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ROOM CODE"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="flex-1 px-4 py-3 bg-bgPrimary/90 border border-gray-700 rounded-xl focus:outline-none focus:border-accent text-center tracking-widest font-mono uppercase text-sm font-semibold placeholder:text-gray-600"
                    maxLength={6}
                  />
                  <button
                    type="submit"
                    disabled={!code.trim()}
                    className="bg-accent hover:bg-accentHover disabled:opacity-40 disabled:hover:bg-accent text-white font-semibold px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-accent/25 text-sm"
                  >
                    Join <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>

            <button
              onClick={handleCreate}
              className="w-full mt-2 py-3 px-4 bg-gray-800/80 hover:bg-gray-700/80 text-white font-semibold rounded-xl border border-gray-700 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <span>+ Create Private Room</span>
            </button>
          </div>

          {/* Quick Solo Test Card */}
          <div className="glass-card rounded-2xl p-7 flex flex-col justify-between border border-gray-700/60 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all pointer-events-none"></div>

            <div>
              <div className="w-12 h-12 rounded-xl bg-correct/20 border border-correct/40 flex items-center justify-center mb-5 text-correct">
                <Flame className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Solo Speed Test</h2>
              <div className="mb-5">
                <label className="text-[11px] text-textSecondary uppercase font-bold tracking-wider block mb-2">
                  Select Duration
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSoloDuration(opt.value)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs transition-all flex flex-col items-center border ${
                        soloDuration === opt.value
                          ? 'bg-correct text-white border-correct shadow-md shadow-correct/25'
                          : 'bg-bgPrimary/80 text-textSecondary border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-[9px] opacity-75">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 mb-6 text-sm text-textSecondary">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-correct"></span> Standard 5-character word metrics
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-correct"></span> Auto-scaled text for {formatDurationLabel(soloDuration)} duration
                </div>
              </div>
            </div>

            <button
              onClick={handleSolo}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-correct to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-correct/20 flex items-center justify-center gap-2 text-sm"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>Start Solo Test ({formatDurationLabel(soloDuration)})</span>
            </button>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto mt-12 text-center">
          <div className="p-4 rounded-xl bg-bgSecondary/40 border border-gray-800">
            <div className="text-accent font-bold text-lg mb-1">Standard Formula</div>
            <div className="text-xs text-textSecondary">Net WPM = (Correct Chars / 5) ÷ Minutes with zero inflated randomness.</div>
          </div>
          <div className="p-4 rounded-xl bg-bgSecondary/40 border border-gray-800">
            <div className="text-correct font-bold text-lg mb-1">Key-by-Key Accuracy</div>
            <div className="text-xs text-textSecondary">True error detection with visual feedback and backspace correction.</div>
          </div>
          <div className="p-4 rounded-xl bg-bgSecondary/40 border border-gray-800">
            <div className="text-purple-400 font-bold text-lg mb-1">Synchronized Races</div>
            <div className="text-xs text-textSecondary">Real-time socket broadcasts with synchronized countdowns for everyone.</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-500 py-4 border-t border-gray-800/60">
        TypeFlow • Built for competitive typists and speed perfectionists
      </footer>
    </div>
  );
}

