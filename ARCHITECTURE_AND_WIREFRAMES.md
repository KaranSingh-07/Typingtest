# SYSTEM ARCHITECTURE & VISUAL WIREFRAMES

## SYSTEM ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER (React Frontend)                   │
├─────────────────────────────────────────────────────────────────────────┤
│  Home Screen  │ Lobby  │ Typing Test  │ Leaderboard  │ Results Screen   │
│  Test Creator │ Profile │ Settings     │ Test History │ Share            │
└────────────────────────┬──────────────────────────────┬──────────────────┘
                         │                              │
                    Socket.IO                      REST API (Auth,
                  (Real-time Events)               User Data)
                         │                              │
         ┌───────────────┴──────────────┬──────────────┴────────────┐
         │                              │                           │
┌────────▼────────────────────┐   ┌────▼────────────────┐   ┌──────▼──────┐
│   Load Balancer (Nginx)      │   │   API Gateway       │   │  CDN        │
│   - SSL/TLS                  │   │   - JWT Auth        │   │  (Static)   │
│   - Sticky Sessions (IP)     │   │   - Rate Limiting   │   │  Assets     │
│   - Connection Pooling       │   │   - Request/Response│   │  (JS/CSS)   │
└────────┬────────────────────┘   └────┬────────────────┘   └────────────┘
         │                             │
    ┌────┴───────────────────────┬────┴──────────┐
    │                            │               │
┌───▼──────────────┐    ┌───────▼────────────┐  │
│  App Server 1    │    │  App Server 2      │  │
│  (Node.js +      │    │  (Node.js +        │  │
│   Express)       │    │   Express)         │  │
│  Max: 350 users  │    │  Max: 350 users    │  │
│                  │    │                    │  │
│  ┌────────────┐  │    │  ┌────────────┐    │  │
│  │ Socket.IO  │  │    │  │ Socket.IO  │    │  │
│  │ Server     │  │    │  │ Server     │    │  │
│  └────┬───────┘  │    │  └────┬───────┘    │  │
│       │          │    │       │            │  │
└───┬───┘──────────┘    └───┬───┘────────────┘  │
    │                       │                   │
    │ ┌──────────────────────┴────────────┐    │
    │ │                                   │    │
    ▼ ▼                                   ▼    ▼
┌──────────────────────────────────────────────────┐
│          Redis Cluster (In-Memory Store)         │
├──────────────────────────────────────────────────┤
│  - Session State & Leaderboard Cache             │
│  - Pub/Sub for Cross-Server Messaging            │
│  - Real-time User Progress Tracking              │
│  - Connection pooling: min 20, max 100 conn/inst │
│  Instance 1: Master (8GB)                        │
│  Instance 2: Replica (8GB)                       │
└──────────┬───────────────────────────────────────┘
           │
       Persists
           │
┌──────────▼───────────────────────────────────────┐
│     PostgreSQL (Persistent Data Storage)         │
├──────────────────────────────────────────────────┤
│  Primary (Write)                                 │
│  │                                               │
│  ├─ Replica 1 (Read)                             │
│  └─ Replica 2 (Read)                             │
│                                                  │
│  Tables:                                         │
│  - users, tests, test_sessions                   │
│  - test_results, keystroke_logs                  │
│                                                  │
│  Connection Pool: PgBouncer                      │
│  - Min: 20, Max: 100 connections                 │
└──────────────────────────────────────────────────┘
```

---

## SOCKET.IO EVENT FLOW DIAGRAM

```
CLIENT                          SOCKET.IO                        SERVER
                                
[User Joins Lobby]
  │
  └─→ emit('join_lobby') ────────────────────────────────→ Validate session code
                                                           Add to participants
                                                           Update Redis
                                                               │
                                                    broadcast('participant_joined')
                         ←─────────────────────────────────────┘
                                                               
[User Types Character]                                         
  │                                                            
  └─→ emit('keystroke_batch')                                 
      [50ms batched] ────────────────────────────────→ Validate keystroke
                                                       Calculate WPM/accuracy
                                                       Update Redis progress
                                                       Sort leaderboard
                                                               │
                                                    broadcast('leaderboard_update')
                         ←─────────────────────────────────────┘
                                                       broadcast('user_completed')
                         ←─────────────────────────────────────┘ [if test done]
                                                               
