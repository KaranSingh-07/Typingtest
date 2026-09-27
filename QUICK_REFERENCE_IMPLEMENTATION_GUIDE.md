# QUICK REFERENCE & IMPLEMENTATION GUIDE
## For Antigravity Development Team

---

## 🎯 PROJECT OVERVIEW (30 SECONDS)

**Goal**: Build a **700-person real-time typing test platform** with:
- ✅ Smooth non-blocking typing mechanics (move to next word even if current is wrong)
- ✅ Live leaderboards updating every 1-2 seconds
- ✅ Winner announcements with Kahoot-style celebratory UX
- ✅ Custom test creation + lobby management
- ✅ QR code sharing + link distribution
- ✅ Handle 700 concurrent users smoothly

**Key Differentiator**: Users can skip words (move to next) but incomplete words stay marked until fixed. This keeps the flow going without forcing users to stop on errors.

---

## 📋 PHASE BREAKDOWN

### PHASE 1: Infrastructure & Real-Time Engine (Weeks 1-3)
**Focus**: Build the backend foundation that handles 700 concurrent users

**Critical Items**:
- [ ] Node.js + Express backend
- [ ] Socket.IO + Redis Pub/Sub setup
- [ ] PostgreSQL with 3 instances (1 primary, 2 replicas)
- [ ] Redis cluster (3 nodes: master + 2 replicas)
- [ ] Session state management (in Redis, not database)
- [ ] Leaderboard calculation engine (sorted sets)
- [ ] Connection pooling (PgBouncer)
- [ ] Load testing script (K6 to simulate 700 users)

**Tech Stack**:
```
Backend: Node.js 18+ | Express.js | TypeScript
Real-time: Socket.IO v4 | Redis 7+
Database: PostgreSQL 14+ | Redis Cluster
Deployment: Docker | Kubernetes / ECS
```

**Success Criteria**:
- Handle 700 concurrent WebSocket connections
- Leaderboard updates within 2 seconds of keystroke
- <100ms latency on keystroke events
- <50ms database query response times (p95)

---

### PHASE 2: Frontend UI/UX & Typing Mechanics (Weeks 2-4)
**Focus**: Build beautiful, performant React UI with smooth typing experience

**Critical Items**:
- [ ] React 18 + Vite project setup
- [ ] Home screen (test browsing, search, filters)
- [ ] Lobby screen (participant list, QR, countdown)
- [ ] Typing test screen (text display, cursor, error highlighting)
- [ ] Results/Winner screen (celebratory animations)
- [ ] Non-blocking typing algorithm (skip words, mark incomplete)
- [ ] Real-time stats display (WPM, accuracy, progress)
- [ ] Live leaderboard with rank animations
- [ ] Responsive design (mobile, tablet, desktop)

**Key Mechanics** (Non-Blocking Typing):
```
User types "th" for word "the":
  ✓ Shows "th" in green (matching)
User presses SPACE:
  ✓ Marks word as INCOMPLETE (red underline)
  ✓ Moves to NEXT word
User can:
  ✓ Continue typing next word OR
  ✓ Press BACKSPACE to go back and fix
```

**Performance Targets**:
- Main bundle: <150KB gzipped
- FCP (First Contentful Paint): <1.5s
- TTI (Time to Interactive): <3s
- Leaderboard render: <50ms

---

### PHASE 3: Features & Polish (Weeks 3-5)
**Focus**: Add advanced features, refine UX, prepare for launch

**Critical Items**:
- [ ] Custom test creation form + validation
- [ ] Session code generation (6-char uppercase alphanumeric)
- [ ] QR code generation (client-side, no server load)
- [ ] Share functionality (copy link, social media, email)
- [ ] User profiles & test history
- [ ] Achievement/badge system
- [ ] Sound effects & notifications
- [ ] Settings panel (theme, sound, accessibility)
- [ ] Admin dashboard (monitor sessions, user stats)
- [ ] Analytics integration

**Feature Priority**:
1. (MUST) Custom test creation
2. (MUST) QR code + link sharing
3. (MUST) Lobby join via code/QR
4. (SHOULD) User profiles
5. (SHOULD) Achievement badges
6. (NICE) Sound effects
7. (NICE) Analytics dashboard

---

## 🔧 TECHNOLOGY DECISIONS

### Why These Choices?

