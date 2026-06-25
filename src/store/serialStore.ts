import { create } from 'zustand';
import { SerialManager } from '../serial/SerialManager';
import { NanoVNADriver } from '../serial/NanoVNADriver';
import { TinySADriver } from '../serial/TinySADriver';
import type { SweepParams } from '../serial/NanoVNADriver';
import { useMarkerStore } from './markerStore';
import { getSettings } from './settingsStore';
import type { DeviceType, TraceData } from '../types';

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type SweepState = 'idle' | 'scanning' | 'error';

export const BAUD_RATES = [9600, 38400, 115200, 230400, 921600] as const;
export const POINT_OPTIONS = [51, 101, 202, 303, 404, 505, 1001] as const;
export const SA_RBW_OPTIONS = [
  { label: 'Auto', value: 0 },
  { label: '3 kHz', value: 3 },
  { label: '10 kHz', value: 10 },
  { label: '30 kHz', value: 30 },
  { label: '100 kHz', value: 100 },
  { label: '300 kHz', value: 300 },
  { label: '1 MHz', value: 1000 },
  { label: '3 MHz', value: 3000 },
] as const;

function defaultParams(): SweepParams {
  const s = getSettings();
  return { startHz: s.defaultStartHz, stopHz: s.defaultStopHz, points: s.defaultPoints };
}

interface SerialStore {
  connState: ConnState;
  sweepState: SweepState;
  sweepSeg: { done: number; total: number };
  deviceInfo: string;
  deviceType: DeviceType;
  errorMsg: string;
  sweepParams: SweepParams;
  autoSweep: boolean;
  autoIntervalMs: number;
  lastSweepMs: number | null;
  baudRate: number;
  hasSerial: boolean;
  saRbwKhz: number;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sweep: () => Promise<void>;
  setSweepParams: (p: Partial<SweepParams>) => void;
  setAutoSweep: (on: boolean) => void;
  setAutoInterval: (ms: number) => void;
  setBaudRate: (b: number) => void;
  setSARbw: (khz: number) => void;
  calibrateTinySA: () => Promise<string>;
}

let mgr: SerialManager | null = null;
let drv: NanoVNADriver | null = null;
let tinyDrv: TinySADriver | null = null;
let autoTimer: ReturnType<typeof setTimeout> | null = null;

function clearAuto() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
}

function vnaDataToTraces(
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
    deviceType: null,
    errorMsg: '',
    sweepParams: defaultParams(),
    autoSweep: false,
    autoIntervalMs: s.defaultAutoIntervalMs,
    lastSweepMs: null,
    baudRate: s.defaultBaudRate,
    hasSerial: typeof navigator !== 'undefined' && 'serial' in navigator,
    saRbwKhz: s.saRbwKhz,

    async connect() {
      set({ connState: 'connecting', errorMsg: '', deviceType: null });
      try {
        mgr = new SerialManager();
        await mgr.requestAndOpen(get().baudRate);

        // Send a blank command to clear any pending state, then read version
        await mgr.command('', 3000).catch(() => null);
        await mgr.flush(100);
        const versionRaw = await mgr.command('version', 5000);
        const info = versionRaw.replace(/\r/g, '').trim() || 'Unknown device';
        const infoLower = info.toLowerCase();

        if (infoLower.includes('tinysa') || infoLower.includes('tiny_sa')) {
          tinyDrv = new TinySADriver(mgr);
          tinyDrv.deviceInfo = info;
          drv = null;
          set({ connState: 'connected', deviceInfo: info, deviceType: 'tinySA' });
        } else {
          drv = new NanoVNADriver(mgr);
          drv.deviceInfo = info;
          tinyDrv = null;
          set({ connState: 'connected', deviceInfo: info, deviceType: 'nanovna' });
        }

        get().sweep();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        try { await mgr?.close(); } catch { /* ignore */ }
        mgr = null; drv = null; tinyDrv = null;
        set({ connState: 'error', errorMsg: msg });
      }
    },

    async disconnect() {
      clearAuto();
      set({ autoSweep: false });
      try { await mgr?.close(); } catch { /* ignore */ }
      mgr = null; drv = null; tinyDrv = null;
      set({ connState: 'disconnected', deviceInfo: '', deviceType: null, sweepState: 'idle' });
    },

    async sweep() {
      if (get().sweepState === 'scanning') return;
      const { deviceType, sweepParams, autoSweep, autoIntervalMs, saRbwKhz } = get();

      set({ sweepState: 'scanning', errorMsg: '', sweepSeg: { done: 0, total: 1 } });
      const t0 = Date.now();

      try {
        if (deviceType === 'tinySA' && tinyDrv) {
          // ── TinySA spectrum sweep ──────────────────────────
          await tinyDrv.setRbw(saRbwKhz === 0 ? 'auto' : saRbwKhz);
          const saPoints = await tinyDrv.scan({
            startHz: sweepParams.startHz,
            stopHz:  sweepParams.stopHz,
            points:  sweepParams.points,
            rbwKhz:  saRbwKhz === 0 ? 'auto' : saRbwKhz,
            refLevel: getSettings().saYMax,
          });

          if (saPoints.length === 0) throw new Error('No data received from TinySA');

          const saTrace: TraceData = {
            id: 'sa', label: 'Spectrum', enabled: true, color: '#f59e0b',
            points: saPoints.map(p => ({
              freq: p.freq,
              re: Math.pow(10, p.level / 20),
              im: 0,
            })),
          };
          useMarkerStore.getState().setTraces({ sa: saTrace, s11: null, s21: null });

        } else if (deviceType === 'nanovna' && drv) {
          // ── NanoVNA S-parameter sweep ──────────────────────
          const { maxPtsPerSeg } = getSettings();
          const totalSegs = Math.ceil(sweepParams.points / maxPtsPerSeg);
          set({ sweepSeg: { done: 0, total: totalSegs } });

          const { freqs, s11, s21 } = await drv.scanMultiSeg(
            sweepParams,
            maxPtsPerSeg,
            (done, total) => set({ sweepSeg: { done, total } }),
          );
          const traces = vnaDataToTraces(freqs, s11, s21);
          useMarkerStore.getState().setTraces({ ...traces, sa: null });

        } else {
          throw new Error('No device connected');
        }

        set({ sweepState: 'idle', lastSweepMs: Date.now() - t0 });
        if (autoSweep) {
          autoTimer = setTimeout(() => get().sweep(), autoIntervalMs);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        set({ sweepState: 'error', errorMsg: msg, connState: 'error', autoSweep: false });
      }
    },

    setSweepParams(p) { set(s => ({ sweepParams: { ...s.sweepParams, ...p } })); },
    setAutoSweep(on) {
      clearAuto();
      set({ autoSweep: on });
      if (on && get().connState === 'connected' && get().sweepState !== 'scanning') {
        autoTimer = setTimeout(() => get().sweep(), get().autoIntervalMs);
      }
    },
    setAutoInterval(ms) { set({ autoIntervalMs: ms }); },
    setBaudRate(b)       { set({ baudRate: b }); },
    setSARbw(khz)        { set({ saRbwKhz: khz }); },

    async calibrateTinySA() {
      if (!tinyDrv) return 'No TinySA connected';
      try {
        return await tinyDrv.calibrate();
      } catch (e) {
        return e instanceof Error ? e.message : 'Calibration failed';
      }
    },
  };
});