[All Users Finish]                                             
  │                                                            
  └─→ All emit('test_finished') ──────────────────→ Archive session to DB
                                                       Generate final leaderboard
                                                       Award achievements
                                                               │
                                                    broadcast('test_ended')
                         ←─────────────────────────────────────┘
                                                       
                                                    [After 5 min]
                                                    Clean Redis → Archive to DB
                                                    Close WebSocket
```

---

## DATA FLOW DIAGRAM (Real-time Typing)

```
┌──────────────────────────────────────────────────────┐
│ User Presses Key (e.g., "a")                         │
└────────────┬─────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────┐
│ Client-side: Capture Keystroke Event                │
│ - Check if correct/incorrect                         │
│ - Update display immediately (optimistic)            │
│ - Add to batch queue                                 │
│ - Render character (green or red)                    │
└────────────┬─────────────────────────────────────────┘
             │
             ▼
     [Wait 50ms for batching]
             │
             ▼
┌──────────────────────────────────────────────────────┐
│ Emit keystroke_batch Event                          │
│ Payload:                                             │
│ {                                                    │
│   sessionId: "abc123",                               │
│   userId: 456,                                       │
│   batch: [                                           │
│     { wordIdx: 5, charIdx: 2, char: 'a', ts: 123 }  │
│     { wordIdx: 5, charIdx: 3, char: 'b', ts: 145 }  │
│   ]                                                  │
│ }                                                    │
└────────────┬─────────────────────────────────────────┘
             │
      [Socket.IO Message]
             │
             ▼
┌──────────────────────────────────────────────────────┐
│ Server: Receive & Process Keystroke Batch            │
│ - Validate session & user                            │
│ - Validate keystrokes (replay attack check)          │
│ - Update Redis progress:                             │
│   progress:{sessionId}:{userId}                      │
│   - correct_chars ++                                 │
│   - total_chars ++                                   │
│   - recalculate WPM/accuracy                         │
└────────────┬─────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────┐
│ Update Leaderboard in Redis                          │
│ ZADD leaderboard:{sessionId} {wpm} {userId}          │
│                                                      │
│ Retrieve top 20 users by WPM                         │
└────────────┬─────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────┐
│ Broadcast leaderboard_update to All Participants     │
│ Event: 'leaderboard_update'                          │
│ Payload:                                             │
│ {                                                    │
│   timestamp: 1234567890,                             │
│   leaderboard: [                                     │
│     { rank: 1, userId: 123, wpm: 85.5, acc: 98.2 }  │
│     { rank: 2, userId: 456, wpm: 82.1, acc: 97.8 }  │
│   ]                                                  │
│ }                                                    │
└────────────┬─────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────┐
│ Client: Update Leaderboard UI                        │
│ - Compare previous ranks with new ranks              │
│ - Animate rows that changed position                 │
│ - Re-render table with smooth transitions            │
│ - Highlight current user's row                       │
└──────────────────────────────────────────────────────┘