| Decision | Why |
|----------|-----|
| **Socket.IO** | Real-time, automatic fallback to polling, room-based broadcasting |
| **Redis** | Sub-millisecond leaderboard updates, horizontal scaling with pub/sub |
| **PostgreSQL** | ACID compliance for critical data, proven scalability |
| **React** | Component reusability, performance optimizations (memo, lazy loading) |
| **TypeScript** | Catch errors early, better developer experience, type safety |
| **Vite** | 10x faster bundling than Webpack, smaller chunks |
| **Tailwind CSS** | Utility-first, fast iteration, responsive design |
| **Docker + K8s** | Easy scaling, reproducible deployments, monitoring |

### Alternative Considerations

| Technology | Considered | Why Not Used |
|------------|-----------|------------|
| Firestore/Realtime DB | Yes | Limited at scale, higher costs, less control |
| GraphQL | Yes | Adds complexity, REST is sufficient for this use case |
| Svelte | Yes | Smaller community, Socket.IO best with React |
| MongoDB | Yes | No transactions needed, SQL joins required for results |

---

## 📊 DATA FLOW EXAMPLES

### Example 1: User Types a Character

```
TIME    CLIENT                      SERVER                        REDIS
T+0ms   User presses 'a'
        └─ Add to keystroke batch
        └─ Render 'a' (optimistic)

T+0-50ms [Batching window]
        Collect more keystrokes: 'b', 'c', 'd'

T+50ms  emit('keystroke_batch',{}) ─────────────────────────→ Receive batch
                                                              └─ Validate keys
                                                              └─ Update progress:{sessionId}:{userId}
                                                                 correct_chars += 4
                                                                 total_chars += 4
                                                              └─ Recalculate WPM
                                                              └─ ZADD leaderboard
                                                                      

T+100ms                      broadcast('leaderboard_update')←─ Get top 20 users
        ←─────────────────────────────────                     from sorted set
        Update leaderboard UI
        Animate rank changes
```

### Example 2: User Completes Test

```
TIME    CLIENT                      SERVER                        DATABASE
T+60s   [Test duration reached]
        User clicks "Finish" or
        reaches end of text

T+61s   emit('test_finished',{      Receive completion
        wpm: 85.3,                  └─ INSERT into test_results
        accuracy: 98.2,             └─ UPDATE test_sessions
        ...                         └─ PUBLISH 'session:complete'
        }) ────────────────────→     

T+62s                      broadcast('user_completed')←─ Get final leaderboard
        ←──────────────────────────                    ZRANGE top 10
                                                       ZADD achievements
        Receive 'test_ended'
        └─ Show results screen
        └─ Play celebratory sound
        └─ Animate confetti
```

### Example 3: Non-Blocking Typing (Skip Word)

```
User wants to type: "the quick"
Expected text:      "the quick"

User types: "th" [SPACE] "quic"
           │        └─ Not complete, but user presses SPACE
           └─ "th" completes to "the"? NO → Mark INCOMPLETE

DISPLAY:
Before SPACE:  [the█] (cursor at end)
After SPACE:   [the_] (red underline) │ quic█ (cursor here)
               │ mark as incomplete   └ cursor moves to next word

User can:
1. Continue: "quic" + "k" = "quick" → correct
2. Backspace: Go back to "the", fix to "the", move forward

ACCURACY IMPACT:
- "the" incomplete = missing 1 char → counts as 1 error
- "quick" correct = +5 correct chars
- Accuracy = (5) / (3 + 5) = 62.5% for these 2 words
```

---

## 🚀 QUICK START: Week 1 Setup

### Day 1-2: Project Initialization
```bash
# Backend
mkdir typing-test-backend && cd $_
npm init -y
npm install express socket.io redis pg typescript ts-node
npm install -D @types/node @types/express

# Frontend
npx create-vite@latest typing-test-frontend --template react-ts
cd typing-test-frontend
npm install react-router-dom zustand socket.io-client tailwindcss
```

### Day 3-4: Database Schema
```sql
-- Run these on PostgreSQL
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE test_sessions (
  id UUID PRIMARY KEY,
  test_id INT,
  session_code VARCHAR(10) UNIQUE NOT NULL,
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE test_results (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES test_sessions(id),
  user_id INT REFERENCES users(id),
  wpm DECIMAL(5,2),
  accuracy DECIMAL(5,2),
  completed_at TIMESTAMP
);

-- Create indices
CREATE INDEX idx_sessions_status ON test_sessions(status);
CREATE INDEX idx_results_session ON test_results(session_id);
```

