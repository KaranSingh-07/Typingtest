# ANTIGRAVITY TYPING TEST PLATFORM - COMPREHENSIVE BUILD SPECIFICATION
## Project: MultiPlayer Real-Time Typing Test System (600-700 Concurrent Users)

---

## EXECUTIVE SUMMARY

Build a high-performance, scalable typing test platform capable of handling 600-700 concurrent users with real-time synchronized gameplay, live leaderboards, and instant winner determination. The system should prioritize smooth performance, minimal latency, and seamless user experience inspired by Typer.io (test mechanics) and Kahoot (leaderboard/winner UX).

**Key Differentiator**: Users should NOT be forced to stop typing when they make errors. They can move forward to the next word, but the incorrect words remain marked as "incomplete" until the correct sequence is typed. This creates a flow-state experience while maintaining accuracy tracking.

---

# PHASE 1: ARCHITECTURE, INFRASTRUCTURE & REAL-TIME ENGINE

## 1.1 TECHNOLOGY STACK REQUIREMENTS

### Backend Infrastructure
- **Runtime**: Node.js (v18+) with TypeScript
- **Web Server**: Express.js with compression middleware
- **Real-Time Protocol**: Socket.IO v4.x with Redis adapter for horizontal scaling
- **Database**: 
  - PostgreSQL 14+ (persistent data: users, tests, sessions, results)
  - Redis 7+ (real-time state, leaderboards, active sessions cache)
- **Message Queue**: Redis Pub/Sub or Bull Queue (for event broadcasting)
- **Deployment**: Docker containerized, orchestrated on Kubernetes or cloud-native platform (AWS ECS/GKE recommended)
- **CDN**: CloudFront or Cloudflare for static assets

### Frontend Stack
- **Framework**: React 18+ with TypeScript
- **Real-Time Client**: Socket.IO client library
- **State Management**: Zustand or Redux Toolkit (for quiz state, leaderboard sync)
- **UI Component Library**: shadcn/ui + Tailwind CSS (for consistent, fast rendering)
- **Performance**: React.lazy() for code splitting, Web Workers for heavy computation
- **Build Tool**: Vite (fast compilation, optimized bundles)

### Infrastructure Requirements
- **Min. Server Capacity**: 4+ CPU cores, 16GB+ RAM per instance (for 350-400 users)
- **Load Balancer**: Nginx or cloud-native (ALB/NLB)
- **Monitoring**: Prometheus + Grafana, ELK Stack for logging
- **Testing**: K6/Locust for load testing up to 700 concurrent users

---

## 1.2 SCALABILITY & PERFORMANCE ARCHITECTURE

### Real-Time Engine Design
1. **Socket.IO with Redis Adapter**
   - Enables horizontal scaling across multiple server instances
   - Redis pub/sub for cross-server event broadcasting
   - Connection pooling to handle 700+ concurrent WebSocket connections smoothly

2. **Session Management**
   - Use sticky sessions (IP hash) to route all messages from a client to the same server
   - Fallback to Redis session store for failover scenarios
   - Max connections per server: 350-400 users (deploy 2+ instances for 700 users)

3. **Latency Optimization**
   - Message batching: Aggregate keystroke events every 50ms before sending to server
   - Payload compression: Gzip all Socket.IO payloads
   - Heartbeat interval: 25s (reduce from default 60s to catch disconnections faster)
   - Reconnection strategy: Exponential backoff (1s → 5s → 10s)

### Database Architecture
- **Read Replicas**: 1 primary + 2 read replicas for horizontal read scaling
- **Connection Pooling**: PgBouncer (min: 20, max: 100 connections per app instance)
- **Caching**: Redis cache layer for:
  - Active test sessions (TTL: test duration + 5min)
  - Leaderboard snapshots (updated every 1-2 seconds)
  - User profiles and test metadata

### Memory Optimization
- Keep only **active participants' data** in RAM (current test state)
- Archive completed tests to PostgreSQL immediately after test ends
- Implement Redis eviction policy: `allkeys-lru` (max 8GB RAM per Redis instance)
- Cleanup disconnected users after 30s inactivity

---

## 1.3 CORE DATA MODELS & SCHEMAS

### PostgreSQL Tables

```sql
-- Users Table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  avatar_url VARCHAR(255),
  total_tests INT DEFAULT 0,
  avg_wpm DECIMAL(5,2),
  avg_accuracy DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tests Table (metadata)
CREATE TABLE tests (
  id SERIAL PRIMARY KEY,
  creator_id INT REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  text_content TEXT NOT NULL,
  total_words INT NOT NULL,
  duration_seconds INT NOT NULL,
  difficulty_level VARCHAR(20), -- 'easy', 'medium', 'hard'
  is_public BOOLEAN DEFAULT true,
  test_type VARCHAR(50), -- 'standard', 'custom'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Test Sessions (active/completed test instances)
CREATE TABLE test_sessions (
  id UUID PRIMARY KEY,
  test_id INT REFERENCES tests(id),
  creator_id INT REFERENCES users(id),
  session_code VARCHAR(10) UNIQUE NOT NULL, -- For joining lobby
  max_participants INT DEFAULT 700,
  current_participants INT DEFAULT 0,
  status VARCHAR(50), -- 'lobby', 'in_progress', 'completed'
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  qr_code_url VARCHAR(255),
  share_link VARCHAR(255)
);

-- Test Results (per user, per session)
CREATE TABLE test_results (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES test_sessions(id),
  user_id INT REFERENCES users(id),
  words_per_minute DECIMAL(5,2),
  accuracy DECIMAL(5,2),
  gross_wpm DECIMAL(5,2),
  total_keystrokes INT,
  correct_keystrokes INT,
  position_in_leaderboard INT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

-- Keystroke Log (for detailed analytics)
CREATE TABLE keystroke_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES test_sessions(id),
  user_id INT REFERENCES users(id),
  word_index INT,
  character_index INT,
  typed_char VARCHAR(10),
  expected_char VARCHAR(10),
  is_correct BOOLEAN,
  timestamp_ms BIGINT
);

-- Indices for performance
CREATE INDEX idx_sessions_status ON test_sessions(status);
CREATE INDEX idx_results_session ON test_results(session_id);
CREATE INDEX idx_results_user ON test_results(user_id);
CREATE INDEX idx_keystroke_session ON keystroke_logs(session_id);
```