Timeline:
└─ T+0ms: User presses key
└─ T+0-50ms: Collect keystrokes
└─ T+50ms: Send batch to server
└─ T+100ms: Server processes, updates Redis
└─ T+150ms: Broadcast to all clients
└─ T+200ms: UI updated, leaderboard rerendered
```

---

## DATABASE SCHEMA DIAGRAM

```
┌─────────────────────────────────────────────────────┐
│                     users                           │
├─────────────────────────────────────────────────────┤
│ id (PK) ────────────┐                               │
│ username (UNIQUE)   │                               │
│ email (UNIQUE)      │                               │
│ password_hash       │                               │
│ avatar_url          │                               │
│ total_tests         │                               │
│ avg_wpm             │                               │
│ avg_accuracy        │                               │
│ created_at          │                               │
└──────────────────────┼──────────────────────────────┘
                       │
    ┌──────────────────┼──────────────────────────────┐
    │                  │                              │
    │                  ▼                              │
    │        ┌──────────────────────────────────────┐ │
    │        │         test_sessions               │ │
    │        ├──────────────────────────────────────┤ │
    │        │ id (PK, UUID)                        │ │
    │        │ test_id (FK) ──────┐                 │ │
    │        │ creator_id (FK) ────┼─────────────┐  │ │
    │        │ session_code (UNIQUE)              │  │ │
    │        │ max_participants                   │  │ │
    │        │ current_participants               │  │ │
    │        │ status                             │  │ │
    │        │ started_at, ended_at               │  │ │
    │        │ qr_code_url, share_link            │  │ │
    │        └──────────┬───────────────────────────┘ │
    │                   │                              │
    │                   ▼                              │
    │        ┌──────────────────────────────────────┐ │
    │        │      test_results                   │ │
    │        ├──────────────────────────────────────┤ │
    │        │ id (PK)                             │ │
    │        │ session_id (FK)                     │ │
    │        │ user_id (FK) ◄──────────────────────┼─┘
    │        │ wpm                                 │
    │        │ accuracy                            │
    │        │ position_in_leaderboard             │
    │        │ completed_at                        │
    │        │ UNIQUE(session_id, user_id)         │
    │        └──────────────────────────────────────┘
    │
    │
    │        ┌──────────────────────────────────────┐
    │        │         tests                       │
    │        ├──────────────────────────────────────┤
    │        │ id (PK) ◄────────────────────────────┼─ Test metadata
    │        │ creator_id (FK)                     │
    │        │ title                               │
    │        │ description                         │
    │        │ text_content                        │
    │        │ total_words                         │
    │        │ duration_seconds                    │
    │        │ difficulty_level                    │
    │        │ is_public                           │
    │        │ test_type                           │
    │        └──────────────────────────────────────┘
    │
    │
    │        ┌──────────────────────────────────────┐
    │        │     keystroke_logs (Analytics)      │
    │        ├──────────────────────────────────────┤
    │        │ id (PK, BIGSERIAL)                  │
    │        │ session_id (FK)                     │
    │        │ user_id (FK)                        │
    │        │ word_index                          │
    │        │ character_index                     │
    │        │ typed_char                          │
    │        │ expected_char                       │
    │        │ is_correct (BOOLEAN)                │
    │        │ timestamp_ms                        │
    │        └──────────────────────────────────────┘
    │
    └──────────────────────────────────────────────────┘

Indexes:
- users(username, email) - for auth
- test_sessions(status, created_at) - for active sessions
- test_results(session_id, user_id, wpm DESC) - for leaderboard
- keystroke_logs(session_id, user_id, timestamp_ms) - for analytics
```

---

## WIREFRAME: HOME SCREEN

```
╔════════════════════════════════════════════════════════════════════╗
║  📝 TypingTest.io                    [🔍 Search] [👤 Profile] [⚙️ ]║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │ 🎯 Create Test   🔗 Join Lobby   📊 Browse Tests          │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                    ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │ TRENDING TESTS                                             │  ║
║  │                                                            │  ║
║  │ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │  ║
║  │ │              │  │              │  │              │      │  ║
║  │ │ Classic Lit  │  │ Tech Jargon  │  │ Random Vibes │      │  ║
║  │ │              │  │              │  │              │      │  ║
║  │ │ 👤 1.2M      │  │ 👤 856K      │  │ 👤 234K      │      │  ║
║  │ │ ⚡ 72 WPM    │  │ ⚡ 68 WPM    │  │ ⚡ 65 WPM    │      │  ║
║  │ │ 📈 2min      │  │ 📈 3min      │  │ 📈 2min      │      │  ║
║  │ │ [Join Lobby] │  │ [Join Lobby] │  │ [Join Lobby] │      │  ║
║  │ └──────────────┘  └──────────────┘  └──────────────┘      │  ║
║  │                                                            │  ║
║  │ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │  ║
║  │ │ Shakespeare  │  │ Sci-Fi Tales │  │ News Digest  │      │  ║
║  │ │              │  │              │  │              │      │  ║
║  │ │ 👤 645K      │  │ 👤 512K      │  │ 👤 128K      │      │  ║
║  │ │ ⚡ 75 WPM    │  │ ⚡ 71 WPM    │  │ ⚡ 58 WPM    │      │  ║
║  │ │ 📈 4min      │  │ 📈 3min      │  │ 📈 2min      │      │  ║
║  │ │ [Join Lobby] │  │ [Join Lobby] │  │ [Join Lobby] │      │  ║
║  │ └──────────────┘  └──────────────┘  └──────────────┘      │  ║
║  │                                                            │  ║
║  │ Load More ▼                                                │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## WIREFRAME: LOBBY SCREEN

