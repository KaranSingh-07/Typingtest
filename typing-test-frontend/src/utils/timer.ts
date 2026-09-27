export interface DurationOption {
  value: number; // in seconds
  label: string; // '15s', '30s', '1m', '3m', '5m'
  description?: string;
}

export const DURATION_OPTIONS: DurationOption[] = [
  { value: 15, label: '15s', description: 'Sprint' },
  { value: 30, label: '30s', description: 'Fast' },
  { value: 60, label: '1m', description: 'Standard' },
  { value: 180, label: '3m', description: 'Endurance' },
  { value: 300, label: '5m', description: 'Marathon' },
];

export function formatTimeLeft(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${seconds}s`;
}

export function formatDurationLabel(seconds: number): string {
  const match = DURATION_OPTIONS.find(d => d.value === seconds);
  if (match) return match.label;
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
  }
  return `${seconds}s`;
}

export const SOLO_TEXT_PARAGRAPHS = [
  "In the heart of the digital age, connectivity defines our existence. We navigate through streams of data, searching for meaning in a sea of endless information.",
  "Speed and precision are the true hallmarks of a master typist. Keep your fingers light on the keys, maintain steady rhythm, and let muscle memory guide every stroke.",
  "Technology continues to reshape how we communicate, collaborate, and innovate across borders. Every line of code written today lays the foundation for tomorrow.",
  "The quick brown fox jumps over the lazy dog. A classic sentence containing every letter of the alphabet, challenging typists across generations to master agility and balance.",
  "Curiosity is the engine of achievement. When we dare to explore uncharted territories and embrace complex problems, remarkable discoveries inevitably unfold.",
  "Learning to type with effortless velocity demands deliberate practice, patience, and unwavering discipline. When rhythm becomes second nature, ideas flow seamlessly onto the screen.",
  "Deep focus and consistency create mastery in every craft. Overcoming obstacles with resilience transforms raw effort into genuine expertise and enduring accomplishment.",
  "Creativity thrives at the intersection of imagination and relentless effort. As digital horizons expand, new horizons of knowledge and insight reveal themselves."
];

export function getSoloTextForDuration(duration: number): string {
  const targetWords = Math.max(50, Math.ceil((duration / 60) * 140));
  let combined: string[] = [];
  let wordCount = 0;
  let pool = [...SOLO_TEXT_PARAGRAPHS].sort(() => Math.random() - 0.5);
  let index = 0;

  while (wordCount < targetWords) {
    const paragraph = pool[index % pool.length];
    combined.push(paragraph);
    wordCount += paragraph.split(/\s+/).length;
    index++;
  }

  return combined.join(' ');
}