### Redis Data Structures

```
# Active Session State (expires after test + 5 min)
test_session:{sessionId}:participants = Set of user IDs
test_session:{sessionId}:state = {
  "status": "in_progress",
  "started_at": timestamp,
  "test_id": 123,
  "test_text": "...",
  "duration": 60
}

# Real-time User Progress (per user, per session)
progress:{sessionId}:{userId} = {
  "words_completed": 45,
  "current_word_index": 46,
  "typed_so_far": "the qu",
  "correct_chars": 230,
  "total_chars": 240,
  "is_complete": false,
  "completion_time": null,
  "wpm": 75.5,
  "accuracy": 95.8
}

# Live Leaderboard (sorted set, updated every keystroke)
leaderboard:{sessionId} = ZSET with scores = WPM
  ZADD leaderboard:{sessionId} 75.5 userId_1
  ZADD leaderboard:{sessionId} 68.2 userId_2
  ZRANGE leaderboard:{sessionId} 0 -1 WITHSCORES

# Connection tracking
connected_users:{sessionId} = Set of currently connected user IDs
user_session_mapping:{userId} = sessionId (quick lookup)
```

---

## 1.4 REAL-TIME EVENT FLOW & SYNCHRONIZATION

### Socket.IO Event Map

**Client → Server Events**
```typescript
// Connection & Lobby
socket.emit('join_lobby', { sessionCode, userId, username, avatar })
socket.emit('ready_for_test', { sessionId, userId })
socket.emit('start_test', { sessionId }) // Host only

// Typing Events (batched every 50ms)
socket.emit('keystroke_batch', {
  sessionId,
  userId,
  batch: [
    { wordIndex: 45, charIndex: 3, typedChar: 'a', timestamp: 1234567890 },
    { wordIndex: 45, charIndex: 4, typedChar: 'b', timestamp: 1234567905 }
  ]
})

socket.emit('word_completed', { sessionId, userId, wordIndex, isCorrect, time })
socket.emit('test_finished', { sessionId, userId, completionTime })
socket.emit('disconnect_graceful', { sessionId, userId })
```

**Server → Client Events (Real-Time Broadcast)**
```typescript
// Lobby updates
socket.emit('participant_joined', { count, maxCount, username, avatar })
socket.emit('participant_left', { count, username })
socket.emit('lobby_countdown', { secondsRemaining })

// Test start
socket.emit('test_starting', { testText, duration, testId })

// Leaderboard updates (every 1-2 seconds for all users)
socket.emit('leaderboard_update', {
  timestamp: Date.now(),
  leaderboard: [
    { rank: 1, userId, username, wpm: 85.3, accuracy: 98.2, status: 'in_progress' },
    { rank: 2, userId, username, wpm: 78.5, accuracy: 96.1, status: 'in_progress' },
    // ... top 20 or all users
  ]
})

// User progress update (only for self, or broadcast minimal data)
socket.emit('your_progress', { wpm, accuracy, progress: 0.65 })

// Test completion notifications
socket.emit('user_completed', { userId, username, rank, wpm, accuracy, finishTime })
socket.emit('test_ended', { winnerId, winnerName, topPlayers: [...] })

// Connection status
socket.emit('connection_status', { status: 'connected', latency: 45 })
```

---

## 1.5 LOAD TESTING & PERFORMANCE BENCHMARKS

### Expected Performance Metrics
| Metric | Target |
|--------|--------|
| Max concurrent users per instance | 350-400 |
| WebSocket connection latency | < 100ms |
| Keystroke event processing | < 50ms |
| Leaderboard update frequency | 1-2 seconds |
| Server CPU usage @ 700 users | 60-75% |
| Server memory usage @ 700 users | 8-12GB |
| Database query response time | < 50ms (p95) |
| Socket.IO reconnection time | < 2 seconds |

### Load Testing Script (K6 example)
```javascript
// Load test script: 700 concurrent users over 5 minutes
import http from 'k6/http';
import ws from 'k6/ws';

export let options = {
  stages: [
    { duration: '1m', target: 200 },  // Ramp to 200
    { duration: '2m', target: 700 },  // Ramp to 700
    { duration: '1m', target: 700 },  // Stay at 700
    { duration: '1m', target: 0 }     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    ws_connecting: ['p(95)<1000']
  }
};

export default function() {
  const url = 'wss://api.typing-test.com';
  const params = { tags: { name: 'WebSocketTest' } };

  ws.connect(url, params, function(socket) {
    socket.on('open', () => {
      socket.send(JSON.stringify({
        event: 'join_lobby',
        data: { sessionCode: 'ABC123', userId: `user_${__VU}` }
      }));
    });

    socket.on('message', (data) => {
      // Simulate typing
      socket.send(JSON.stringify({
        event: 'keystroke_batch',
        data: { batch: generateKeystrokes() }
      }));
    });

    socket.setTimeout(() => socket.close(), 65000);
  });
}
```

---

## 1.6 ERROR HANDLING & RESILIENCE

### Connection Resilience
- **Automatic Reconnection**: Socket.IO default with exponential backoff
- **Fallback to Polling**: If WebSocket fails, fallback to HTTP long-polling
- **Stale Connection Cleanup**: Server-side heartbeat detects dead connections after 45s

### Data Consistency
- **Optimistic Updates**: UI updates immediately on user input, server validates after
- **Conflict Resolution**: Server is source of truth; if mismatch, resync from server
- **Transaction Handling**: Use PostgreSQL transactions for critical updates (test completion, final scores)

### Fault Tolerance
- **Circuit Breaker Pattern**: For external services (email, QR generation)
- **Graceful Degradation**: If Redis unavailable, fallback to in-memory cache (single instance only)
- **Automatic Failover**: Database read replicas for HA

---

# PHASE 2: FRONTEND UI/UX & USER EXPERIENCE

## 2.1 DESIGN PRINCIPLES & INSPIRATION

### Typer.io Integration
- Clean, minimalist interface with large, readable font
- Real-time WPM/accuracy display during test
- Smooth animations for cursor and word highlighting
- Dark mode support (essential for long-duration tests)

