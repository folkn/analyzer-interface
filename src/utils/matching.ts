import type { SParamPoint } from '../types';
import { magDb, vswr } from './sparams';

export interface Complex { re: number; im: number }

// ── Complex helpers ───────────────────────────────────────────

function cRecip(a: Complex): Complex {
  const d = a.re * a.re + a.im * a.im;
  return { re: a.re / d, im: -a.im / d };
}

/** Reflection coefficient → load impedance (Z0 = 50Ω) */
export function gammaToZ(re: number, im: number, z0 = 50): Complex {
  const d = (1 - re) * (1 - re) + im * im;
  return {
    re: z0 * (1 - re * re - im * im) / d,
    im: z0 * 2 * im / d,
  };
}

// ── Component representation ──────────────────────────────────

export interface LCElement {
  type: 'L' | 'C' | 'none';
  reactance: number;       // Ω  (positive = inductive, negative = capacitive)
  value: number;           // H or F
  valueFmt: string;        // "47.2 nH"
  placement: 'series' | 'shunt';
  position: 'source' | 'load';
}

function fmtH(H: number): string {
  if (H >= 1e-3) return `${(H * 1e3).toFixed(2)} mH`;
  if (H >= 1e-6) return `${(H * 1e6).toFixed(2)} μH`;
  return `${(H * 1e9).toFixed(2)} nH`;
}

function fmtF(F: number): string {
  if (F >= 1e-6) return `${(F * 1e6).toFixed(2)} μF`;
  if (F >= 1e-9) return `${(F * 1e9).toFixed(2)} nF`;
  return `${(F * 1e12).toFixed(2)} pF`;
}

function toElement(X: number, placement: LCElement['placement'], position: LCElement['position']): LCElement {
  if (Math.abs(X) < 1e-9) {
    return { type: 'none', reactance: 0, value: 0, valueFmt: '—', placement, position };
  }
  return { type: X > 0 ? 'L' : 'C', reactance: X, value: 0, valueFmt: '', placement, position };
}

function withOmega(el: LCElement, omega: number): LCElement {
  if (el.type === 'none') return el;
  if (el.type === 'L') {
    const L = el.reactance / omega;
    return { ...el, value: L, valueFmt: fmtH(L) };
  }
  const C = -1 / (el.reactance * omega);
  return { ...el, value: C, valueFmt: fmtF(C) };
}

// ── L-network types ───────────────────────────────────────────

export interface LNetwork {
  label: string;            // e.g. "Low-Pass (shunt-series)"
  el1: LCElement;           // source-side element
  el2: LCElement;           // load-side element
  Q: number;
}

// ── L-network solver ──────────────────────────────────────────

/**
 * Compute all valid L-network topologies that transform ZL to RS = 50Ω at freq f.
 * Returns up to 4 solutions.
 */
export function solveLNetwork(ZL: Complex, freq: number, RS = 50): LNetwork[] {
  const omega = 2 * Math.PI * freq;
  const { re: RL, im: XL } = ZL;

  if (RL <= 0) return [];

  const networks: LNetwork[] = [];

  if (RL < RS) {
    // Shunt at source, series at load
    const Q = Math.sqrt(RS / RL - 1);

    // Low-pass: cap shunt at source, series absorbs XL inductively if possible
    const XshuntLP = -RS / Q;                   // capacitive shunt
    const XseriesLP = Q * RL - XL;              // net series element needed
    networks.push({
      label: 'Low-Pass (shunt C → series)',
      el1: withOmega({ ...toElement(XshuntLP,  'shunt',  'source'), }, omega),
      el2: withOmega({ ...toElement(XseriesLP, 'series', 'load'),   }, omega),
      Q,
    });

    // High-pass: inductor shunt at source
    const XshuntHP = RS / Q;                    // inductive shunt
    const XseriesHP = -Q * RL - XL;             // net series element needed
    networks.push({
      label: 'High-Pass (shunt L → series)',
      el1: withOmega({ ...toElement(XshuntHP,  'shunt',  'source'), }, omega),
      el2: withOmega({ ...toElement(XseriesHP, 'series', 'load'),   }, omega),
      Q,
    });

  } else if (RL > RS) {
    // General shunt-first at load side using admittance method
    const YL = cRecip(ZL);
    const GL = YL.re;
    const BL = YL.im;
    const D = GL * (1 / RS - GL);

    if (D >= 0) {
      const sqrtD = Math.sqrt(D);
      for (const sign of [+1, -1] as const) {
        const Bshunt = -BL + sign * sqrtD;
        const Ypar: Complex = { re: GL, im: BL + Bshunt };
        const Zpar = cRecip(Ypar);
        const Xseries = -Zpar.im; // cancel imaginary part with series element

        const XshuntEl = Math.abs(Bshunt) > 1e-12 ? -1 / Bshunt : Infinity;
        const label = sign > 0 ? 'Low-Pass (shunt C at load → series)' : 'High-Pass (shunt L at load → series)';
        networks.push({
          label,
          el1: withOmega({ ...toElement(Xseries, 'series', 'source') }, omega),
          el2: withOmega({ ...toElement(XshuntEl, 'shunt', 'load')   }, omega),
          Q: Math.abs(Bshunt) * RS,
        });
      }
    }
  }

  return networks;
}

// ── Antenna metrics ───────────────────────────────────────────

