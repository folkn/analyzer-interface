import { create } from 'zustand';

const STORAGE_KEY = 'spa-settings-v1';

export interface AppSettings {
  // Sweep defaults
  defaultStartHz: number;
  defaultStopHz: number;
  defaultPoints: number;
  defaultAutoIntervalMs: number;
  defaultBaudRate: number;
  // Magnitude plot Y-axis
  magYMin: number;
  magYMax: number;
  // Phase plot Y-axis
  phaseYMin: number;
  phaseYMax: number;
}

export const FACTORY_DEFAULTS: AppSettings = {
  defaultStartHz: 100e6,
  defaultStopHz: 400e6,
  defaultPoints: 101,
  defaultAutoIntervalMs: 2000,
  defaultBaudRate: 115200,
  magYMin: -40,
  magYMax: 20,
  phaseYMin: -180,
  phaseYMax: 180,
};

function loadFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...FACTORY_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore corrupt data */ }
  return { ...FACTORY_DEFAULTS };
}

function writeToStorage(s: AppSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

interface SettingsStore {
  settings: AppSettings;
  isDirty: boolean; // true when in-memory differs from stored

  update: (partial: Partial<AppSettings>) => void;
  saveAsDefault: () => void;
  resetToFactory: () => void;
  exportJSON: () => void;
  importJSON: (json: string) => string | null; // returns error string or null on success
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: loadFromStorage(),
  isDirty: false,

  update(partial) {
    set(s => {
      const next = { ...s.settings, ...partial };
      // Check if this differs from what's stored
      const stored = loadFromStorage();
      const dirty = JSON.stringify(next) !== JSON.stringify(stored);
      return { settings: next, isDirty: dirty };
    });
  },

  saveAsDefault() {
    const { settings } = get();
    writeToStorage(settings);
    set({ isDirty: false });
  },

  resetToFactory() {
    set({ settings: { ...FACTORY_DEFAULTS }, isDirty: true });
  },

  exportJSON() {
    const { settings } = get();
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analyzer-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  importJSON(json: string) {
    try {
      const parsed = JSON.parse(json) as Partial<AppSettings>;
      // Validate — must have at least one known key
      const knownKeys = Object.keys(FACTORY_DEFAULTS) as (keyof AppSettings)[];
      const hasKnown = knownKeys.some(k => k in parsed);
      if (!hasKnown) return 'File does not contain recognizable settings';
      // Merge with factory defaults so missing keys get their defaults
      const merged: AppSettings = { ...FACTORY_DEFAULTS, ...parsed };
      // Clamp numeric sanity
      merged.magYMin = Math.max(-200, Math.min(0, merged.magYMin));
      merged.magYMax = Math.max(0, Math.min(60, merged.magYMax));
      merged.phaseYMin = Math.max(-360, Math.min(-1, merged.phaseYMin));
      merged.phaseYMax = Math.max(1, Math.min(360, merged.phaseYMax));
      set({ settings: merged, isDirty: false });
      writeToStorage(merged);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid JSON';
    }
  },
}));

/** Convenience: get current settings without subscribing */
export function getSettings(): AppSettings {
  return useSettingsStore.getState().settings;
}
