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

type SweepMode = 'sweep' | 'scan' | 'scan_mask';

export class NanoVNADriver {
  readonly mgr: SerialManager;
  deviceInfo = 'Unknown device';
  private sweepMode: SweepMode = 'scan';

  constructor(manager: SerialManager) {
    this.mgr = manager;
  }

  setDeviceInfo(info: string) {
    this.deviceInfo = info;
    this.sweepMode = detectSweepMode(info);
  }

  async identify(): Promise<string> {
    await this.mgr.command('', 3000).catch(() => null);
    await this.mgr.flush(100);
    const raw = await this.mgr.command('version', 3000);
    this.setDeviceInfo(raw.replace(/\r/g, '').trim() || 'NanoVNA');
    return this.deviceInfo;
  }

  /** Single-segment scan */
  async scan(params: SweepParams): Promise<SweepData> {
    const { startHz, stopHz, points } = params;
    const timeoutMs = Math.max(20_000, points * 60 + 8_000);
    const start = Math.round(startHz);
    const stop = Math.round(stopHz);

    if (this.sweepMode === 'scan_mask') {
      const freqRaw = await this.mgr.command(`scan ${start} ${stop} ${points} 0b001`, timeoutMs);
      const dataRaw = await this.mgr.command(`scan ${start} ${stop} ${points} 0b110`, timeoutMs);
      return parseMaskedScanResponse(freqRaw, dataRaw, startHz, stopHz, points);
    }

    const sweepCmd =
      this.sweepMode === 'scan'
        ? `scan ${start} ${stop} ${points}`
        : `sweep ${start} ${stop} ${points}`;
    await this.mgr.command(sweepCmd, timeoutMs);

    const freqRaw = await this.mgr.command('frequencies', timeoutMs);
    const s11Raw = await this.mgr.command('data 0', timeoutMs);
    const s21Raw = await this.mgr.command('data 1', timeoutMs);
    return parseDataResponses(freqRaw, s11Raw, s21Raw, startHz, stopHz, points);
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

function detectSweepMode(deviceInfo: string): SweepMode {
  const match = deviceInfo.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return 'scan';
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major > 0 || minor > 7 || (minor === 7 && patch >= 1)) return 'scan_mask';
  if (major > 0 || minor >= 2) return 'scan';
  return 'sweep';
}

function cleanLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim().replace(/\r/g, ''))
    .filter((line) => line && !line.startsWith('!') && !line.startsWith('#'));
}

function parseFrequencyLines(raw: string, fallbackStartHz: number, fallbackStopHz: number, points: number): number[] {
  const parsed = cleanLines(raw)
    .filter((line) => !/^(scan|sweep|frequencies)\b/i.test(line))
    .map((line) => Number(line))
    .filter((value) => Number.isFinite(value));

  if (parsed.length >= points) return parsed.slice(0, points);

  const step = points > 1 ? (fallbackStopHz - fallbackStartHz) / (points - 1) : 0;
  return Array.from({ length: points }, (_, index) => fallbackStartHz + index * step);
}

function parseComplexLines(raw: string, commandName: string): Array<{ re: number; im: number }> {
  return cleanLines(raw)
    .filter((line) => !line.toLowerCase().startsWith(commandName))
    .map((line) => {
      const parts = line.split(/\s+/).map(Number);
      if (parts.length < 2 || parts.some((value) => Number.isNaN(value))) return null;
      return { re: parts[0], im: parts[1] };
    })
    .filter((value): value is { re: number; im: number } => value !== null);
}

function parseMaskedScanResponse(
  freqRaw: string,
  dataRaw: string,
  startHz: number,
  stopHz: number,
  points: number,
): SweepData {
  const freqs = parseFrequencyLines(freqRaw, startHz, stopHz, points);
  const s11: SweepData['s11'] = [];
  const s21: SweepData['s21'] = [];

  for (const line of cleanLines(dataRaw)) {
    if (!line.toLowerCase().startsWith('scan')) {
      const parts = line.split(/\s+/).map(Number);
      if (parts.length < 4 || parts.some((value) => Number.isNaN(value))) continue;
      s11.push({ re: parts[0], im: parts[1] });
      s21.push({ re: parts[2], im: parts[3] });
      if (s11.length >= points) break;
    }
  }

  return {
    freqs: freqs.slice(0, Math.min(freqs.length, s11.length, s21.length)),
    s11: s11.slice(0, Math.min(freqs.length, s11.length, s21.length)),
    s21: s21.slice(0, Math.min(freqs.length, s11.length, s21.length)),
  };
}

function parseDataResponses(
  freqRaw: string,
  s11Raw: string,
  s21Raw: string,
  startHz: number,
  stopHz: number,
  points: number,
): SweepData {
  const freqs = parseFrequencyLines(freqRaw, startHz, stopHz, points);
  const s11 = parseComplexLines(s11Raw, 'data 0');
  const s21 = parseComplexLines(s21Raw, 'data 1');
  const count = Math.min(freqs.length, s11.length, s21.length, points);
  return {
    freqs: freqs.slice(0, count),
    s11: s11.slice(0, count),
    s21: s21.slice(0, count),
  };
}