### Kahoot.com Integration (Leaderboard & Winner Screen)
- Vibrant, celebratory winner announcement with animations
- Ranked leaderboard with color-coded rankings (Gold/Silver/Bronze for top 3)
- Real-time position updates without jarring layout shifts
- Sound effects for milestones (1st place, test completion, personal record)

---

## 2.2 CORE UI SCREENS & FLOWS

### Screen 1: Home / Test Selection
**Purpose**: Users browse and create tests
**Elements**:
- Header: Logo, user profile dropdown, "Create Test" button
- Search/Filter: By difficulty, duration, popularity
- Test Card Grid: 
  - Test title, description, stats (avg WPM, avg accuracy, participant count)
  - "Join Lobby" button
  - Difficulty badge (Easy/Medium/Hard)
- Suggested Tests Section: Trending, new, most played

**Responsive**: Mobile: 1 column, Tablet: 2 columns, Desktop: 3-4 columns
**Performance**: Lazy load test cards, infinite scroll or pagination

### Screen 2: Lobby / Pre-Test
**Purpose**: Users gather before test, view participants, see countdown
**Layout**: 
```
┌─────────────────────────────────────┐
│  Test Title | Participants: 42/700  │ (Header)
├─────────────────────────────────────┤
│  Test Preview:                      │ (Left side, 40% width)
│  "In the heart of the digital age.."│
│  Duration: 60s | Difficulty: Hard   │
│                                     │
│  [QR Code] [Copy Link]              │
├─────────────────────────────────────┤
│  Participants Grid (Right 60%):     │ (Right side, scrollable)
│  ┌────────┐ ┌────────┐             │
│  │ Avatar │ │ Avatar │             │
│  │ Name   │ │ Name   │             │
│  │ ⚡ Ready│ │ 📍 Idle│             │
│  └────────┘ └────────┘             │
│  ... (repeat for 42 users)          │
│                                     │
│  [Ready Button] [Leave]             │ (Bottom)
└─────────────────────────────────────┘
```
**Features**:
- Real-time participant list (add/remove animations)
- User status indicators (Ready ✓, Idle ●, Typing ⌨)
- Auto-join animation: new participant slides in from right
- Host-only: "Start Test" button (visible only to test creator)
- Share section: QR code + copy-to-clipboard link
- Countdown timer (3-2-1 GO!)

**Interactivity**:
- Click on participant → view their profile
- Drag to scroll participants (mobile-friendly)
- Ready button toggles state (visual feedback: button color change)

### Screen 3: Active Test / Typing Interface
**Purpose**: Main typing area where users complete the test
**Layout**:
```
┌──────────────────────────────────────────┐
│ WPM: 75.5 | Accuracy: 98.2% | Time: 45s │ (Top bar)
├──────────────────────────────────────────┤
│                                          │
│  In the heart of the digital age,       │
│  connectivity defines our existence.    │
│  [Cursor here] remaining text...         │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ Input field (invisible, focused)    │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  Progress bar: ████████░░░░░░░░░░░░░░░ │
│  65% complete                            │
│                                          │
├──────────────────────────────────────────┤
│ 1. User1 - 82.1 WPM | 2. User2 - 78 WPM │ (Live leaderboard, top 5)
│ 3. You   - 75.5 WPM | 4. User3 - 68 WPM │
│ 5. User4 - 62.3 WPM │                   │
└──────────────────────────────────────────┘
```

**Key Features**:
- **Word Display**:
  - Current word: Large, white, highlighted box
  - Typed characters: Green (correct) or Red (incorrect)
  - Remaining characters in word: Gray, faded
  - Next 3-4 words: Smaller, gray, for context
  
- **Error Handling (CRITICAL - Non-Blocking Typing)**:
  - User CAN move to next word by pressing SPACE even if current word is incomplete
  - Incomplete word remains marked: `[the qu_]` (red underline)
  - User can go back to fix it (Backspace to previous word) OR continue
  - Accuracy calculation accounts for incomplete words as errors
  - Example flow:
    ```
    Expected: "the"
    User types: "th" + SPACE → word marked incomplete (red), moves to next word
    Expected next: "quick"
    User types: "quick" (correct) + SPACE → continues
    User can press BACKSPACE to go back to "the", fix it, or ignore
    ```

- **Real-Time Stats** (updated every keystroke):
  - WPM: Calculated as (total characters typed / 5) / (time elapsed in minutes)
  - Accuracy: (correct characters / total characters typed) × 100
  - Gross WPM: WPM before accuracy adjustment
  - Progress: Visual bar + percentage

- **Live Leaderboard** (updates every 1-2 seconds):
  - Top 5-10 users by WPM
  - Animated rank changes (slide up/down on position change)
  - Highlight current user's row
  - Color coding: 1st (🥇 gold), 2nd (🥈 silver), 3rd (🥉 bronze), Others (blue)

- **Cursor & Focus**:
  - Large, blinking cursor in current word
  - Auto-focus on page load
  - Click anywhere in typing area to refocus
  - Visual feedback: border glow when focused

**Mobile Optimization**:
- Larger input area for touch
- Keyboard auto-opens on iOS/Android
- Swipe to scroll text (if needed)
- Landscape orientation recommended, auto-adjust if portrait

**Accessibility**:
- Screen reader support for stats
- High contrast mode option
- Keyboard-only navigation (Tab to toggle leaderboard)

### Screen 4: Results / Winner Screen
**Purpose**: Display final results with celebratory UX (Kahoot-inspired)
**Layout** (Progressive Reveal):
```
┌─────────────────────────────────────────┐
│                                         │
│         🎉 TEST COMPLETED! 🎉           │ (Animated confetti)
│                                         │
│         ┌──────────────────────────┐   │
│         │ 🥇 WINNER: Username      │   │
│         │    85.3 WPM | 99.1%      │   │
│         └──────────────────────────┘   │
│                                         │
│  ┌─────────────┬──────────────────┐   │
│  │ YOUR RANK   │                  │   │
│  │  #3         │ 78.5 WPM         │   │
│  │  +2 Spots   │ 96.8% Accuracy   │   │
│  └─────────────┴──────────────────┘   │
│                                         │
│         LEADERBOARD                    │
│  ┌──────────────────────────────────┐ │
│  │ 🥇 1. Winner       85.3 | 99.1%  │ │
│  │ 🥈 2. User2        80.1 | 98.2%  │ │
│  │ 🥉 3. You          78.5 | 96.8%  │ │
│  │    4. User4        75.2 | 95.3%  │ │
│  │    5. User5        72.1 | 94.0%  │ │
│  │    ... (scroll for more)          │ │
│  └──────────────────────────────────┘ │
│                                         │
│  [Retry] [New Test] [Share Score]      │ (CTA buttons)
│                                         │
└─────────────────────────────────────────┘
```

