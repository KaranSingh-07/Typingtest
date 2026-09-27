import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

interface Participant {
  userId: string;
  username: string;
  socketId: string;
  isHost: boolean;
  wpm: number;
  accuracy: number;
  progress: number;
  completed: boolean;
  finishTime?: number;
}

interface Session {
  code: string;
  hostId: string;
  duration: number;
  text: string;
  status: 'lobby' | 'countdown' | 'in_progress' | 'completed';
  participants: Map<string, Participant>;
  startTime?: number;
}

const sessions = new Map<string, Session>();

const TEXT_PARAGRAPHS = [
  "In the heart of the digital age, connectivity defines our existence. We navigate through streams of data, searching for meaning in a sea of endless information.",
  "Speed and precision are the true hallmarks of a master typist. Keep your fingers light on the keys, maintain steady rhythm, and let muscle memory guide every stroke.",
  "Technology continues to reshape how we communicate, collaborate, and innovate across borders. Every line of code written today lays the foundation for tomorrow.",
  "The quick brown fox jumps over the lazy dog. A classic sentence containing every letter of the alphabet, challenging typists across generations to master agility and balance.",
  "Curiosity is the engine of achievement. When we dare to explore uncharted territories and embrace complex problems, remarkable discoveries inevitably unfold.",
  "Learning to type with effortless velocity demands deliberate practice, patience, and unwavering discipline. When rhythm becomes second nature, ideas flow seamlessly onto the screen.",
  "Deep focus and consistency create mastery in every craft. Overcoming obstacles with resilience transforms raw effort into genuine expertise and enduring accomplishment.",
  "Creativity thrives at the intersection of imagination and relentless effort. As digital horizons expand, new horizons of knowledge and insight reveal themselves."
];

function getTextForDuration(duration: number) {
  // Approximate 120-140 words per minute of test duration to guarantee typists never run out of text
  const targetWords = Math.max(50, Math.ceil((duration / 60) * 140));
  let combined = [];
  let wordCount = 0;
  let pool = [...TEXT_PARAGRAPHS].sort(() => Math.random() - 0.5);
  let index = 0;

  while (wordCount < targetWords) {
    const paragraph = pool[index % pool.length];
    combined.push(paragraph);
    wordCount += paragraph.split(/\s+/).length;
    index++;
  }

  return combined.join(' ');
}


function getSessionPayload(session: Session) {
  return {
    code: session.code,
    hostId: session.hostId,
    duration: session.duration,
    text: session.text,
    status: session.status,
    participants: Array.from(session.participants.values()).map(p => ({
      userId: p.userId,
      username: p.username,
      isHost: p.isHost,
      wpm: p.wpm,
      accuracy: p.accuracy,
      progress: p.progress,
      completed: p.completed
    }))
  };
}

