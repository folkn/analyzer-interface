import { create } from 'zustand';
import { SerialManager } from '../serial/SerialManager';
import { NanoVNADriver } from '../serial/NanoVNADriver';
import type { SweepParams } from '../serial/NanoVNADriver';
import { useMarkerStore } from './markerStore';
import { getSettings } from './settingsStore';
import type { TraceData } from '../types';

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type SweepState = 'idle' | 'scanning' | 'error';

export const BAUD_RATES = [9600, 38400, 115200, 230400, 921600] as const;
export const POINT_OPTIONS = [51, 101, 202, 303, 404, 505, 1001] as const;

function defaultParams(): SweepParams {
  const s = getSettings();
  return { startHz: s.defaultStartHz, stopHz: s.defaultStopHz, points: s.defaultPoints };
}

interface SerialStore {
  connState: ConnState;
  sweepState: SweepState;
  sweepSeg: { done: number; total: number };  // multi-segment progress
  deviceInfo: string;
  errorMsg: string;
  sweepParams: SweepParams;
  autoSweep: boolean;
  autoIntervalMs: number;
  lastSweepMs: number | null;
  baudRate: number;
  hasSerial: boolean;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sweep: () => Promise<void>;
  setSweepParams: (p: Partial<SweepParams>) => void;
  setAutoSweep: (on: boolean) => void;
  setAutoInterval: (ms: number) => void;
  setBaudRate: (b: number) => void;
}

let mgr: SerialManager | null = null;
let drv: NanoVNADriver | null = null;
let autoTimer: ReturnType<typeof setTimeout> | null = null;

function clearAuto() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
}

function sweepDataToTraces(
  freqs: number[],
  s11raw: Array<{ re: number; im: number }>,
  s21raw: Array<{ re: number; im: number }>,
): { s11: TraceData; s21: TraceData } {
  return {
    s11: {
      id: 's11', label: 'S11', enabled: true, color: '#3b82f6',
      points: freqs.map((f, i) => ({ freq: f, ...s11raw[i] })),
    },
    s21: {
      id: 's21', label: 'S21', enabled: true, color: '#22c55e',
      points: freqs.map((f, i) => ({ freq: f, ...s21raw[i] })),
    },
  };
}

export const useSerialStore = create<SerialStore>((set, get) => {
  const s = getSettings();
  return {
    connState: 'disconnected',
    sweepState: 'idle',
    sweepSeg: { done: 0, total: 1 },
    deviceInfo: '',
    errorMsg: '',
    sweepParams: defaultParams(),
    autoSweep: false,
    autoIntervalMs: s.defaultAutoIntervalMs,
    lastSweepMs: null,
    baudRate: s.defaultBaudRate,
    hasSerial: typeof navigator !== 'undefined' && 'serial' in navigator,

    async connect() {
      set({ connState: 'connecting', errorMsg: '' });
      try {
        mgr = new SerialManager();
        await mgr.requestAndOpen(get().baudRate);
        drv = new NanoVNADriver(mgr);
        const info = await drv.identify();
        set({ connState: 'connected', deviceInfo: info });
        get().sweep();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        try { await mgr?.close(); } catch { /* ignore */ }
        mgr = null; drv = null;
        set({ connState: 'error', errorMsg: msg });
      }
    },

    async disconnect() {
      clearAuto();
      set({ autoSweep: false });
      try { await mgr?.close(); } catch { /* ignore */ }
      mgr = null; drv = null;
      set({ connState: 'disconnected', deviceInfo: '', sweepState: 'idle' });
    },

    async sweep() {
      if (!drv || get().sweepState === 'scanning') return;
      set({ sweepState: 'scanning', errorMsg: '', sweepSeg: { done: 0, total: 1 } });
      const t0 = Date.now();
      const { maxPtsPerSeg } = getSettings();
      const params = get().sweepParams;
      const totalSegs = Math.ceil(params.points / maxPtsPerSeg);
      set({ sweepSeg: { done: 0, total: totalSegs } });

      try {
        const { freqs, s11, s21 } = await drv.scanMultiSeg(
          params,
          maxPtsPerSeg,
          (done, total) => set({ sweepSeg: { done, total } }),
        );
        const traces = sweepDataToTraces(freqs, s11, s21);
        useMarkerStore.getState().setTraces(traces);
        set({ sweepState: 'idle', lastSweepMs: Date.now() - t0 });
        if (get().autoSweep) {
          autoTimer = setTimeout(() => get().sweep(), get().autoIntervalMs);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        set({ sweepState: 'error', errorMsg: msg, connState: 'error', autoSweep: false });
      }
    },

    setSweepParams(p) {
      set(s => ({ sweepParams: { ...s.sweepParams, ...p } }));
    },

    setAutoSweep(on) {
      clearAuto();
      set({ autoSweep: on });
      if (on && get().connState === 'connected' && get().sweepState !== 'scanning') {
        autoTimer = setTimeout(() => get().sweep(), get().autoIntervalMs);
      }
    },

    setAutoInterval(ms) { set({ autoIntervalMs: ms }); },
    setBaudRate(b)       { set({ baudRate: b }); },
  };
});
