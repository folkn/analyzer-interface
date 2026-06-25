import { SerialManager } from './SerialManager';

export interface SweepParams {
  startHz: number;
  stopHz: number;
  points: number;
}

export interface SweepData {
  freqs: number[];
  s11: Array<{ re: number; im: number }>;
  s21: Array<{ re: number; im: number }>;
}

export class NanoVNADriver {
  readonly mgr: SerialManager;
  deviceInfo = 'Unknown device';

  constructor(manager: SerialManager) {
    this.mgr = manager;
  }

  async identify(): Promise<string> {
    await this.mgr.command('', 3000).catch(() => null);
    await this.mgr.flush(100);
    const raw = await this.mgr.command('version', 3000);
    this.deviceInfo = raw.replace(/\r/g, '').trim() || 'NanoVNA';
    return this.deviceInfo;
  }

  /** Single-segment scan */
  async scan(params: SweepParams): Promise<SweepData> {
    const { startHz, stopHz, points } = params;
    const timeoutMs = Math.max(20_000, points * 60 + 8_000);
    const cmd = `scan ${Math.round(startHz)} ${Math.round(stopHz)} ${points} 3`;
    const raw = await this.mgr.command(cmd, timeoutMs);
    return parseResponse(raw, startHz, stopHz, points);
  }

  /** Multi-segment scan — splits into ceil(points/maxPerSeg) sequential sweeps */
  async scanMultiSeg(
    params: SweepParams,
    maxPerSeg: number,
    onSegment?: (done: number, total: number) => void,
  ): Promise<SweepData> {
    const { startHz, stopHz, points } = params;

    if (points <= maxPerSeg) return this.scan(params);

    const numSegs = Math.ceil(points / maxPerSeg);
    const step = (stopHz - startHz) / (points - 1);

    const allFreqs: number[] = [];
    const allS11: SweepData['s11'] = [];
    const allS21: SweepData['s21'] = [];

    for (let seg = 0; seg < numSegs; seg++) {
      const idxStart = seg * maxPerSeg;
      const idxEnd   = Math.min((seg + 1) * maxPerSeg - 1, points - 1);
      const segPts   = idxEnd - idxStart + 1;
      const segStart = startHz + idxStart * step;
      const segStop  = startHz + idxEnd  * step;

      const result = await this.scan({ startHz: segStart, stopHz: segStop, points: segPts });
      allFreqs.push(...result.freqs);
      allS11.push(...result.s11);
      allS21.push(...result.s21);

      onSegment?.(seg + 1, numSegs);
    }

    return { freqs: allFreqs, s11: allS11, s21: allS21 };
  }
}

function parseResponse(raw: string, startHz: number, stopHz: number, points: number): SweepData {
  const freqs: number[] = [];
  const s11: SweepData['s11'] = [];
  const s21: SweepData['s21'] = [];
  const step = points > 1 ? (stopHz - startHz) / (points - 1) : 0;

  let idx = 0;
  for (const line of raw.split('\n')) {
    const t = line.trim().replace(/\r/g, '');
    if (!t || t.startsWith('scan') || t.startsWith('!') || t.startsWith('#')) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 4) continue;
    const [re11, im11, re21, im21] = parts.map(Number);
    if ([re11, im11, re21, im21].some(isNaN)) continue;
    freqs.push(startHz + idx * step);
    s11.push({ re: re11, im: im11 });
    s21.push({ re: re21, im: im21 });
    if (++idx >= points) break;
  }

  return { freqs, s11, s21 };
}