```
╔════════════════════════════════════════════════════════════════════╗
║  📝 TypingTest.io > Join Lobby: ABC123                [👤 42/700]  ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  ┌─────────────────────────┐  ┌────────────────────────────────┐  ║
║  │ TEST PREVIEW            │  │ PARTICIPANTS (Live)            │  ║
║  ├─────────────────────────┤  ├────────────────────────────────┤  ║
║  │                         │  │  ┌─────────┐  ┌─────────┐      │  ║
║  │ Classic Literature      │  │  │ [👤]    │  │ [👤]    │      │  ║
║  │                         │  │  │ Alice   │  │ Bob     │      │  ║
║  │ "In the heart of the... │  │  │ ⚡ Ready│  │ 📍 Idle │      │  ║
║  │ ...digital age..."      │  │  └─────────┘  └─────────┘      │  ║
║  │                         │  │                                │  ║
║  │ ⏱️  Duration: 60s        │  │  ┌─────────┐  ┌─────────┐      │  ║
║  │ 📊 Difficulty: Medium   │  │  │ [👤]    │  │ [👤]    │      │  ║
║  │ 👥 Participants: 42/700 │  │  │ Charlie │  │ Diana   │      │  ║
║  │ 📈 Avg WPM: 75          │  │  │ ⚡ Ready│  │ ⚡ Ready│      │  ║
║  │                         │  │  └─────────┘  └─────────┘      │  ║
║  │ ┌─────────────────────┐ │  │                                │  ║
║  │ │   [QR Code]         │ │  │  [Scroll to see more users]   │  ║
║  │ │                     │ │  │                                │  ║
║  │ │   ▀▄▄▄▀▄▄▄▀▄▄▄     │ │  │                                │  ║
║  │ │   ▄▀▀▀▄▀▀▀▄▀▀      │ │  │                                │  ║
║  │ │   ▀▄▄▄▀▄▄▄▀        │ │  │                                │  ║
║  │ │                     │ │  │                                │  ║
║  │ │   ABC123            │ │  │                                │  ║
║  │ │                     │ │  │                                │  ║
║  │ │ [📋 Copy Link]      │ │  │                                │  ║
║  │ │ [⬇️ Download QR]    │ │  │                                │  ║
║  │ └─────────────────────┘ │  │                                │  ║
║  └─────────────────────────┘  └────────────────────────────────┘  ║
║                                                                    ║
║  [✓ Ready] [Leave] [Start Test*] (*Host Only)                     ║
║                                                                    ║
║  ⏳ Host starts in: [3s countdown] (when ready)                    ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## WIREFRAME: TYPING TEST SCREEN

```
╔════════════════════════════════════════════════════════════════════╗
║  ⚡ 75.5 WPM  │  📊 98.2% Accuracy  │  ⏱️ 45s / 60s                ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │                                                            │  ║
║  │  In the heart of the digital age,                         │  ║
║  │  connectivity defines our existence. [Cursor]remaining... │  ║
║  │  words float like [...]                                   │  ║
║  │                                                            │  ║
║  │  [Invisible text input field focused here]                │  ║
║  │                                                            │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                    ║
║  Progress: ████████░░░░░░░░░░░░░░░░░░░░░░  65% complete          ║
║                                                                    ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │ LIVE LEADERBOARD          │                                │  ║
║  ├───────────────────────────┤                                │  ║
║  │ 1. 🥇 User1 - 82.1 WPM    │                                │  ║
║  │ 2. 🥈 User2 - 78.0 WPM    │  [← Updating in real-time]    │  ║
║  │ 3. 🥉 YOU   - 75.5 WPM    │  [← Highlighted]              │  ║
║  │ 4.    User3 - 68.2 WPM    │                                │  ║
║  │ 5.    User4 - 62.1 WPM    │                                │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝

