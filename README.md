# TypeFlow ⚡

> Real-Time Multiplayer Typing Speed Test & Race Platform

TypeFlow is a high-precision, competitive typing speed test platform with live multiplayer synchronized racing, key-level accuracy tracking, and standard international Net WPM calculations.

---

## ✨ Features

- **Accurate WPM Calculation**: International standard Net WPM formula (`(Correct Characters / 5) ÷ Minutes`).
- **Real-Time Key Accuracy**: Keystroke-by-keystroke error detection, with live character highlighting (green for correct, red with underline for typos, and overflow handling).
- **Flexible Test Presets**:
  - `15s` (Sprint)
  - `30s` (Fast)
  - `1m` (Standard 60s)
  - `3m` (Endurance 180s)
  - `5m` (Marathon 300s)
- **Dynamic Text Scaling**: Text automatically expands up to 700+ words for longer tests so typists never run out of text.
- **Synchronized Multiplayer Races**:
  - Private lobby creation with 6-character room codes.
  - 1-click invite link copying.
  - Host controls for test duration.
  - Synchronized 3-second countdown (`3... 2... 1... GO!`) so all racers start at the exact same moment.
  - Live race track visualizer showing cars/avatars moving across lanes according to percentage progress.
  - Live WebSocket leaderboard broadcasting real-time ranks (🥇, 🥈, 🥉).
- **Solo Practice Mode**: Instant quick practice without lobby waiting.
- **Comprehensive Scorecard**:
  - Net WPM & Gross (Raw) WPM
  - Accuracy percentage
  - Total keystrokes, correct characters, error count
  - Formatted elapsed time
  - 1-Click shareable scorecard
- **Modern Dark UI**:
  - Built with Tailwind CSS, glassmorphism card styling, Google Fonts (Outfit & JetBrains Mono), and Lucide icons.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, Lucide React, Zustand, Socket.IO Client.
- **Backend**: Node.js, Express, TypeScript, Socket.IO (In-Memory Multiplayer State Engine).

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/KaranSingh-07/Typingtest.git
cd Typingtest
```

### 2. Start the Backend Server
```bash
cd typing-test-backend
npm install
npm run dev
```
Backend runs on `http://localhost:3000`.

### 3. Start the Frontend
In another terminal:
```bash
cd typing-test-frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.

---

## 📄 License
ISC
