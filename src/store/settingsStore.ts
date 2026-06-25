import { create } from 'zustand';

const STORAGE_KEY = 'spa-settings-v1';

export interface AppSettings {
  // Sweep defaults
  defaultStartHz: number;
  defaultStopHz: number;
  defaultPoints: number;
  defaultAutoIntervalMs: number;
  defaultBaudRate: number;
  maxPtsPerSeg: number;       // NanoVNA per-scan limit; multi-seg kicks in above this
  // Plot axes
  magYMin: number;
  magYMax: number;
  phaseYMin: number;
  phaseYMax: number;
  // Appearance
  theme: 'dark' | 'light';
  showMajorGrid: boolean;
  showMinorGrid: boolean;
}

export const FACTORY_DEFAULTS: AppSettings = {
  defaultStartHz: 100e6,
  defaultStopHz: 400e6,
  defaultPoints: 101,
  defaultAutoIntervalMs: 2000,
  defaultBaudRate: 115200,
  maxPtsPerSeg: 101,
  magYMin: -40,
  magYMax: 20,
  phaseYMin: -180,
  phaseYMax: 180,
  theme: 'dark',
  showMajorGrid: true,
  showMinorGrid: false,
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
  isDirty: boolean;

  update: (partial: Partial<AppSettings>) => void;
  saveAsDefault: () => void;
  resetToFactory: () => void;
  exportJSON: () => void;
  importJSON: (json: string) => string | null;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: loadFromStorage(),
  isDirty: false,

  update(partial) {
    set(s => {
      const next = { ...s.settings, ...partial };
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
      const hasKnown = (Object.keys(FACTORY_DEFAULTS) as (keyof AppSettings)[]).some(k => k in parsed);
      if (!hasKnown) return 'File does not contain recognizable settings';
      const merged: AppSettings = { ...FACTORY_DEFAULTS, ...parsed };
      // Clamp
      merged.magYMin   = Math.max(-200, Math.min(-1,   merged.magYMin));
      merged.magYMax   = Math.max(0,    Math.min(60,   merged.magYMax));
      merged.phaseYMin = Math.max(-360, Math.min(-1,   merged.phaseYMin));
      merged.phaseYMax = Math.max(1,    Math.min(360,  merged.phaseYMax));
      merged.maxPtsPerSeg = Math.max(51, Math.min(1001, merged.maxPtsPerSeg));
      set({ settings: merged, isDirty: false });
      writeToStorage(merged);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid JSON';
    }
  },
}));

export function getSettings(): AppSettings {
  return useSettingsStore.getState().settings;
}

/** Chart colors keyed by theme — for use inside JS/SVG where CSS vars don't reach */
export function getChartColors(theme: 'dark' | 'light') {
  return theme === 'dark'
    ? {
        tick:           '#9ca3af',
        gridMajor:      '#2a2a3a',
        gridMinor:      '#1c1c2c',
        tooltipBg:      '#1e1e2e',
        tooltipBorder:  '#333',
        tooltipLabel:   '#e2e8f0',
        smithBg:        '#0f172a',
        smithRing:      '#334155',
        smithGrid:      '#1e293b',
        smithGridBold:  '#4b5563',
        smithText:      '#4b5563',
      }
    : {
        tick:           '#6b7280',
        gridMajor:      '#d1d5db',
        gridMinor:      '#e5e7eb',
        tooltipBg:      '#ffffff',
        tooltipBorder:  '#e2e8f0',
        tooltipLabel:   '#0f172a',
        smithBg:        '#f8fafc',
        smithRing:      '#94a3b8',
        smithGrid:      '#e2e8f0',
        smithGridBold:  '#9ca3af',
        smithText:      '#9ca3af',
      };
}
