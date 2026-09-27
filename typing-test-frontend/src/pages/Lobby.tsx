import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../store';
import { Users, Play, Copy, Check, Clock, ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { DURATION_OPTIONS, formatDurationLabel } from '../utils/timer';

interface Participant {
  userId: string;
  username: string;
  isHost: boolean;
}

export default function Lobby() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { userId, username, setSession, setTestConfig } = useAppStore();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [duration, setDuration] = useState(60);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (code) setSession(code, code);

    const newSocket = io('http://localhost:3000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('join_lobby', { sessionCode: code, userId, username });
    });

    newSocket.on('session_updated', (data) => {
      if (data.participants) {
        setParticipants(data.participants);
        const me = data.participants.find((p: any) => p.userId === userId);
        if (me) setIsHost(me.isHost);
      }
      if (data.duration) setDuration(data.duration);
    });

    newSocket.on('race_countdown_start', (data) => {
      setTestConfig(data.duration || duration, data.text || '', isHost);
      let count = data.countdownSeconds || 3;
      setCountdown(count);

      const interval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdown(count);
        } else {
          clearInterval(interval);
          setCountdown(0);
          setTimeout(() => {
            navigate(`/test/${code}`, { state: { text: data.text, duration: data.duration } });
          }, 400);
        }
      }, 1000);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [code, userId, username, navigate, setSession, setTestConfig, duration, isHost]);

  const handleStartRace = () => {
    if (socket && isHost) {
      socket.emit('start_race', { sessionCode: code });
    }
  };

  const handleDurationChange = (newDuration: number) => {
    setDuration(newDuration);
    if (socket && isHost) {
      socket.emit('update_settings', { sessionCode: code, duration: newDuration });
    }
  };

  const copyRoomCode = () => {
    if (code) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 max-w-5xl mx-auto flex flex-col justify-between">
      {/* Countdown Overlay */}
      {countdown !== null && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in">
          <div className="text-gray-400 text-xl font-bold uppercase tracking-widest mb-4">Starting in</div>
          <div className="text-8xl sm:text-9xl font-black bg-gradient-to-r from-accent to-pink-500 bg-clip-text text-transparent animate-pulse-fast">
            {countdown > 0 ? countdown : 'GO!'}
          </div>
          <p className="text-textSecondary mt-6 text-sm">Get your fingers on the home row!</p>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/')} 
            className="p-2 rounded-xl bg-bgSecondary hover:bg-gray-800 text-textSecondary hover:text-white transition-all border border-gray-800"
            title="Back to Home"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Multiplayer <span className="text-accent">Lobby</span>
            </h1>
            <p className="text-xs text-textSecondary">Share the code with friends to race together</p>
          </div>
        </div>

        {/* Room Code Badge */}
        <div className="flex items-center gap-2 bg-bgSecondary/90 border border-gray-700/80 px-4 py-2 rounded-xl shadow-lg">
          <span className="text-xs text-textSecondary uppercase font-mono tracking-wider">Room:</span>
          <span className="text-lg font-mono font-bold text-accent tracking-widest">{code}</span>
          <button
            onClick={copyRoomCode}
            className="ml-2 p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            title="Copy Invite Link"
          >
            {copied ? <Check className="w-4 h-4 text-correct" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 my-auto">
        {/* Settings / Race Info */}
        <div className="glass-card p-6 rounded-2xl border border-gray-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-accent font-semibold text-sm mb-4">
              <Sparkles className="w-4 h-4" /> Match Settings
            </div>

            <div className="mb-6">
              <label className="text-xs text-textSecondary uppercase font-bold tracking-wider block mb-3">
                Test Duration
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    disabled={!isHost}
                    onClick={() => handleDurationChange(opt.value)}
                    className={`py-2 px-1.5 rounded-xl font-bold text-xs transition-all flex flex-col items-center justify-center border ${
                      duration === opt.value 
                        ? 'bg-accent text-white border-accent shadow-lg shadow-accent/25' 
                        : 'bg-bgPrimary text-textSecondary border-gray-800 hover:border-gray-700 disabled:opacity-60'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="text-[9px] opacity-75">{opt.description}</span>
                  </button>
                ))}
              </div>
              {!isHost && (
                <p className="text-[11px] text-textSecondary mt-2 italic">Only host can change duration</p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-bgPrimary/70 border border-gray-800 text-xs space-y-2 text-textSecondary">
              <div className="flex justify-between">
                <span>Mode:</span>
                <span className="font-semibold text-textPrimary">Real-time Race</span>
              </div>
              <div className="flex justify-between">
                <span>Leaderboard:</span>
                <span className="font-semibold text-textPrimary">Live Synchronized</span>
              </div>
              <div className="flex justify-between">
                <span>Formula:</span>
                <span className="font-semibold text-correct">Standard Net WPM</span>
              </div>
            </div>
          </div>

          <div className="mt-8">
            {isHost ? (
              <button
                onClick={handleStartRace}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-correct to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-correct/25 flex items-center justify-center gap-2 text-base"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>Start Race ({participants.length} Ready)</span>
              </button>
            ) : (
              <div className="text-center p-3.5 rounded-xl bg-bgPrimary/60 border border-gray-800 text-textSecondary text-sm flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping"></span>
                <span>Waiting for host to start the race...</span>
              </div>
            )}
          </div>
        </div>

        {/* Participants Panel */}
        <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-gray-800 shadow-xl flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-bold text-white">Racers in Lobby</h2>
            </div>
            <span className="bg-bgPrimary border border-gray-800 text-textSecondary px-3 py-1 rounded-full text-xs font-semibold">
              {participants.length} Connected
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-grow content-start">
            {participants.map((p, i) => {
              const isCurrentUser = p.userId === userId;
              return (
                <div 
                  key={p.userId || i} 
                  className={`p-4 rounded-xl flex flex-col items-center gap-2 border transition-all ${
                    isCurrentUser 
                      ? 'bg-accent/10 border-accent/40 shadow-sm' 
                      : 'bg-bgPrimary/80 border-gray-800'
                  }`}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-accent/30 to-purple-500/30 border border-accent/40 flex items-center justify-center text-accent font-black text-lg">
                      {p.username.charAt(0).toUpperCase()}
                    </div>
                    {p.isHost && (
                      <div className="absolute -top-1.5 -right-1.5 bg-yellow-500 text-black p-1 rounded-full shadow-md" title="Host">
                        <Crown className="w-3 h-3 fill-black" />
                      </div>
                    )}
                  </div>
                  
                  <div className="text-center w-full">
                    <div className="font-semibold text-sm text-white truncate">
                      {p.username} {isCurrentUser && <span className="text-xs text-accent font-normal">(You)</span>}
                    </div>
                    <span className="inline-block mt-1 text-[11px] text-correct bg-correct/10 px-2 py-0.5 rounded-full font-medium">
                      Ready to Race
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="text-center text-xs text-gray-600 mt-6">
        Room #{code} • Connected to real-time sync server
      </footer>
    </div>
  );
}