### Day 5: Socket.IO Setup
```typescript
// server.ts
import express from 'express';
import { Server } from 'socket.io';
import redis from 'redis';

const app = express();
const io = new Server(app, { 
  cors: { origin: '*' },
  adapter: require('socket.io-redis')({
    host: 'localhost',
    port: 6379
  })
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_lobby', ({ sessionCode, userId }) => {
    socket.join(`session:${sessionCode}`);
    io.to(`session:${sessionCode}`).emit('participant_joined', { userId });
  });
  
  socket.on('keystroke_batch', (data) => {
    // Process batch
    // Update Redis
    // Broadcast leaderboard
  });
});

app.listen(3000);
```

---

## 📈 SCALING STRATEGY

### For 700 Concurrent Users:

**Deployment Setup**:
```
2x App Servers (t3.xlarge)
  ├─ Server 1: Handle 350 users
  └─ Server 2: Handle 350 users
  
1x Redis Cluster (3 nodes)
  ├─ Primary: 8GB
  ├─ Replica: 8GB
  └─ Replica: 8GB
  
1x PostgreSQL (Multi-AZ)
  ├─ Primary: db.r5.2xlarge
  ├─ Standby: db.r5.2xlarge
  └─ Read Replica: db.r5.xlarge
```

**Load Balancer Config**:
```nginx
upstream backend {
  server app1:3000 weight=1 max_fails=3 fail_timeout=30s;
  server app2:3000 weight=1 max_fails=3 fail_timeout=30s;
}

server {
  listen 443 ssl;
  server_name typing-test.com;
  
  location /socket.io {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
  
  location / {
    proxy_pass http://backend;
  }
}
```

**Resource Usage @ 700 Users**:
- CPU: ~65% (headroom for spikes)
- Memory: ~10GB across servers
- Database connections: ~60 active
- Redis memory: ~4GB
- Network: ~50KB/min per user

---

## 🧪 TESTING CHECKLIST

### Load Testing (K6)
```bash
k6 run load-test.js --vus 700 --duration 5m
# Verify: <100ms latency, <0.1% error rate
```

### Functional Testing
- [ ] User can create custom test
- [ ] User can join lobby via code
- [ ] User can join via QR code
- [ ] Typing works without blocking on errors
- [ ] Leaderboard updates in real-time
- [ ] Winner determined correctly
- [ ] Results screen displays final leaderboard
- [ ] User can retry or start new test
- [ ] Disconnect & reconnect works smoothly

### Performance Testing
- [ ] Load page: <3s TTI
- [ ] Open lobby: <500ms
- [ ] Start test: <500ms
- [ ] Keystroke→leaderboard: <2s
- [ ] 700 concurrent: <100ms latency
- [ ] Memory doesn't leak over 1 hour

### Browser Testing
- [ ] Chrome 90+
- [ ] Firefox 88+
- [ ] Safari 14+
- [ ] Edge 90+
- [ ] Mobile Safari (iOS 14+)
- [ ] Android Chrome

---

## 🎨 STYLING GUIDE

### Color Palette
```css
/* Dark mode (default) */
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #2d2d2d;
  --text-primary: #e0e0e0;
  --text-secondary: #9ca3af;
  
  --accent: #667eea;      /* Purple */
  --accent-hover: #764ba2;
  
  --correct: #10b981;     /* Green */
  --incorrect: #ef4444;   /* Red */
  --pending: #6b7280;     /* Gray */
  
  --rank-1: #fbbf24;      /* Gold */
  --rank-2: #d1d5db;      /* Silver */
  --rank-3: #d97706;      /* Bronze */
}
```

### Typography
```css
/* Font stack */
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.6;
  font-size: 1rem;
}

.typing-area {
  font-family: 'Fira Code', 'Courier New', monospace;
  font-size: 2rem;
  line-height: 1.8;
}

h1 { font-size: 2.5rem; font-weight: 700; }
h2 { font-size: 1.875rem; font-weight: 600; }
h3 { font-size: 1.5rem; font-weight: 600; }
```

### Animations
```css
/* Smooth transitions */
.transition-smooth {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Entrance animations */
@keyframes slideInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

---

## 🔐 SECURITY CHECKLIST

- [ ] JWT tokens for auth (24h expiry)
- [ ] Refresh tokens in httpOnly cookies
- [ ] CORS configured (allow only typing-test.com)
- [ ] Rate limiting (10 req/sec per IP)
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS protection (Content Security Policy)
- [ ] CSRF tokens on state-changing requests
- [ ] HTTPS/SSL only
- [ ] Secrets in environment variables
- [ ] Dependency scanning (npm audit)
- [ ] Regular security updates

---

## 📊 MONITORING & ALERTING

### Metrics to Track
```
Application:
  - Active sessions
  - Concurrent users
  - WebSocket connections
  - Messages per second
  - Error rate (%)
  - Avg response time
  - P95 latency

