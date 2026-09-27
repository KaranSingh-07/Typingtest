/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bgPrimary: '#0e131f',
        bgSecondary: '#161e2e',
        bgCard: 'rgba(26, 35, 53, 0.75)',
        textPrimary: '#f1f5f9',
        textSecondary: '#94a3b8',
        accent: '#6366f1',
        accentHover: '#4f46e5',
        correct: '#10b981',
        incorrect: '#f43f5e',
        pending: '#64748b',
        rank1: '#fbbf24',
        rank2: '#cbd5e1',
        rank3: '#d97706',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
