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

/**
 * Driver for NanoVNA v1/H/H4 (text-based serial protocol).
 * The device prompt is "ch> " and commands are terminated with \r\n.
 *
 * scan command: scan <start_hz> <stop_hz> <points> <outmask>
 *   outmask 3 = S11 + S21
 *   Each response line: re11 im11 re21 im21
 */
export class NanoVNADriver {
  readonly mgr: SerialManager;
  deviceInfo = 'Unknown device';

  constructor(manager: SerialManager) {
    this.mgr = manager;
  }

  /** Send a no-op to get the prompt, then query version */
  async identify(): Promise<string> {
    // Flush any startup banner by waiting for a prompt
    await this.mgr.command('', 3000).catch(() => null);
    await this.mgr.flush(100);
    const raw = await this.mgr.command('version', 3000);
    this.deviceInfo = raw.replace(/\r/g, '').trim() || 'NanoVNA';
    return this.deviceInfo;
  }

  async scan(params: SweepParams): Promise<SweepData> {
    const { startHz, stopHz, points } = params;
    // Budget ~40ms/pt for slow firmware + generous margin
    const timeoutMs = Math.max(20_000, points * 60 + 8_000);
    const cmd = `scan ${Math.round(startHz)} ${Math.round(stopHz)} ${points} 3`;
    const raw = await this.mgr.command(cmd, timeoutMs);
    return parseResponse(raw, startHz, stopHz, points);
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
