import { create } from 'zustand';
import type { Marker, MarkerMode, MarkerType, TraceData } from '../types';
import { computeMarkerValues, snapToNearest } from '../utils/sparams';

const MARKER_COLORS = ['#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

type TraceId = 's11' | 's21' | 'sa';
type TracesState = { s11: TraceData | null; s21: TraceData | null; sa: TraceData | null };

interface MarkerStore {
  markers: Marker[];
  activeMarkerId: string | null;
  traces: TracesState;

  setTraces: (traces: Partial<TracesState>) => void;

  addMarker: (freq: number, mode?: MarkerMode, traceId?: string | null) => string;
  removeMarker: (id: string) => void;
  setActive: (id: string | null) => void;

  setMarkerFreq: (id: string, freq: number, snap?: boolean) => void;
  setMarkerName: (id: string, name: string) => void;
  setMarkerVisible: (id: string, visible: boolean) => void;
  setMarkerMode: (id: string, mode: MarkerMode, traceId?: string | null) => void;
  setMarkerType: (id: string, type: MarkerType, refId?: string) => void;
  setMarkerColor: (id: string, color: string) => void;

  searchPeak: (traceId: TraceId, markerId?: string) => void;
  searchValley: (traceId: TraceId, markerId?: string) => void;

  _refreshValues: (id: string) => void;
  _refreshAll: () => void;
}

function nextColor(markers: Marker[]): string {
  return MARKER_COLORS[markers.length % MARKER_COLORS.length];
}

function refPoints(traces: TracesState) {
  return traces.s11?.points ?? traces.s21?.points ?? traces.sa?.points ?? [];
}

export const useMarkerStore = create<MarkerStore>((set, get) => ({
  markers: [],
  activeMarkerId: null,
  traces: { s11: null, s21: null, sa: null },

  setTraces(partial) {
    set(s => ({ traces: { ...s.traces, ...partial } }));
    get()._refreshAll();
  },

  addMarker(freq, mode = 'global', traceId = null) {
    const { traces, markers } = get();
    const pts = refPoints(traces);
    const snapped = pts.length ? snapToNearest(pts, freq) : freq;
    const id = `m${Date.now()}`;
    const name = `M${markers.length + 1}`;
    const color = nextColor(markers);
    const values = computeMarkerValues(
      snapped,
      traces.s11 ?? undefined,
      traces.s21 ?? undefined,
      traces.sa  ?? undefined,
    );
    const marker: Marker = {
      id, name, freq: snapped, visible: true, color,
      type: 'normal', mode, assignedTraceId: mode === 'trace' ? traceId : null, values,
    };
    set(s => ({ markers: [...s.markers, marker], activeMarkerId: id }));
    return id;
  },

  removeMarker(id) {
    set(s => ({
      markers: s.markers.filter(m => m.id !== id),
      activeMarkerId: s.activeMarkerId === id ? null : s.activeMarkerId,
    }));
  },

  setActive(id) { set({ activeMarkerId: id }); },

  setMarkerFreq(id, freq, snap = true) {
    const { traces } = get();
    let snapped = freq;
    if (snap) {
      const pts = refPoints(traces);
      if (pts.length) snapped = snapToNearest(pts, freq);
    }
    set(s => ({ markers: s.markers.map(m => m.id === id ? { ...m, freq: snapped } : m) }));
    get()._refreshValues(id);
  },

  setMarkerName(id, name) {
    set(s => ({ markers: s.markers.map(m => m.id === id ? { ...m, name } : m) }));
  },

  setMarkerVisible(id, visible) {
    set(s => ({ markers: s.markers.map(m => m.id === id ? { ...m, visible } : m) }));
  },

  setMarkerMode(id, mode, traceId = null) {
    set(s => ({
      markers: s.markers.map(m =>
        m.id === id ? { ...m, mode, assignedTraceId: mode === 'trace' ? traceId : null } : m,
      ),
    }));
  },

  setMarkerType(id, type, refId) {
    set(s => ({
      markers: s.markers.map(m =>
        m.id === id ? { ...m, type, referenceMarkerId: type === 'delta' ? refId : undefined } : m,
      ),
    }));
  },

  setMarkerColor(id, color) {
    set(s => ({ markers: s.markers.map(m => m.id === id ? { ...m, color } : m) }));
  },

  searchPeak(traceId, markerId) {
    const { traces, markers, activeMarkerId, addMarker, setMarkerFreq } = get();
    const trace = traces[traceId];
    if (!trace?.points.length) return;
    let bestIdx = 0, bestMag = -Infinity;
    for (let i = 0; i < trace.points.length; i++) {
      const { re, im } = trace.points[i];
      const m = re * re + im * im;
      if (m > bestMag) { bestMag = m; bestIdx = i; }
    }
    const freq = trace.points[bestIdx].freq;
    const targetId = markerId ?? activeMarkerId;
    if (targetId && markers.find(m => m.id === targetId)) setMarkerFreq(targetId, freq, false);
    else addMarker(freq, 'global', null);
  },

  searchValley(traceId, markerId) {
    const { traces, markers, activeMarkerId, addMarker, setMarkerFreq } = get();
    const trace = traces[traceId];
    if (!trace?.points.length) return;
    let bestIdx = 0, bestMag = Infinity;
    for (let i = 0; i < trace.points.length; i++) {
      const { re, im } = trace.points[i];
      const m = re * re + im * im;
      if (m < bestMag) { bestMag = m; bestIdx = i; }
    }
    const freq = trace.points[bestIdx].freq;
    const targetId = markerId ?? activeMarkerId;
    if (targetId && markers.find(m => m.id === targetId)) setMarkerFreq(targetId, freq, false);
    else addMarker(freq, 'global', null);
  },

  _refreshValues(id) {
    const { traces } = get();
    set(s => ({
      markers: s.markers.map(m => {
        if (m.id !== id) return m;
        return {
          ...m,
          values: computeMarkerValues(
            m.freq,
            traces.s11 ?? undefined,
            traces.s21 ?? undefined,
            traces.sa  ?? undefined,
          ),
        };
      }),
    }));
  },

  _refreshAll() {
    const { traces } = get();
    set(s => ({
      markers: s.markers.map(m => ({
        ...m,
        values: computeMarkerValues(
          m.freq,
          traces.s11 ?? undefined,
          traces.s21 ?? undefined,
          traces.sa  ?? undefined,
        ),
      })),
    }));
  },
}));
