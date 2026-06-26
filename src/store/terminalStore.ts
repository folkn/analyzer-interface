import { create } from 'zustand';

export interface TerminalEntry {
  id: number;
  ts: number;
  level: 'info' | 'ok' | 'warn' | 'error';
  text: string;
}

let nextId = 1;

interface TerminalStore {
  entries: TerminalEntry[];
  log: (text: string, level?: TerminalEntry['level']) => void;
  clear: () => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  entries: [],
  log(text, level = 'info') {
    const entry: TerminalEntry = { id: nextId++, ts: Date.now(), level, text };
    set(s => ({ entries: [...s.entries.slice(-199), entry] }));
  },
  clear() { set({ entries: [] }); },
}));
