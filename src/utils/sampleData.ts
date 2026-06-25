import type { TraceData } from '../types';

/** Generate synthetic S11/S21 data for a simple bandpass-like device */
export function generateSampleData(
  fStart: number,
  fStop: number,
  nPoints: number,
): { s11: TraceData; s21: TraceData } {
  const s11Points = [];
  const s21Points = [];
  const fc = (fStart + fStop) / 2;
  const bw = (fStop - fStart) * 0.2;

  for (let i = 0; i < nPoints; i++) {
    const f = fStart + (i / (nPoints - 1)) * (fStop - fStart);
    const x = (f - fc) / (bw / 2);
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

/** Generate synthetic spectrum analyzer data with noise floor and a few peaks */
export function generateSADemoData(
  fStart: number,
  fStop: number,
  nPoints: number,
): { sa: TraceData } {
  const saPoints = [];
  const bw = fStop - fStart;

  const peaks = [
    { fc: fStart + bw * 0.22, amp: 28, bwFrac: 0.018 },
    { fc: fStart + bw * 0.51, amp: 20, bwFrac: 0.025 },
    { fc: fStart + bw * 0.73, amp: 35, bwFrac: 0.012 },
  ];

  for (let i = 0; i < nPoints; i++) {
    const f = fStart + (i / (nPoints - 1)) * bw;
    const noise = -88 + (Math.random() - 0.5) * 3;
    let level = noise;
    for (const pk of peaks) {
      const x = (f - pk.fc) / (bw * pk.bwFrac);
      level = Math.max(level, noise + pk.amp / (1 + x * x));
    }
    const re = Math.pow(10, level / 20);
    saPoints.push({ freq: f, re, im: 0 });
  }

  return {
    sa: { id: 'sa', label: 'Spectrum', points: saPoints, enabled: true, color: '#f59e0b' },
  };
}
