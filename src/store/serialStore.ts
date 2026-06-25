import { create } from 'zustand';
import { SerialManager } from '../serial/SerialManager';
import { NanoVNADriver } from '../serial/NanoVNADriver';
import type { SweepParams } from '../serial/NanoVNADriver';
import { useMarkerStore } from './markerStore';
import type { TraceData } from '../types';

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type SweepState = 'idle' | 'scanning' | 'error';

export const BAUD_RATES = [9600, 38400, 115200, 230400, 921600] as const;
export const POINT_OPTIONS = [51, 101, 201, 301, 401, 501] as const;

const DEFAULT_PARAMS: SweepParams = { startHz: 100e6, stopHz: 500e6, points: 101 };

interface SerialStore {
  connState: ConnState;
  sweepState: SweepState;
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

export const useSerialStore = create<SerialStore>((set, get) => ({
  connState: 'disconnected',
  sweepState: 'idle',
  deviceInfo: '',
  errorMsg: '',
  sweepParams: DEFAULT_PARAMS,
  autoSweep: false,
  autoIntervalMs: 2000,
  lastSweepMs: null,
  baudRate: 115200,
  hasSerial: typeof navigator !== 'undefined' && 'serial' in navigator,

  async connect() {
    set({ connState: 'connecting', errorMsg: '' });
    try {
      mgr = new SerialManager();
      await mgr.requestAndOpen(get().baudRate);
      drv = new NanoVNADriver(mgr);
      const info = await drv.identify();
      set({ connState: 'connected', deviceInfo: info });
      // Kick off the first sweep immediately
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
    set({ sweepState: 'scanning', errorMsg: '' });
    const t0 = Date.now();
    try {
      const { freqs, s11, s21 } = await drv.scan(get().sweepParams);
      const traces = sweepDataToTraces(freqs, s11, s21);
      useMarkerStore.getState().setTraces(traces);
      set({ sweepState: 'idle', lastSweepMs: Date.now() - t0 });
      // Schedule next auto-sweep if enabled
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
      // Start the cycle
      autoTimer = setTimeout(() => get().sweep(), get().autoIntervalMs);
    }
  },

  setAutoInterval(ms) {
    set({ autoIntervalMs: ms });
  },

  setBaudRate(b) {
    set({ baudRate: b });
  },
}));
