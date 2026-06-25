import type { SParamPoint, TraceData } from '../types';

/** Generate synthetic S11/S21 data for a simple bandpass-like device */
export function generateSampleData(
  fStart: number,
  fStop: number,
  nPoints: number,
): { s11: TraceData; s21: TraceData } {
  const s11Points: SParamPoint[] = [];
  const s21Points: SParamPoint[] = [];
  const fc = (fStart + fStop) / 2;
  const bw = (fStop - fStart) * 0.2;

  for (let i = 0; i < nPoints; i++) {
    const f = fStart + (i / (nPoints - 1)) * (fStop - fStart);
    const x = (f - fc) / (bw / 2);
    // Simple Lorentzian-ish response
    const denom = 1 + x * x;
    const s21Mag = 1 / Math.sqrt(denom);
    const s11Mag = Math.sqrt(1 - s21Mag * s21Mag) * 0.85;
    const phase11 = Math.atan2(-x, 1);
    const phase21 = Math.atan2(-x * 0.5, 1);

    s11Points.push({ freq: f, re: s11Mag * Math.cos(phase11), im: s11Mag * Math.sin(phase11) });
    s21Points.push({ freq: f, re: s21Mag * Math.cos(phase21), im: s21Mag * Math.sin(phase21) });
  }

  return {
    s11: { id: 's11', label: 'S11', points: s11Points, enabled: true, color: '#3b82f6' },
    s21: { id: 's21', label: 'S21', points: s21Points, enabled: true, color: '#22c55e' },
  };
}