**Animation Sequence**:
1. T+0s: Confetti burst from top, "TEST COMPLETED" appears
2. T+1s: Winner card slides in from top with bounce
3. T+2s: Your rank card appears with "Your Rank" label
4. T+3s: Leaderboard table animates in (rows slide left)
5. T+4s: CTA buttons fade in

**Interactivity**:
- Click "Retry" → Restart same test
- Click "New Test" → Go to home screen
- Click "Share Score" → Social media, QR, link
- Leaderboard sortable by WPM or Accuracy
- Click username → View participant profile

**Mobile**: Stack layout vertically, larger touch targets for buttons

---

## 2.3 DETAILED TYPING MECHANICS (Non-Blocking Flow)

### Algorithm for Word Completion & Movement

```typescript
interface WordState {
  wordIndex: number;
  expectedWord: string;
  typedSoFar: string;
  isCompleted: boolean; // true only if typedSoFar === expectedWord
  isIncomplete: boolean; // true if user moved to next word before completing
}

// User types character
function handleKeyDown(event: KeyboardEvent, currentWordIndex: number) {
  if (event.key === ' ') {
    // SPACE pressed → Move to next word
    event.preventDefault();
    
    const currentWord = testWords[currentWordIndex];
    const typedWord = userInput[currentWordIndex];
    
    // Validate current word
    if (typedWord === currentWord.text) {
      // Correct → mark as completed
      wordStates[currentWordIndex].isCompleted = true;
      wordStates[currentWordIndex].isIncomplete = false;
    } else {
      // Incorrect/incomplete → mark as incomplete
      wordStates[currentWordIndex].isIncomplete = true;
      wordStates[currentWordIndex].isCompleted = false;
    }
    
    // Move cursor to next word
    currentWordIndex++;
    userInput[currentWordIndex] = '';
    updateDisplay();
    
  } else if (event.key === 'Backspace') {
    // BACKSPACE → Go back to previous word (if current is empty)
    if (userInput[currentWordIndex].length === 0 && currentWordIndex > 0) {
      currentWordIndex--;
      userInput[currentWordIndex] = userInput[currentWordIndex].slice(0, -1);
      updateDisplay();
    } else {
      // Delete character from current word
      userInput[currentWordIndex] = userInput[currentWordIndex].slice(0, -1);
    }
    
  } else if (event.key.length === 1) {
    // Regular character typed
    userInput[currentWordIndex] += event.key;
    
    // Highlight character as correct/incorrect
    const typedChar = event.key;
    const expectedChar = currentWord.text[userInput[currentWordIndex].length - 1];
    
    if (typedChar === expectedChar) {
      // Character correct → green highlight
      highlightChar(currentWordIndex, true);
    } else {
      // Character incorrect → red highlight
      highlightChar(currentWordIndex, false);
    }
  }
}

// Display rendering logic
function renderWord(wordIndex: number) {
  const word = testWords[wordIndex];
  const typed = userInput[wordIndex] || '';
  const state = wordStates[wordIndex];
  
  let wordDisplay = '';
  
  // Typed characters (with color)
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] === word.text[i]) {
      wordDisplay += `<span class="correct">${typed[i]}</span>`;
    } else {
      wordDisplay += `<span class="incorrect">${typed[i]}</span>`;
    }
  }
  
  // Remaining characters (gray)
  wordDisplay += `<span class="remaining">${word.text.slice(typed.length)}</span>`;
  
  // Apply styling based on state
  if (wordIndex === currentWordIndex) {
    // Current word → large, highlighted box
    return `<div class="word current" id="word-${wordIndex}">${wordDisplay}</div>`;
  } else if (state.isIncomplete) {
    // Incomplete word → red underline
    return `<div class="word incomplete" id="word-${wordIndex}">${wordDisplay}</div>`;
  } else if (state.isCompleted) {
    // Completed word → muted
    return `<div class="word completed" id="word-${wordIndex}">${wordDisplay}</div>`;
  } else {
    // Not yet started → gray, small
    return `<div class="word upcoming" id="word-${wordIndex}">${wordDisplay}</div>`;
  }
}

// Accuracy calculation
function calculateAccuracy() {
  let correctChars = 0;
  let totalChars = 0;
  
  for (let i = 0; i < testWords.length; i++) {
    const expected = testWords[i].text;
    const typed = userInput[i] || '';
    
    totalChars += expected.length;
    
    for (let j = 0; j < expected.length; j++) {
      if (typed[j] === expected[j]) {
        correctChars++;
      }
    }
    
    // Incomplete words: count missing chars as incorrect
    if (typed.length < expected.length) {
      // Missing characters already not counted in correctChars
    }
    
    // Extra characters: count as incorrect
    if (typed.length > expected.length) {
      // Already not matched, so not in correctChars
    }
  }
  
  return (correctChars / totalChars) * 100;
}
```

### Visual Styling (CSS/Tailwind)

