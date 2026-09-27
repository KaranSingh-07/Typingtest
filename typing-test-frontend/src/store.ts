import { create } from 'zustand';

interface AppState {
  userId: string;
  username: string;
  sessionId: string;
  sessionCode: string;
  testDuration: number;
  testText: string;
  isHost: boolean;
  testState: 'lobby' | 'countdown' | 'in_progress' | 'completed';
  setUserId: (id: string) => void;
  setUsername: (name: string) => void;
  setSession: (id: string, code: string) => void;
  setTestConfig: (duration: number, text: string, isHost?: boolean) => void;
  setTestState: (state: 'lobby' | 'countdown' | 'in_progress' | 'completed') => void;
}

const getStoredUserId = () => {
  let id = localStorage.getItem('typeflow_userId');
  if (!id) {
    id = `u_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('typeflow_userId', id);
  }
  return id;
};

const getStoredUsername = () => {
  let name = localStorage.getItem('typeflow_username');
  if (!name) {
    name = `Racer${Math.floor(100 + Math.random() * 900)}`;
    localStorage.setItem('typeflow_username', name);
  }
  return name;
};

export const useAppStore = create<AppState>((set) => ({
  userId: getStoredUserId(),
  username: getStoredUsername(),
  sessionId: '',
  sessionCode: '',
  testDuration: 60,
  testText: '',
  isHost: false,
  testState: 'lobby',
  setUserId: (id) => {
    localStorage.setItem('typeflow_userId', id);
    set({ userId: id });
  },
  setUsername: (name) => {
    localStorage.setItem('typeflow_username', name);
    set({ username: name });
  },
  setSession: (id, code) => set({ sessionId: id, sessionCode: code }),
  setTestConfig: (duration, text, isHost) => set((prev) => ({ 
    testDuration: duration, 
    testText: text,
    ...(isHost !== undefined ? { isHost } : {})
  })),
  setTestState: (state) => set({ testState: state }),
}));