export interface BandEdges {
  low: number;
  high: number;
  center: number;
  bw: number;
}

export interface AntennaMetrics {
  resonantFreq: number;
  resonantS11dB: number;
  resonantVSWR: number;
  resonantZ: Complex;
  bw10dB: BandEdges | null;   // -10 dB S11 bandwidth
  bw6dB:  BandEdges | null;   // -6 dB S11 bandwidth
  loadedQ: number | null;
}

function findThresholdCrossing(
  pts: SParamPoint[],
  peakIdx: number,
  threshDb: number,
  direction: 'left' | 'right',
): number | null {
  const mags = pts.map(p => magDb(p.re, p.im));
  if (direction === 'left') {
    for (let i = peakIdx; i > 0; i--) {
      if (mags[i - 1] >= threshDb) {
        const t = (threshDb - mags[i]) / (mags[i - 1] - mags[i]);
        return pts[i].freq + t * (pts[i - 1].freq - pts[i].freq);
      }
    }
    return null;
  } else {
    for (let i = peakIdx; i < pts.length - 1; i++) {
      if (mags[i + 1] >= threshDb) {
        const t = (threshDb - mags[i]) / (mags[i + 1] - mags[i]);
        return pts[i].freq + t * (pts[i + 1].freq - pts[i].freq);
      }
    }
    return null;
  }
}

export function computeAntennaMetrics(pts: SParamPoint[]): AntennaMetrics {
  if (!pts.length) {
    return {
      resonantFreq: 0, resonantS11dB: 0, resonantVSWR: Infinity,
      resonantZ: { re: 0, im: 0 },
      bw10dB: null, bw6dB: null, loadedQ: null,
    };
  }

  const mags = pts.map(p => magDb(p.re, p.im));
  let minVal = mags[0], minIdx = 0;
  for (let i = 1; i < mags.length; i++) {
    if (mags[i] < minVal) { minVal = mags[i]; minIdx = i; }
  }

  const rp = pts[minIdx];
  const resonantFreq = rp.freq;
  const resonantS11dB = minVal;
  const resonantVSWR = vswr(rp.re, rp.im);
  const resonantZ = gammaToZ(rp.re, rp.im);

  function getBW(threshDb: number): BandEdges | null {
    const low  = findThresholdCrossing(pts, minIdx, threshDb, 'left');
    const high = findThresholdCrossing(pts, minIdx, threshDb, 'right');
    if (low === null || high === null) return null;
    return { low, high, center: (low + high) / 2, bw: high - low };
  }

  const bw10dB = getBW(-10);
  const bw6dB  = getBW(-6);
  const loadedQ = bw10dB ? resonantFreq / bw10dB.bw : null;

  return { resonantFreq, resonantS11dB, resonantVSWR, resonantZ, bw10dB, bw6dB, loadedQ };
}

// ── S21 coupling-probe metrics ────────────────────

export interface S21Metrics {
  peakFreq:   number;
  peakS21dB:  number;
  bw3dB:      BandEdges | null;
  bw6dB:      BandEdges | null;
  Q3dB:       number | null;
}

/** Find where S21 drops below thresh going away from the peak (opposite of S11 helper). */
function findS21Edge(
  pts: SParamPoint[],
  mags: number[],
  peakIdx: number,
  threshDb: number,
  direction: 'left' | 'right',
): number | null {
  if (direction === 'left') {
    for (let i = peakIdx; i > 0; i--) {
      if (mags[i - 1] <= threshDb) {
        const t = (threshDb - mags[i]) / (mags[i - 1] - mags[i]);
        return pts[i].freq + t * (pts[i - 1].freq - pts[i].freq);
      }
    }
    return null;
  } else {
    for (let i = peakIdx; i < pts.length - 1; i++) {
      if (mags[i + 1] <= threshDb) {
        const t = (threshDb - mags[i]) / (mags[i + 1] - mags[i]);
        return pts[i].freq + t * (pts[i + 1].freq - pts[i].freq);
      }
    }
    return null;
  }
}

/**
 * Find the S21 peak (coupling-probe resonance) and its bandwidths.
 * The resonant frequency is the S21 maximum; bandwidth is measured as
 * the drop from that peak (−3 dB and −6 dB).
 */
export function computeS21Metrics(pts: SParamPoint[]): S21Metrics {
  if (!pts.length) {
    return { peakFreq: 0, peakS21dB: -Infinity, bw3dB: null, bw6dB: null, Q3dB: null };
  }

  const mags = pts.map(p => magDb(p.re, p.im));
  let maxVal = mags[0], maxIdx = 0;
  for (let i = 1; i < mags.length; i++) {
    if (mags[i] > maxVal) { maxVal = mags[i]; maxIdx = i; }
  }

  const peakFreq  = pts[maxIdx].freq;
  const peakS21dB = maxVal;

  function getBW(dropDb: number): BandEdges | null {
    const thresh = peakS21dB - dropDb;
    const low  = findS21Edge(pts, mags, maxIdx, thresh, 'left');
    const high = findS21Edge(pts, mags, maxIdx, thresh, 'right');
    if (low === null || high === null) return null;
    return { low, high, center: (low + high) / 2, bw: high - low };
  }

  const bw3dB = getBW(3);
  const bw6dB = getBW(6);

  return { peakFreq, peakS21dB, bw3dB, bw6dB, Q3dB: bw3dB ? peakFreq / bw3dB.bw : null };
}