```css
/* Word display container */
.typing-area {
  font-size: 2rem;
  line-height: 1.8;
  color: #e0e0e0;
  background: #1e1e1e;
  padding: 2rem;
  border-radius: 12px;
  font-family: 'Fira Code', monospace;
}

/* Current word being typed */
.word.current {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 4px 12px;
  border-radius: 6px;
  display: inline-block;
  box-shadow: 0 0 20px rgba(102, 126, 234, 0.5);
}

/* Correct character */
.correct {
  color: #10b981; /* Green */
  font-weight: 600;
}

/* Incorrect character */
.incorrect {
  color: #ef4444; /* Red */
  background: rgba(239, 68, 68, 0.2);
  font-weight: 600;
}

/* Remaining characters */
.remaining {
  color: #6b7280; /* Gray */
  opacity: 0.6;
}

/* Incomplete word (user moved to next word before completing) */
.word.incomplete {
  text-decoration: wavy underline #ef4444;
  opacity: 0.7;
}

/* Completed word */
.word.completed {
  color: #9ca3af; /* Muted gray */
  opacity: 0.5;
}

/* Upcoming words */
.word.upcoming {
  color: #6b7280;
  font-size: 1.5rem;
  opacity: 0.4;
}

/* Cursor */
.cursor {
  display: inline-block;
  width: 2px;
  height: 2rem;
  background: #667eea;
  animation: blink 1s infinite;
  margin-left: 2px;
}

@keyframes blink {
  0%, 49%, 100% { opacity: 1; }
  50%, 99% { opacity: 0; }
}

/* Leaderboard live updates */
.leaderboard-row {
  transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
}

.leaderboard-row.highlight {
  background: rgba(102, 126, 234, 0.1);
  box-shadow: inset 0 0 10px rgba(102, 126, 234, 0.2);
}

.rank.moving-up {
  animation: slideUp 0.5s ease-out;
}

.rank.moving-down {
  animation: slideDown 0.5s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0.7; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes slideDown {
  from { transform: translateY(-10px); opacity: 0.7; }
  to { transform: translateY(0); opacity: 1; }
}
```

---

## 2.4 Responsive Design & Mobile Optimization

### Breakpoints
```css
/* Mobile: 320px - 640px */
@media (max-width: 640px) {
  .typing-area { font-size: 1.5rem; padding: 1rem; }
  .word.current { padding: 2px 8px; }
  .leaderboard { display: none; } /* Hide on small screens, show in modal */
  .stats-bar { flex-direction: column; font-size: 0.9rem; }
}

/* Tablet: 641px - 1024px */
@media (max-width: 1024px) {
  .typing-area { font-size: 1.75rem; }
  .leaderboard { max-width: 400px; }
}

/* Desktop: 1025px+ */
@media (min-width: 1025px) {
  .typing-area { font-size: 2rem; }
  .leaderboard { width: 100%; max-width: 600px; }
}
```

### Touch Optimization (Mobile)
- Increase hit targets to 48px minimum
- Use `touch-action: manipulation` to prevent double-tap zoom
- Disable text selection on typing area
- Show virtual keyboard automatically on focus
- Landscape orientation: auto-rotate detection

---

## 2.5 Performance Optimizations for 700 Users

### Frontend Optimizations
1. **Code Splitting**:
   - Lazy load results screen
   - Lazy load settings/profile pages
   - Main bundle: ~150KB gzipped

2. **Rendering Optimization**:
   - Use React.memo() for leaderboard rows (prevent re-renders)
   - Virtualization for leaderboard (only render visible rows)
   - Debounce keystroke rendering (50ms batch)

3. **Animation Performance**:
   - Use CSS transforms + opacity (GPU-accelerated)
   - Avoid expensive reflows (layout shifts)
   - Use `requestAnimationFrame()` for smooth updates

4. **Memory Management**:
   - Unsubscribe from WebSocket events on unmount
   - Clean up intervals/timeouts
   - Use WeakMaps for tracking users (auto-garbage collection)

5. **Bundle Optimization**:
   - Tree-shake unused code
   - Minify + compress all assets
   - Preload critical fonts
   - Lazy load images (avatars, test previews)

---

# PHASE 3: CUSTOM TEST CREATION, LOBBIES & SHARING

## 3.1 Custom Test Creation Flow

### Screen: Test Creator
**Purpose**: Allow users to create custom typing tests
**Layout**:
```
┌──────────────────────────────────────┐
│ CREATE NEW TEST                      │
├──────────────────────────────────────┤
│ Test Title:                          │
│ [_________________ (placeholder: "My Awesome Test")]
│                                      │
│ Description:                         │
│ [_________________ (multiline textarea)]
│ "A brief description of the test"   │
│                                      │
│ Test Content (Paste your text):      │
│ ┌──────────────────────────────────┐ │
│ │ Lorem ipsum dolor sit amet...    │ │
│ │ Consectetur adipiscing elit...   │ │
│ │ (word count: 245 words)          │ │
│ └──────────────────────────────────┘ │
│ [Import from URL] [Upload File]     │
│                                      │
│ Test Duration:                       │
│ [60 seconds ▼] (dropdown: 30/60/120)│
│                                      │
│ Difficulty Level:                    │
│ ( ) Easy  (o) Medium  ( ) Hard      │
│                                      │
│ Max Participants:                    │
│ [700 ▼] (dropdown: 1/10/50/100/700) │
│                                      │
│ Visibility:                          │
│ (o) Public  ( ) Private              │
│                                      │
│ [Create Test] [Cancel]               │
└──────────────────────────────────────┘
```

**Features**:
- Real-time word count display
- Character limit: 5,000 characters (~1000 words)
- Paste detection: Auto-detect and clean text (remove extra spaces/newlines)
- URL import: Fetch text from article (via API)
- File upload: .txt, .pdf, .docx
- Difficulty auto-calculation based on word complexity
- Validation: Show errors for invalid inputs

### Validation Rules
```typescript
interface TestCreationErrors {
  title?: string; // Required, 3-100 chars
  content?: string; // Required, 10-5000 chars
  duration?: string; // Required, 30-300 seconds
  maxParticipants?: string; // 1-700
}

function validateTest(data: TestCreationData): TestCreationErrors {
  const errors = {};
  
  if (!data.title || data.title.length < 3) {
    errors.title = 'Title must be 3+ characters';
  }
  if (!data.content || data.content.split(' ').length < 10) {
    errors.content = 'Test must have at least 10 words';
  }
  if (data.content.split(' ').length > 1000) {
    errors.content = 'Test cannot exceed 1000 words';
  }
  if (data.duration < 30 || data.duration > 300) {
    errors.duration = 'Duration must be 30-300 seconds';
  }
  if (data.maxParticipants < 1 || data.maxParticipants > 700) {
    errors.maxParticipants = 'Participants must be 1-700';
  }
  
  return errors;
}
```

---

## 3.2 Lobby Management & Session Codes

### Session Code Format
- **Length**: 6 characters (alphanumeric, uppercase)
- **Format**: `ABC123` (easily remembered, shared via QR)
- **Generation**: Random, checked against Redis to prevent collisions
- **TTL**: Session code active for 24 hours (test + cleanup)