LEGEND:
█ = Correct word completed
░ = Words remaining
Cursor = Blinking cursor in current word
```

---

## WIREFRAME: RESULTS / WINNER SCREEN

```
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║              🎉  TEST COMPLETED!  🎉  [confetti falling]          ║
║                                                                    ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │                                                            │  ║
║  │            🥇  WINNER: Super_Typer  🥇                    │  ║
║  │                                                            │  ║
║  │                  85.3 WPM │ 99.1% Accuracy               │  ║
║  │                                                            │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                    ║
║  ┌──────────────────────────┬─────────────────────────────────┐  ║
║  │  YOUR RANK               │                                 │  ║
║  ├──────────────────────────┤                                 │  ║
║  │  🏆 #3                   │  78.5 WPM                       │  ║
║  │  📈 +2 spots gained      │  96.8% Accuracy                │  ║
║  │  ⏱️  Finished in: 45s     │  👥 Rank: 3 / 42 participants  │  ║
║  │                          │  ⚡ Personal Best: 82.1 WPM    │  ║
║  └──────────────────────────┴─────────────────────────────────┘  ║
║                                                                    ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │ FINAL LEADERBOARD                                          │  ║
║  ├────────────────────────────────────────────────────────────┤  ║
║  │ 🥇 1. Super_Typer      85.3 WPM │ 99.1% │ ⏱️ 45s         │  ║
║  │ 🥈 2. QuickFinger      80.1 WPM │ 98.2% │ ⏱️ 48s         │  ║
║  │ 🥉 3. YOU              78.5 WPM │ 96.8% │ ⏱️ 49s         │  ║
║  │    4. SpeedDemon       75.2 WPM │ 95.3% │ ⏱️ 50s         │  ║
║  │    5. PrecisionTyler   72.1 WPM │ 94.0% │ ⏱️ 52s         │  ║
║  │    6. KeyMaster        71.5 WPM │ 92.1% │ ⏱️ 53s         │  ║
║  │    ... (scroll to see all 42 participants)                 │  ║
║  │                                                            │  ║
║  │    [Show All ▼]                                            │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                    ║
║  [🔁 Retry Test] [🏠 New Test] [📤 Share Score] [👤 My Profile]  ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## WIREFRAME: TEST CREATOR / CUSTOM TEST

```
╔════════════════════════════════════════════════════════════════════╗
║  CREATE CUSTOM TEST                                       [Cancel] ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  Test Title *                                                      ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │ My Awesome Typing Challenge                               │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                    ║
║  Description                                                       ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │ Test your speed on challenging tech jargon and quotes      │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║                                                                    ║
║  Test Content (Paste or Upload) *                                 ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │ Lorem ipsum dolor sit amet, consectetur adipiscing elit.   │  ║
║  │ Sed do eiusmod tempor incididunt ut labore et dolore...   │  ║
║  │                                                            │  ║
║  │ [Word count: 245 words] [📊 Flesch-Kincaid: 12th grade]  │  ║
║  │                                                            │  ║
║  │                                                            │  ║
║  │                                                            │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║  [⬆️ Upload .txt/.pdf/.docx] [🔗 Import from URL]               ║
║                                                                    ║
║  Duration: [60 ▼]  Difficulty: ( ) Easy (•) Medium ( ) Hard      ║
║                                                                    ║
║  Max Participants: [700 ▼]  Visibility: (•) Public ( ) Private   ║
║                                                                    ║
║  [✓ Create Test] [❌ Cancel]                                      ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## TYPING MECHANICS FLOWCHART

```
┌─────────────────────────────────┐
│ User presses SPACE              │
└────────────┬────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ Current word typed?│
    └────┬───────────────┘
         │
    ┌────┴──────────────────────────┐
    │                               │
    ▼                               ▼
Matches word            Does NOT match
    │                               │
    ▼                               ▼
┌─────────────────┐    ┌──────────────────────┐
│ COMPLETED ✓     │    │ INCOMPLETE (red line)│
│ Mark as done    │    │ Mark as incomplete   │
│ Color: Green    │    │ Color: Red underline │
└────────┬────────┘    └──────────┬───────────┘
         │                        │
         └────────────┬───────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │ Move to NEXT WORD      │
         │ Reset input buffer     │
         │ Update word position   │
         └────────┬───────────────┘
                  │
                  ▼
         ┌────────────────────────┐
         │ Recalculate WPM        │
         │ Recalculate Accuracy   │
         │ Update Leaderboard     │
         │ Broadcast to all       │
         └────────────────────────┘

If User Presses BACKSPACE on Empty Word:
  ├─ Go back to PREVIOUS word
  ├─ Allow editing that word
  └─ Can fix incomplete words OR move forward

Final Accuracy Calculation:
  = (Correct Characters / Total Word Characters) × 100
  - Incomplete words = missing chars = incorrect
  - Extra chars = incorrect
