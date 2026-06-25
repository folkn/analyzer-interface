import type { TraceData } from '../types';
import { magDb } from './sparams';

export interface HarmonicResult {
  order: number;
  freq: number;
  idealDb: number;
  measuredDb: number | undefined;
  inRange: boolean;
  diff: number | undefined;
}

export interface SquareWaveResult {
  fundamentalFreq: number;
  fundamentalDb: number;
  harmonics: HarmonicResult[];
  thdPercent: number | undefined;
}

export interface SquareWaveOverlay {
  harmonics: HarmonicResult[];
  color: string;
  opacity: number;
}

export function findPeakInRange(
  trace: TraceData,
  fLow = -Infinity,
  fHigh = Infinity,
): { freq: number; db: number } | null {
  let bestIdx = -1;
  let bestDb = -Infinity;
  for (let i = 0; i < trace.points.length; i++) {
    const p = trace.points[i];
    if (p.freq < fLow || p.freq > fHigh) continue;
    const db = magDb(p.re, p.im);
    if (db > bestDb) { bestDb = db; bestIdx = i; }
  }
  if (bestIdx < 0) return null;
  return { freq: trace.points[bestIdx].freq, db: bestDb };
}

/** Ideal THD for a perfect square wave measured up to maxOrder harmonic */
export function idealSquareWaveThd(maxOrder: number): number {
  let sum = 0;
  for (let n = 3; n <= maxOrder; n += 2) sum += 1 / (n * n);
  return Math.sqrt(sum) * 100;
}

export function analyzeSquareWave(
  trace: TraceData,
  fundamentalFreq: number,
  maxOrder: number,
  peakSearchWindow = 0.1,
): SquareWaveResult {
  const pts = trace.points;
  if (!pts.length || fundamentalFreq <= 0) {
    return { fundamentalFreq, fundamentalDb: -Infinity, harmonics: [], thdPercent: undefined };
  }

  const fMin = pts[0].freq;
  const fMax = pts[pts.length - 1].freq;

  const hw0 = Math.max(fundamentalFreq * peakSearchWindow, 1e3);
  const fundResult = findPeakInRange(
    trace,
    Math.max(fMin, fundamentalFreq - hw0),
    Math.min(fMax, fundamentalFreq + hw0),
  );
  const fundamentalDb = fundResult?.db ?? -Infinity;

  const harmonics: HarmonicResult[] = [];
  let harmonicPowerSum = 0;
  let anyMeasured = false;

  for (let n = 1; n <= maxOrder; n += 2) {
    const freq = fundamentalFreq * n;
    const idealRelDb = n === 1 ? 0 : -20 * Math.log10(n);
    const idealDb = isFinite(fundamentalDb) ? fundamentalDb + idealRelDb : -Infinity;
    const inRange = freq >= fMin && freq <= fMax;

    let measuredDb: number | undefined;
    if (inRange) {
      const hw = Math.max(freq * peakSearchWindow, 1e3);
      const result = findPeakInRange(
        trace,
        Math.max(fMin, freq - hw),
        Math.min(fMax, freq + hw),
      );
      measuredDb = result?.db;
    }

    const diff =
      measuredDb !== undefined && isFinite(idealDb) ? measuredDb - idealDb : undefined;

    if (n > 1 && inRange && measuredDb !== undefined && isFinite(fundamentalDb)) {
      const vRatio = Math.pow(10, (measuredDb - fundamentalDb) / 20);
      harmonicPowerSum += vRatio * vRatio;
      anyMeasured = true;
    }

    harmonics.push({ order: n, freq, idealDb, measuredDb, inRange, diff });
  }

  const thdPercent = anyMeasured ? Math.sqrt(harmonicPowerSum) * 100 : undefined;

  return { fundamentalFreq, fundamentalDb, harmonics, thdPercent };
}