io.on('connection', (socket) => {
  let currentSessionCode: string | null = null;
  let currentUserId: string | null = null;

  socket.on('join_lobby', ({ sessionCode, userId, username }) => {
    currentSessionCode = sessionCode;
    currentUserId = userId;
    const roomName = `session:${sessionCode}`;
    socket.join(roomName);

    if (!sessions.has(sessionCode)) {
      sessions.set(sessionCode, {
        code: sessionCode,
        hostId: userId,
        duration: 60,
        text: getTextForDuration(60),
        status: 'lobby',
        participants: new Map()
      });
    }

    const session = sessions.get(sessionCode)!;
    const isHost = session.hostId === userId || session.participants.size === 0;
    if (isHost) {
      session.hostId = userId;
    }

    session.participants.set(userId, {
      userId,
      username: username || `Guest_${userId.slice(-4)}`,
      socketId: socket.id,
      isHost,
      wpm: 0,
      accuracy: 100,
      progress: 0,
      completed: false
    });

    io.to(roomName).emit('session_updated', getSessionPayload(session));
    io.to(roomName).emit('participant_joined', {
      userId,
      username,
      count: session.participants.size
    });
  });

  socket.on('update_settings', ({ sessionCode, duration, text }) => {
    const session = sessions.get(sessionCode);
    if (!session) return;
    if (duration) {
      session.duration = duration;
      session.text = getTextForDuration(duration);
    }
    if (text) session.text = text;
    io.to(`session:${sessionCode}`).emit('session_updated', getSessionPayload(session));
  });

  socket.on('start_race', ({ sessionCode }) => {
    const session = sessions.get(sessionCode);
    if (!session) return;

    session.status = 'countdown';
    session.text = getTextForDuration(session.duration);
    // Reset participant progress
    session.participants.forEach(p => {
      p.wpm = 0;
      p.accuracy = 100;
      p.progress = 0;
      p.completed = false;
    });

    const roomName = `session:${sessionCode}`;
    io.to(roomName).emit('race_countdown_start', {
      countdownSeconds: 3,
      duration: session.duration,
      text: session.text
    });

    setTimeout(() => {
      if (sessions.has(sessionCode)) {
        session.status = 'in_progress';
        session.startTime = Date.now();
        io.to(roomName).emit('race_started', {
          startTime: session.startTime,
          duration: session.duration,
          text: session.text
        });
      }
    }, 3000);
  });

  socket.on('update_progress', ({ sessionCode, userId, wpm, accuracy, progress }) => {
    const session = sessions.get(sessionCode);
    if (!session) return;

    const participant = session.participants.get(userId);
    if (participant) {
      participant.wpm = Math.max(0, Math.round(wpm || 0));
      participant.accuracy = Math.min(100, Math.max(0, Math.round(accuracy || 100)));
      participant.progress = Math.min(100, Math.max(0, Math.round(progress || 0)));

      // Broadcast leaderboard update
      const leaderboard = Array.from(session.participants.values())
        .map(p => ({
          userId: p.userId,
          username: p.username,
          wpm: p.wpm,
          accuracy: p.accuracy,
          progress: p.progress,
          completed: p.completed
        }))
        .sort((a, b) => b.wpm - a.wpm);

      io.to(`session:${sessionCode}`).emit('leaderboard_update', {
        timestamp: Date.now(),
        leaderboard: leaderboard.map((u, i) => ({ ...u, rank: i + 1 }))
      });
    }
  });

  // Backward compatibility with keystroke_batch if needed
  socket.on('keystroke_batch', ({ sessionId, userId, wpm, accuracy, progress }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    const participant = session.participants.get(userId);
    if (participant) {
      if (typeof wpm === 'number') participant.wpm = Math.round(wpm);
      if (typeof accuracy === 'number') participant.accuracy = Math.round(accuracy);
      if (typeof progress === 'number') participant.progress = Math.round(progress);

      const leaderboard = Array.from(session.participants.values())
        .map(p => ({
          userId: p.userId,
          username: p.username,
          wpm: p.wpm,
          accuracy: p.accuracy,
          progress: p.progress,
          completed: p.completed
        }))
        .sort((a, b) => b.wpm - a.wpm);

      io.to(`session:${sessionId}`).emit('leaderboard_update', {
        timestamp: Date.now(),
        leaderboard: leaderboard.map((u, i) => ({ ...u, rank: i + 1 }))
      });
    }
  });

  socket.on('test_finished', ({ sessionId, userId, wpm, accuracy }) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(userId);
    if (participant) {
      participant.completed = true;
      participant.progress = 100;
      participant.wpm = Math.max(0, Math.round(wpm || 0));
      participant.accuracy = Math.min(100, Math.max(0, Math.round(accuracy || 100)));
      participant.finishTime = Date.now();
    }

    const leaderboard = Array.from(session.participants.values())
      .map(p => ({
        userId: p.userId,
        username: p.username,
        wpm: p.wpm,
        accuracy: p.accuracy,
        progress: p.progress,
        completed: p.completed
      }))
      .sort((a, b) => b.wpm - a.wpm);

    const roomName = `session:${sessionId}`;
    io.to(roomName).emit('user_completed', {
      userId,
      wpm,
      accuracy,
      leaderboard: leaderboard.map((u, i) => ({ ...u, rank: i + 1 }))
    });
  });

  socket.on('disconnect', () => {
    if (currentSessionCode && currentUserId) {
      const session = sessions.get(currentSessionCode);
      if (session) {
        session.participants.delete(currentUserId);
        if (session.participants.size === 0) {
          sessions.delete(currentSessionCode);
        } else {
          if (session.hostId === currentUserId) {
            const nextHost = session.participants.keys().next().value;
            if (nextHost) {
              session.hostId = nextHost;
              const nextP = session.participants.get(nextHost);
              if (nextP) nextP.isHost = true;
            }
          }
          io.to(`session:${currentSessionCode}`).emit('session_updated', getSessionPayload(session));
        }
      }
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeSessions: sessions.size });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (Multiplayer Real-Time Engine Active)`);
});