Infrastructure:
  - CPU usage
  - Memory usage
  - Disk I/O
  - Network bandwidth
  - Database connections

Business:
  - Tests completed
  - Avg WPM
  - Avg accuracy
  - User retention
```

### Alert Thresholds
```
🔴 Critical:
  - Error rate > 1%
  - Response time > 1000ms
  - CPU > 85%
  - Memory > 90%
  - Database down

🟠 Warning:
  - Error rate > 0.5%
  - Response time > 500ms
  - CPU > 75%
  - Memory > 80%
  - Lost connection to Redis
```

### Dashboard Setup
```
Grafana Dashboard:
├─ Overview (key metrics)
├─ Application Performance
├─ Infrastructure Health
├─ Database Performance
├─ User Activity
└─ Error Tracking
```

---

## 📝 API ENDPOINTS (REST)

### Authentication
```
POST   /auth/signup           Register new user
POST   /auth/login            Login user
POST   /auth/refresh          Refresh JWT token
POST   /auth/logout           Logout user
```

### Tests
```
GET    /api/tests             List all tests
GET    /api/tests/:id         Get test details
POST   /api/tests             Create custom test
GET    /api/tests/trending    Get trending tests
GET    /api/tests/search      Search tests
```

### Sessions
```
POST   /api/sessions          Create test session
GET    /api/sessions/:code    Get session by code
GET    /api/sessions/:id      Get session details
GET    /api/sessions/:id/results  Get session results
```

### Users
```
GET    /api/users/:id         Get user profile
GET    /api/users/:id/stats   Get user statistics
GET    /api/users/:id/history Get test history
PUT    /api/users/:id         Update profile
```

---

## 🚁 DEPLOYMENT STEPS

### Production Checklist
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Redis initialized
- [ ] SSL certificates installed
- [ ] CDN configured
- [ ] Monitoring activated
- [ ] Backups enabled
- [ ] Load testing passed
- [ ] Smoke tests passed
- [ ] Documentation updated

### Deployment Command
```bash
# Using Docker + Kubernetes
docker build -t typing-test:v1 .
docker push typing-test:v1

kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Verify deployment
kubectl rollout status deployment/typing-test
```

---

## 🎯 SUCCESS METRICS

**After Launch (Week 1)**:
- [ ] 700 concurrent users = smooth performance
- [ ] <100ms keystroke latency
- [ ] <2s leaderboard updates
- [ ] <0.1% error rate
- [ ] 99.9% uptime

**After 1 Month**:
- [ ] 10K+ daily active users
- [ ] Avg WPM > 65
- [ ] Avg accuracy > 95%
- [ ] User retention > 40%
- [ ] No critical bugs

---

## 🆘 TROUBLESHOOTING GUIDE

| Issue | Cause | Solution |
|-------|-------|----------|
| Slow leaderboard updates | High keystroke volume | Increase batching window, scale Redis |
| Users get disconnected | Network issues | Improve reconnection logic, tune heartbeat |
| High CPU usage | Inefficient sorting | Use Redis sorted sets, cache results |
| Memory leak | Event listeners not cleaned up | Unsubscribe from Socket.IO events |
| Database bottleneck | Connection pool exhausted | Increase pool size, add read replicas |
| QR code not working | Client-side generation error | Check qrcode.js version, test in browser |

---

## 📚 REFERENCE LINKS

**Documentation**:
- Socket.IO: https://socket.io/docs/
- Redis: https://redis.io/documentation
- PostgreSQL: https://www.postgresql.org/docs/
- React: https://react.dev/
- Tailwind CSS: https://tailwindcss.com/docs/

**Inspiration**:
- Typer.io: https://typer.io/
- Kahoot.com: https://kahoot.com/
- Typeracer: https://play.typeracer.com/

---

## 👥 TEAM STRUCTURE (Recommended)

- **Backend Lead** (1): Node.js, Socket.IO, Database
- **Frontend Lead** (1): React, UI/UX, Animations
- **DevOps** (1): Docker, Kubernetes, Monitoring
- **QA** (1): Testing, Load testing, Bug reports
- **Product Manager** (0.5): Roadmap, Priorities

---

**Document Version**: 1.0  
**Last Updated**: September 2026  
**Contact**: [Your Email]

Start with **Phase 1**, ship **Phase 2**, then iterate with **Phase 3**. Good luck! 🚀