```typescript
function generateSessionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Check for collision
async function ensureUniqueCode(): Promise<string> {
  let code = generateSessionCode();
  while (await redis.exists(`session:${code}`)) {
    code = generateSessionCode();
  }
  return code;
}
```

### Lobby Lifecycle
```
1. Host creates test → Session created, waiting in lobby
2. Session code generated → QR code + share link created
3. Participants join via code/QR → Participant added to lobby
4. Host starts test → Test begins, session status = "in_progress"
5. Participants complete test → Results recorded
6. Last participant completes → Session status = "completed"
7. Results page shown → Leaderboard displayed
8. 5 minutes after end → Session archived to database, Redis cleaned
```

### Lobby State Management (Redis)
```
test_session:{sessionId}:lobby = {
  "sessionCode": "ABC123",
  "hostId": 12345,
  "testId": 789,
  "status": "lobby",
  "createdAt": timestamp,
  "participants": {
    "userId_1": { "username": "Alice", "avatar": "...", "ready": true },
    "userId_2": { "username": "Bob", "avatar": "...", "ready": false }
  },
  "maxParticipants": 700,
  "currentParticipants": 2
}
```

---

## 3.3 Sharing Features

### QR Code Generation
- **Library**: `qrcode.js` for client-side generation (fast, no server load)
- **Content**: Session join URL: `https://typing-test.com/join/ABC123`
- **Size**: 256x256px, PNG format
- **Display**: In lobby screen, results screen, downloadable

```typescript
import QRCode from 'qrcode';

async function generateQRCode(sessionCode: string): Promise<string> {
  const joinUrl = `${process.env.REACT_APP_BASE_URL}/join/${sessionCode}`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl, {
    width: 256,
    margin: 1,
    color: { dark: '#1e1e1e', light: '#ffffff' }
  });
  return qrDataUrl;
}
```

### Share Link Features
```typescript
interface ShareOptions {
  method: 'copy' | 'qr' | 'social' | 'email';
  sessionCode?: string;
  resultsUrl?: string;
}

async function handleShare(option: ShareOptions) {
  if (option.method === 'copy') {
    // Copy join link to clipboard
    const joinLink = `${process.env.REACT_APP_BASE_URL}/join/${sessionCode}`;
    await navigator.clipboard.writeText(joinLink);
    showToast('Link copied!');
    
  } else if (option.method === 'qr') {
    // Download QR code as image
    const qrCanvas = document.getElementById('qr-code');
    const link = document.createElement('a');
    link.href = qrCanvas.toDataURL();
    link.download = `test-${sessionCode}.png`;
    link.click();
    
  } else if (option.method === 'social') {
    // Share score to Twitter/Facebook
    const shareText = `Just scored ${wpm} WPM on a typing test! Can you beat my score?`;
    const shareUrl = `${process.env.REACT_APP_BASE_URL}/results/${sessionId}`;
    
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${shareUrl}`,
      '_blank'
    );
    
  } else if (option.method === 'email') {
    // Email results link
    const resultsLink = `${process.env.REACT_APP_BASE_URL}/results/${sessionId}`;
    // Trigger email service (backend)
    await api.sendEmail({
      to: userEmail,
      subject: 'Check out my typing test results!',
      body: `I just finished a typing test with ${participantCount} others. Click here to see the results: ${resultsLink}`
    });
  }
}
```

### Join Lobby Flow (Via Link/QR)
```
1. User scans QR or clicks link → Redirected to /join/ABC123
2. If not logged in → Show login/signup modal
3. If logged in → Check session validity (exists, not full, in_progress=false)
4. If valid → Auto-join lobby, show participant list
5. If invalid → Show error "Session not found" or "Lobby is full"
6. User ready → Click "Ready" button, wait for host to start
7. Host starts → Test begins for all ready participants
```

---

## 3.4 User Profile & Test History

### User Profile Screen
**Elements**:
- Avatar + username + bio
- Stats: Total tests, avg WPM, avg accuracy, best WPM, longest streak
- Recent tests: 5 most recent test results
- Achievement badges (50 tests, 85+ avg WPM, 98+ accuracy)

### Test History Screen
**Table**:
| Test | Date | Duration | WPM | Accuracy | Rank | Participants |
|------|------|----------|-----|----------|------|--------------|
| My Test | Sep 25 | 60s | 85.2 | 99.1% | 1st | 42/700 |
| Kahoot Test | Sep 24 | 120s | 72.5 | 96.3% | 5th | 28/50 |

**Filters**: By date, test type, WPM range
**Export**: Download results as CSV

---

## 3.5 Real-Time Leaderboard Updates

### Leaderboard Algorithm (Updated every 1-2 seconds)
```typescript
interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  wpm: number;
  accuracy: number;
  status: 'in_progress' | 'completed';
  timeLeft?: number;
}

// Recalculate leaderboard every second
setInterval(async () => {
  const sessionId = getCurrentSessionId();
  const participants = await redis.hgetall(`progress:${sessionId}`);
  
  // Sort by WPM (descending)
  const leaderboard = Object.entries(participants)
    .map(([userId, data]) => ({
      userId,
      ...JSON.parse(data),
      rank: 0 // Will be assigned after sorting
    }))
    .sort((a, b) => b.wpm - a.wpm)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  
  // Broadcast to all participants
  io.to(`session:${sessionId}`).emit('leaderboard_update', {
    leaderboard,
    timestamp: Date.now()
  });
  
  // Store in Redis for quick access
  await redis.setex(
    `leaderboard:${sessionId}`,
    2, // 2 second TTL
    JSON.stringify(leaderboard)
  );
  
}, 1000); // Update every 1 second
```

### Rank Change Animation
```typescript
// Track previous rank
let previousRanks: Map<string, number> = new Map();

