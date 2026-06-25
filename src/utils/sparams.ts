import type { SParamPoint, MarkerValues, TraceData } from '../types';

export function magDb(re: number, im: number): number {
  const mag = Math.sqrt(re * re + im * im);
  return mag > 0 ? 20 * Math.log10(mag) : -Infinity;
}

export function phaseDeg(re: number, im: number): number {
  return (Math.atan2(im, re) * 180) / Math.PI;
}

export function vswr(re: number, im: number): number {
  const mag = Math.sqrt(re * re + im * im);
  if (mag >= 1) return Infinity;
  return (1 + mag) / (1 - mag);
}

/** Interpolate or find nearest point for a given frequency */
export function interpolatePoint(points: SParamPoint[], freq: number): SParamPoint | null {
  if (!points.length) return null;
  if (freq < points[0].freq || freq > points[points.length - 1].freq) return null;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].freq <= freq) lo = mid;
    else hi = mid;
  }
  if (lo === hi) return points[lo];

  const t = (freq - points[lo].freq) / (points[hi].freq - points[lo].freq);
  return {
    freq,
    re: points[lo].re + t * (points[hi].re - points[lo].re),
    im: points[lo].im + t * (points[hi].im - points[lo].im),
  };
}

/** Snap freq to nearest measured frequency in points array */
export function snapToNearest(points: SParamPoint[], freq: number): number {
  if (!points.length) return freq;
  let best = points[0].freq;
  let bestDist = Math.abs(freq - best);
  for (const p of points) {
    const d = Math.abs(freq - p.freq);
    if (d < bestDist) { bestDist = d; best = p.freq; }
  }
  return best;
}

export function computeMarkerValues(
  freq: number,
  s11Trace: TraceData | undefined,
  s21Trace: TraceData | undefined,
  saTrace?: TraceData,
): MarkerValues {
  const vals: MarkerValues = {};

  if (s11Trace?.enabled) {
    const pt = interpolatePoint(s11Trace.points, freq);
    if (pt) {
      vals.s11MagDb = magDb(pt.re, pt.im);
      vals.s11PhaseDeg = phaseDeg(pt.re, pt.im);
      vals.s11Re = pt.re;
      vals.s11Im = pt.im;
      vals.vswr = vswr(pt.re, pt.im);
    }
  }

  if (s21Trace?.enabled) {
    const pt = interpolatePoint(s21Trace.points, freq);
    if (pt) {
      vals.s21MagDb = magDb(pt.re, pt.im);
      vals.s21PhaseDeg = phaseDeg(pt.re, pt.im);
    }
  }

  if (saTrace?.enabled) {
    const pt = interpolatePoint(saTrace.points, freq);
    if (pt) vals.saLevelDbm = magDb(pt.re, pt.im);
  }

  return vals;
}

export function formatFreq(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(4)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(4)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(4)} kHz`;
  return `${hz.toFixed(0)} Hz`;
}

export function formatVal(v: number | undefined, unit = '', digits = 2): string {
  if (v === undefined || !isFinite(v)) return '—';
  return `${v.toFixed(digits)}${unit}`;
}
