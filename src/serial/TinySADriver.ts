import { SerialManager } from './SerialManager';

export interface SASweepParams {
  startHz: number;
  stopHz:  number;
  points:  number;
  rbwKhz:  number | 'auto';  // resolution bandwidth
  refLevel: number;           // dBm reference level (top of display)
}

export interface SAPoint {
  freq:  number;
  level: number;  // dBm
}

export class TinySADriver {
  readonly mgr: SerialManager;
  deviceInfo = 'Unknown TinySA';

  constructor(manager: SerialManager) {
    this.mgr = manager;
  }

  async identify(): Promise<string> {
    await this.mgr.command('', 3000).catch(() => null);
    await this.mgr.flush(100);
    const raw = await this.mgr.command('version', 3000);
    this.deviceInfo = raw.replace(/\r/g, '').trim() || 'TinySA';
    return this.deviceInfo;
  }

  async getRbw(): Promise<number | null> {
    try {
      const raw = await this.mgr.command('rbw', 3000);
      const match = raw.match(/(\d+(?:\.\d+)?)\s*k?Hz/i);
      if (match) return parseFloat(match[1]);
      const num = parseFloat(raw.trim());
      return isNaN(num) ? null : num;
    } catch { return null; }
  }

  async setRbw(khz: number | 'auto'): Promise<void> {
    const cmd = khz === 'auto' ? 'rbw 0' : `rbw ${Math.round(khz)}`;
    await this.mgr.command(cmd, 3000);
  }

  /** Full scan — returns one level per frequency point */
  async scan(params: SASweepParams): Promise<SAPoint[]> {
    const { startHz, stopHz, points } = params;
    const timeoutMs = Math.max(30_000, points * 100 + 8_000);
    const cmd = `scan ${Math.round(startHz)} ${Math.round(stopHz)} ${points} 3`;
    const raw = await this.mgr.command(cmd, timeoutMs);
    return parseSAResponse(raw, startHz, stopHz, points);
  }

  /** Trigger a self-calibration (cal output sequence) */
  async calibrate(): Promise<string> {
    // TinySA uses 'caloutput' to produce a calibration signal
    await this.mgr.command('input', 3000).catch(() => null);
    const raw = await this.mgr.command('cal', 5000).catch(() => 'done');
    return raw.trim() || 'Calibration complete';
  }
}

function parseSAResponse(raw: string, startHz: number, stopHz: number, points: number): SAPoint[] {
  const step = points > 1 ? (stopHz - startHz) / (points - 1) : 0;
  const result: SAPoint[] = [];
  let idx = 0;

  for (const line of raw.split('\n')) {
    const t = line.trim().replace(/\r/g, '');
    if (!t || t.startsWith('scan') || t.startsWith('!') || t.startsWith('#')) continue;

    // TinySA can return "freq level" pairs or just level values
    const parts = t.split(/\s+/).map(Number);
    if (parts.some(isNaN)) continue;

    if (parts.length >= 2) {
      // freq level pair — use the freq directly if plausible
      const [, level] = parts;
      result.push({ freq: startHz + idx * step, level });
    } else if (parts.length === 1) {
      result.push({ freq: startHz + idx * step, level: parts[0] });
    }
    if (++idx >= points) break;
  }

  return result;
}