function handleLeaderboardUpdate(newLeaderboard: LeaderboardEntry[]) {
  newLeaderboard.forEach((entry) => {
    const prevRank = previousRanks.get(entry.userId) || entry.rank;
    
    if (prevRank > entry.rank) {
      // Moved up → green highlight + slide up animation
      triggerAnimation(entry.userId, 'move-up');
    } else if (prevRank < entry.rank) {
      // Moved down → gray highlight + slide down animation
      triggerAnimation(entry.userId, 'move-down');
    }
    
    previousRanks.set(entry.userId, entry.rank);
  });
  
  // Update UI
  updateLeaderboardUI(newLeaderboard);
}
```

---

## 3.6 Winner & Completion Logic

### Test Completion Detection
```typescript
// Client-side: User presses Enter or reaches end of text
async function completeTest() {
  const completionTime = Date.now() - testStartTime;
  
  // Calculate final stats
  const finalWPM = calculateWPM(totalChars, completionTime);
  const finalAccuracy = calculateAccuracy();
  
  // Send completion event
  socket.emit('test_finished', {
    sessionId,
    userId,
    wpm: finalWPM,
    accuracy: finalAccuracy,
    completionTime
  });
  
  // Disable further typing
  setTestCompleted(true);
}

// Server-side: Process completion
socket.on('test_finished', async (data) => {
  const { sessionId, userId, wpm, accuracy, completionTime } = data;
  
  // Save to database
  await db.testResults.insert({
    sessionId,
    userId,
    wpm: parseFloat(wpm.toFixed(2)),
    accuracy: parseFloat(accuracy.toFixed(2)),
    completionTime
  });
  
  // Update Redis progress
  await redis.hset(
    `progress:${sessionId}:${userId}`,
    'is_complete',
    'true',
    'completion_time',
    completionTime
  );
  
  // Broadcast to all participants
  io.to(`session:${sessionId}`).emit('user_completed', {
    userId,
    username: userData.username,
    wpm: wpm.toFixed(2),
    accuracy: accuracy.toFixed(2),
    completionTime
  });
  
  // Check if all participants completed
  const allCompleted = await checkAllCompleted(sessionId);
  if (allCompleted) {
    // Trigger final results screen
    io.to(`session:${sessionId}`).emit('test_ended', {
      finalLeaderboard: await getFinalLeaderboard(sessionId),
      winnerId: getWinner(sessionId)
    });
  }
});
```

### Winner Determination
```typescript
async function determineWinner(sessionId: string) {
  // Get all results for session
  const results = await db.testResults
    .find({ sessionId })
    .sort({ wpm: -1 })
    .limit(1);
  
  if (results.length === 0) return null;
  
  const winner = results[0];
  
  // Award points to winner
  await db.users.update(
    { id: winner.userId },
    { $inc: { totalWins: 1, totalPoints: 10 } }
  );
  
  return {
    rank: 1,
    userId: winner.userId,
    username: winner.username,
    wpm: winner.wpm,
    accuracy: winner.accuracy,
    badge: '🥇 Champion'
  };
}
```

### Results Screen Animation Sequence
```typescript
export function ResultsScreen({ sessionId, userId }) {
  const [animationPhase, setAnimationPhase] = useState(0);
  const [winner, setWinner] = useState(null);
  const [yourRank, setYourRank] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  
  useEffect(() => {
    // Phase 0: Confetti
    setAnimationPhase(0);
    setTimeout(() => {
      // Phase 1: Show winner (T+1s)
      setAnimationPhase(1);
      setWinner(getWinner());
    }, 1000);
    
    setTimeout(() => {
      // Phase 2: Show your rank (T+2s)
      setAnimationPhase(2);
      setYourRank(findYourRank());
    }, 2000);
    
    setTimeout(() => {
      // Phase 3: Show leaderboard (T+3s)
      setAnimationPhase(3);
      setLeaderboard(getFinalLeaderboard());
    }, 3000);
    
  }, []);
  
  return (
    <div className="results-container">
      {/* Confetti animation */}
      {animationPhase >= 0 && <Confetti />}
      
      {/* Test completed heading */}
      <motion.h1
        initial={{ opacity: 0, y: -50 }}
        animate={animationPhase >= 0 ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        🎉 Test Completed! 🎉
      </motion.h1>
      
      {/* Winner card */}
      {animationPhase >= 1 && winner && (
        <motion.div
          className="winner-card"
          initial={{ opacity: 0, y: -100, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 100, damping: 15 }}
        >
          <div className="rank-badge">🥇</div>
          <h2>WINNER: {winner.username}</h2>
          <p>{winner.wpm} WPM | {winner.accuracy}%</p>
        </motion.div>
      )}
      
      {/* Your rank card */}
      {animationPhase >= 2 && yourRank && (
        <motion.div
          className="your-rank-card"
          initial={{ opacity: 0, x: -200 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h3>YOUR RANK</h3>
          <p className="rank">#{yourRank.rank}</p>
          <p className="wpm">{yourRank.wpm} WPM</p>
          <p className="accuracy">{yourRank.accuracy}% Accuracy</p>
        </motion.div>
      )}
      
      {/* Leaderboard table */}
      {animationPhase >= 3 && (
        <motion.div
          className="leaderboard-container"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <h3>Final Leaderboard</h3>
          <table>
            <tbody>
              {leaderboard.map((entry, idx) => (
                <motion.tr
                  key={entry.userId}
                  initial={{ x: -100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  className={entry.userId === userId ? 'highlight' : ''}
                >
                  <td className="rank">{entry.rank}</td>
                  <td className="username">{entry.username}</td>
                  <td className="wpm">{entry.wpm}</td>
                  <td className="accuracy">{entry.accuracy}%</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
      
      {/* CTA buttons */}
      {animationPhase >= 3 && (
        <div className="button-group">
          <button onClick={retryTest}>Retry Test</button>
          <button onClick={goHome}>New Test</button>
          <button onClick={shareScore}>Share Score</button>
        </div>
      )}
    </div>
  );
}
```

---

## 3.7 Sound & Notifications

### Sound Effects
- **Keystroke**: Subtle "tick" sound (50ms, optional toggle)
- **Word completion**: "ding" sound for correct word
- **Test start**: 3-2-1 countdown beeps
- **Test end**: Celebratory "tada" sound
- **User joins lobby**: Soft notification sound
- **Rank change**: Ascending/descending tone

**Implementation**: Preload using Web Audio API, play on events

```typescript
const sounds = {
  keystroke: new Audio('/sounds/tick.mp3'),
  correct: new Audio('/sounds/ding.mp3'),
  testStart: new Audio('/sounds/beep.mp3'),
  testEnd: new Audio('/sounds/tada.mp3')
};

function playSound(name: string) {
  if (userSettings.soundEnabled) {
    sounds[name].currentTime = 0;
    sounds[name].play();
  }
}
```

### Notifications
- **Toast notifications**: Top-right corner (non-blocking)
- **Connection status**: "Reconnecting..." spinner
- **Achievement unlocked**: Modal with badge animation
- **Test reminders**: Push notification (if enrolled)

---

# DETAILED IMPLEMENTATION CHECKLIST

## Phase 1: Backend & Infrastructure
- [ ] Set up Node.js + Express server
- [ ] Configure Socket.IO with Redis adapter
- [ ] Design PostgreSQL schema (tables, indices)
- [ ] Set up Redis instances (session cache, leaderboard, pub/sub)
- [ ] Implement connection pooling (PgBouncer, Socket.IO)
- [ ] Create session management system
- [ ] Build keystroke event processing pipeline (batching, validation)
- [ ] Implement leaderboard calculation engine (Redis sorted sets)
- [ ] Build winner determination algorithm
- [ ] Set up automated session cleanup (archive old sessions)
- [ ] Configure load balancing (Nginx/ALB)
- [ ] Implement error handling & logging (ELK Stack)
- [ ] Set up monitoring (Prometheus, Grafana)
- [ ] Run load testing (K6: 700 concurrent users)
- [ ] Configure CI/CD pipeline (Docker, Kubernetes/ECS)
- [ ] Deploy to production (staged rollout)

## Phase 2: Frontend & UI/UX
- [ ] Set up React + Vite project
- [ ] Build base layout components (header, footer, sidebar)
- [ ] Implement home screen (test browser, search, filters)
- [ ] Build lobby screen (participant list, QR code, countdown)
- [ ] Implement typing test interface (text display, cursor, error handling)
- [ ] Build real-time stats display (WPM, accuracy, progress)
- [ ] Implement live leaderboard (sorted table, animations)
- [ ] Build results/winner screen (celebratory UI, confetti)
- [ ] Optimize rendering (React.memo, virtualization)
- [ ] Test responsive design (mobile, tablet, desktop)
- [ ] Implement accessibility (ARIA labels, keyboard navigation)
- [ ] Set up performance monitoring (Lighthouse, Web Vitals)
- [ ] Optimize bundle size (code splitting, tree shaking)
- [ ] Test on various devices & browsers

## Phase 3: Features & Polish
- [ ] Build custom test creation form
- [ ] Implement test validation & sanitization
- [ ] Build session code generation system
- [ ] Implement QR code generation
- [ ] Build share functionality (link, social, email)
- [ ] Implement user profiles & test history
- [ ] Build custom test browsing (search, filters, sorting)
- [ ] Implement lobby join via code/QR
- [ ] Build achievement/badge system
- [ ] Add sound effects & notifications
- [ ] Implement user settings (theme, sound, accessibility)
- [ ] Build admin dashboard (monitor sessions, user stats)
- [ ] Add analytics tracking (Google Analytics, Mixpanel)
- [ ] Test end-to-end flows
- [ ] Security testing (SQL injection, XSS, CSRF)
- [ ] Penetration testing & vulnerability assessment
- [ ] Beta testing with 100+ users
- [ ] Gather feedback & iterate

---

# PERFORMANCE TARGETS & SLAs

| Metric | Target | Monitoring |
|--------|--------|------------|
| Concurrent Users | 700 | WebSocket connection count |
| Message Latency | <100ms | Socket.IO ping |
| Leaderboard Update Frequency | 1-2s | Redis operations/sec |
| Test Start Latency | <500ms | Time from "Start" button to first keystroke |
| Database Query P95 | <50ms | PostgreSQL slow query log |
| Error Rate | <0.1% | Application logging |
| Availability | 99.9% | Uptime monitoring |
| CPU Usage @ 700 users | 60-75% | Prometheus metrics |
| Memory Usage @ 700 users | 8-12GB | Docker stats |
| Bandwidth per user | ~50KB/min | Network traffic analysis |

---

# SECURITY CONSIDERATIONS

1. **Authentication**: JWT tokens, refresh tokens, secure httpOnly cookies
2. **Authorization**: Role-based access control (user, admin)
3. **Input Validation**: Sanitize all user inputs, prevent SQL injection
4. **XSS Protection**: Content Security Policy headers, escape output
5. **CSRF Protection**: SameSite cookies, CSRF tokens
6. **Rate Limiting**: Prevent brute force (login, API endpoints)
7. **Data Encryption**: SSL/TLS for transport, password hashing (bcrypt)
8. **Session Management**: Secure session handling, timeout after inactivity
9. **Logging**: Audit trails for all user actions, sensitive operations
10. **Dependency Scanning**: Regular vulnerability checks (npm audit, Snyk)

---

# DEPLOYMENT CHECKLIST

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Redis instances initialized
- [ ] SSL certificates installed
- [ ] CDN configured & cache invalidated
- [ ] Logging & monitoring set up
- [ ] Alerts configured (high CPU, high memory, errors)
- [ ] Backup strategy in place (daily DB backups)
- [ ] Disaster recovery plan documented
- [ ] Load testing completed (700 concurrent)
- [ ] Smoke tests passed
- [ ] Documentation updated
- [ ] Team trained on deployment process
- [ ] Rollback plan documented

---

# POST-LAUNCH SUPPORT

1. **First 48 hours**: Monitor closely, respond to issues immediately
2. **First week**: Gather user feedback, identify bugs
3. **Ongoing**: Weekly performance reviews, monthly optimization passes
4. **Features**: Roadmap for v2 (teams, private tests, advanced analytics)

---

# REFERENCES & INSPIRATION

- **Typer.io**: Smooth typing mechanics, real-time WPM calculation, error handling
- **Kahoot.com**: Celebratory leaderboard, animated rank changes, participant engagement
- **Typeracer**: Multiplayer racing mechanics (future enhancement)
- **Socket.IO**: Real-time communication at scale
- **React**: Component-based UI, performance optimizations
- **Redis**: High-speed data structures, pub/sub messaging

---

**Document Version**: 1.0  
**Last Updated**: September 2026  
**Author**: Industry Prompt Engineer  
**Status**: Ready for Development