```

---

## PERFORMANCE OPTIMIZATION LAYERS

```
┌─────────────────────────────────────────────────────┐
│ LAYER 1: CLIENT-SIDE OPTIMIZATION                   │
├─────────────────────────────────────────────────────┤
│ • Keystroke batching (50ms)                         │
│ • Optimistic UI updates (render before server ack) │
│ • Debounced leaderboard rendering                  │
│ • Virtual scrolling for leaderboard table           │
│ • React.memo() for leaderboard rows                 │
│ • Code splitting (lazy load screens)                │
│ • Service Worker for offline capability             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ LAYER 2: NETWORK OPTIMIZATION                       │
├─────────────────────────────────────────────────────┤
│ • Gzip compression on all payloads                  │
│ • WebSocket multiplexing (Socket.IO)                │
│ • Message batching (keystroke events)               │
│ • Binary protocol (potential MessagePack)           │
│ • Connection pooling                                │
│ • Heartbeat tuning (25s interval)                   │
│ • Reconnection backoff strategy                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ LAYER 3: SERVER-SIDE OPTIMIZATION                   │
├─────────────────────────────────────────────────────┤
│ • Batch keystroke processing (50ms)                 │
│ • Redis for in-memory leaderboard (O(log n) sorts) │
│ • Connection pooling (PgBouncer)                    │
│ • Sticky sessions (IP-based routing)                │
│ • Horizontal scaling (multiple app servers)         │
│ • Event broadcasting (Redis Pub/Sub)                │
│ • Async processing of keystroke logs                │
│ • Caching layer (Redis for user progress)           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ LAYER 4: DATABASE OPTIMIZATION                      │
├─────────────────────────────────────────────────────┤
│ • Read replicas for scaling reads                   │
│ • Indexing on frequently queried columns            │
│ • Connection pooling (min 20, max 100)              │
│ • Batch inserts for keystroke logs                  │
│ • Partitioning keystroke_logs by date               │
│ • Archive old sessions (> 7 days)                   │
│ • Query optimization (EXPLAIN ANALYZE)              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ LAYER 5: INFRASTRUCTURE OPTIMIZATION                │
├─────────────────────────────────────────────────────┤
│ • Load balancing (Nginx round-robin)                │
│ • Auto-scaling (CPU & memory triggers)              │
│ • CDN for static assets (JS, CSS, fonts)            │
│ • Regional deployment (reduced latency)             │
│ • Edge caching (Redis clusters in regions)          │
│ • DDoS protection (WAF, rate limiting)              │
│ • Monitoring & alerting (Prometheus + Grafana)      │
└─────────────────────────────────────────────────────┘
```

---

## DEPLOYMENT ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────┐
│                     AWS / GCP / Azure Cloud                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ CloudFront / Cloudflare CDN (Static Assets)                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            │                                    │
│  ┌────────────────────────┴────────────────────────────────────┐ │
│  │         Application Load Balancer (ALB)                      │ │
│  │         - SSL/TLS termination                                │ │
│  │         - Sticky sessions (source IP)                        │ │
│  │         - Health checks (every 30s)                          │ │
│  └────────────┬───────────────────────────────┬────────────────┘ │
│               │                               │                  │
│  ┌────────────▼─────────────┐   ┌────────────▼─────────────┐    │
│  │ App Server (Zone A)       │   │ App Server (Zone B)       │    │
│  │ - t3.xlarge instance      │   │ - t3.xlarge instance      │    │
│  │ - Max: 350 users          │   │ - Max: 350 users          │    │
│  │ - Socket.IO               │   │ - Socket.IO               │    │
│  │ - Auto-scaling group (2-4)│   │ - Auto-scaling group (2-4)│    │
│  │ - CloudWatch monitoring   │   │ - CloudWatch monitoring   │    │
│  └────┬───────────────────────┘   └────┬───────────────────────┘  │
│       │                                 │                         │
│  ┌────┴───────────────────────────────┴────────────────────────┐ │
│  │    Multi-AZ Redis Cluster (In-Memory Cache)                 │ │
│  │    - Primary (8GB)     in Zone A                            │ │
│  │    - Replica (8GB)     in Zone B                            │ │
│  │    - Replica (8GB)     in Zone C                            │ │
│  │    - Automatic failover enabled                            │ │
│  └──────────────────────┬─────────────────────────────────────┘ │
│                         │                                        │
│  ┌──────────────────────┴──────────────────────────────────────┐ │
│  │    Multi-AZ PostgreSQL Database                             │ │
│  │    - Primary (Aurora) in Zone A                             │ │
│  │    - Standby (failover) in Zone B                           │ │
│  │    - Read Replica in Zone C                                 │ │
│  │    - Automated backups (hourly)                             │ │
│  │    - Enhanced monitoring (Performance Insights)             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Monitoring & Logging                                         │ │
│  │ - CloudWatch / Datadog                                       │ │
│  │ - ELK Stack (Elasticsearch, Logstash, Kibana)               │ │
│  │ - Prometheus + Grafana (metrics & dashboards)               │ │
│  │ - PagerDuty (alert routing & on-call)                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

**Document Version**: 1.0  
**Last Updated**: September 2026
