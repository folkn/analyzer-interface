import { useCallback, useEffect, useRef, useState } from 'react';
import { useMarkerStore } from '../store/markerStore';
import { formatFreq } from '../utils/sparams';

interface CalEntry { freq: number; corrDb: number }
interface TimePoint { ts: number; bDbut: number }

const DEFAULT_CAL: CalEntry[] = [
  { freq: 1,    corrDb: 42.0 },
  { freq: 3,    corrDb: 40.5 },
  { freq: 10,   corrDb: 38.2 },
  { freq: 30,   corrDb: 35.8 },
  { freq: 100,  corrDb: 33.1 },
  { freq: 300,  corrDb: 30.5 },
  { freq: 1000, corrDb: 28.2 },
];

function interpCal(freqMhz: number, entries: CalEntry[]): number | null {
  if (!entries.length) return null;
  const s = [...entries].sort((a, b) => a.freq - b.freq);
  if (freqMhz <= s[0].freq) return s[0].corrDb;
  if (freqMhz >= s[s.length - 1].freq) return s[s.length - 1].corrDb;
  for (let i = 1; i < s.length; i++) {
    if (s[i].freq >= freqMhz) {
      const t = (freqMhz - s[i - 1].freq) / (s[i].freq - s[i - 1].freq);
      return s[i - 1].corrDb + t * (s[i].corrDb - s[i - 1].corrDb);
    }
  }
  return null;
}

function parseCSV(text: string): CalEntry[] {
  const entries: CalEntry[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.toLowerCase().startsWith('freq')) continue;
    const [fRaw, cRaw] = t.split(',');
    const freq = parseFloat(fRaw);
    const corrDb = parseFloat(cRaw);
    if (isFinite(freq) && isFinite(corrDb)) entries.push({ freq, corrDb });
  }
  return entries;
}

function toCSV(entries: CalEntry[]): string {
  return ['Freq_MHz,Correction_dB', ...entries.map(e => `${e.freq},${e.corrDb}`)].join('\n');
}

function exportTimeCSV(pts: TimePoint[], entries: CalEntry[], markerFreqHz: number): string {
  const freqMhz = markerFreqHz / 1e6;
  const cf = interpCal(freqMhz, entries) ?? 0;
  const rows = ['Time_s,Level_dBm,Correction_dB,B_dBuT,B_uT'];
  const t0 = pts[0]?.ts ?? 0;
  for (const p of pts) {
    const level = p.bDbut - cf;
    const but = 10 ** (p.bDbut / 20);
    rows.push(`${((p.ts - t0) / 1000).toFixed(3)},${level.toFixed(2)},${cf.toFixed(2)},${p.bDbut.toFixed(2)},${but.toFixed(6)}`);
  }
  return rows.join('\n');
}

type Tab = 'cal' | 'reading' | 'graph';

export default function BFieldProbe() {
  const [tab, setTab] = useState<Tab>('reading');
  const [calEntries, setCalEntries] = useState<CalEntry[]>(DEFAULT_CAL);
  const [editRow, setEditRow] = useState<{ freq: string; corrDb: string }>({ freq: '', corrDb: '' });
  const [running, setRunning] = useState(false);
  const [yUnit, setYUnit] = useState<'dBuT' | 'uT'>('dBuT');

  const timeDataRef = useRef<TimePoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const prevSaRef = useRef<unknown>(null);

  const { markers, activeMarkerId, traces } = useMarkerStore();

  const activeMarker = markers.find(m => m.id === activeMarkerId) ?? markers[0] ?? null;
  const saLevelDbm = activeMarker?.values?.saLevelDbm;
  const freqHz = activeMarker?.freq ?? 0;
  const freqMhz = freqHz / 1e6;
  const cf = interpCal(freqMhz, calEntries);
  const bDbut = saLevelDbm !== undefined && cf !== null ? saLevelDbm + cf : null;
  const bUt = bDbut !== null ? Math.pow(10, bDbut / 20) : null;

  // Accumulate time-series points when running
  useEffect(() => {
    if (!running || !traces.sa || traces.sa === prevSaRef.current) return;
    prevSaRef.current = traces.sa;
    if (bDbut !== null) {
      timeDataRef.current = [...timeDataRef.current, { ts: Date.now(), bDbut }];
      if (timeDataRef.current.length > 1800) timeDataRef.current = timeDataRef.current.slice(-1800);
    }
    scheduleRedraw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traces.sa, running, bDbut]);

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawCanvas);
  }, []);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const pts = timeDataRef.current;

    ctx.clearRect(0, 0, W, H);

    const bg = getComputedStyle(document.documentElement).getPropertyValue('--c-surface').trim() || '#1e1e2e';
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--c-text').trim() || '#e2e8f0';
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--c-border').trim() || '#2a2a3a';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (pts.length < 2) {
      ctx.fillStyle = fg;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(running ? 'Collecting data…' : 'Press Start to record', W / 2, H / 2);
      return;
    }

    const PAD = { t: 12, r: 12, b: 28, l: 52 };
    const plotW = W - PAD.l - PAD.r;
    const plotH = H - PAD.t - PAD.b;

    const vals = pts.map(p => yUnit === 'dBuT' ? p.bDbut : Math.pow(10, p.bDbut / 20));
    const vMin = Math.min(...vals), vMax = Math.max(...vals);
    const vRange = vMax - vMin || 1;
    const tMin = pts[0].ts, tMax = pts[pts.length - 1].ts;
    const tRange = tMax - tMin || 1;

    const toX = (ts: number) => PAD.l + (ts - tMin) / tRange * plotW;
    const toY = (v: number)  => PAD.t + (1 - (v - vMin) / vRange) * plotH;

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + plotW, y); ctx.stroke();
      const v = vMax - (i / 4) * vRange;
      ctx.fillStyle = fg; ctx.font = '10px monospace'; ctx.textAlign = 'right';
      ctx.fillText(yUnit === 'dBuT' ? v.toFixed(1) : v.toExponential(1), PAD.l - 4, y + 4);
    }

    // Line
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const v = yUnit === 'dBuT' ? p.bDbut : Math.pow(10, p.bDbut / 20);
      const x = toX(p.ts), y = toY(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Time axis labels
    ctx.fillStyle = fg; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const ts = tMin + (i / 4) * tRange;
      const s = ((ts - tMin) / 1000).toFixed(0);
      ctx.fillText(`${s}s`, toX(ts), H - 6);
    }
  }, [yUnit, running]);

  useEffect(() => { scheduleRedraw(); }, [tab, yUnit, scheduleRedraw]);

  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCSV(ev.target?.result as string);
      if (parsed.length) setCalEntries(parsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleExportCal() {
    const text = toCSV(calEntries);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = 'beehive100b-cal.csv';
    a.click();
  }

  function handleExportTime() {
    if (!timeDataRef.current.length) return;
    const text = exportTimeCSV(timeDataRef.current, calEntries, freqHz);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = 'bfield-timeseries.csv';
    a.click();
  }

  function addRow() {
    const freq = parseFloat(editRow.freq);
    const corrDb = parseFloat(editRow.corrDb);
    if (!isFinite(freq) || !isFinite(corrDb)) return;
    setCalEntries(prev => [...prev, { freq, corrDb }].sort((a, b) => a.freq - b.freq));
    setEditRow({ freq: '', corrDb: '' });
  }

  function removeRow(i: number) {
    setCalEntries(prev => prev.filter((_, j) => j !== i));
  }

  function clearGraph() {
    timeDataRef.current = [];
    scheduleRedraw();
  }

  const hasSA = !!traces.sa;
  const hasMarker = !!activeMarker;

  return (
    <div className="bfp">
      <div className="bfp-tabs">
        {(['reading', 'cal', 'graph'] as Tab[]).map(t => (
          <button
            key={t}
            className={`bfp-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'reading' ? '📡 Live Reading' : t === 'cal' ? '📋 Calibration' : '📈 Time Graph'}
          </button>
        ))}
      </div>

      {tab === 'reading' && (
        <div className="bfp-reading">
          {!hasSA && (
            <div className="bfp-warn">No spectrum data — connect a TinySA or switch to SA mode.</div>
          )}
          {hasSA && !hasMarker && (
            <div className="bfp-warn">Add a marker on the spectrum plot to read B field.</div>
          )}
          {hasSA && hasMarker && (
            <>
              <div className="bfp-marker-info">
                <span className="bfp-label">Marker</span>
                <span className="bfp-val mono">{activeMarker.name} @ {formatFreq(freqHz)}</span>
              </div>
              <div className="bfp-row">
                <span className="bfp-label">Received power</span>
                <span className="bfp-val mono">
                  {saLevelDbm !== undefined ? `${saLevelDbm.toFixed(2)} dBm` : '—'}
                </span>
              </div>
              <div className="bfp-row">
                <span className="bfp-label">Correction @ {freqMhz.toFixed(2)} MHz</span>
                <span className="bfp-val mono">{cf !== null ? `${cf.toFixed(2)} dB` : '—'}</span>
              </div>
              <div className="bfp-divider" />
              <div className="bfp-row bfp-result">
                <span className="bfp-label">B field</span>
                <span className="bfp-val mono bfp-big">
                  {bDbut !== null ? `${bDbut.toFixed(2)} dBμT` : '—'}
                </span>
              </div>
              <div className="bfp-row">
                <span className="bfp-label"></span>
                <span className="bfp-val mono">
                  {bUt !== null ? `${(bUt * 1e3).toFixed(3)} nT  (${bUt.toExponential(3)} μT)` : '—'}
                </span>
              </div>
              {!calEntries.length && (
                <div className="bfp-warn" style={{ marginTop: 8 }}>
                  Calibration table is empty — load or edit it in the Calibration tab.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'cal' && (
        <div className="bfp-cal">
          <div className="bfp-cal-toolbar">
            <span className="bfp-cal-title">Beehive 100B Calibration (Freq → Correction dB)</span>
            <div className="bfp-cal-actions">
              <label className="btn-sm bfp-import-btn">
                ↑ Import CSV
                <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleImportCSV} />
              </label>
              <button className="btn-sm" onClick={handleExportCal}>↓ Export CSV</button>
            </div>
          </div>
          <table className="bfp-cal-tbl">
            <thead>
              <tr><th>Freq (MHz)</th><th>Correction (dB)</th><th></th></tr>
            </thead>
            <tbody>
              {calEntries.map((e, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="bfp-cal-input"
                      type="number"
                      value={e.freq}
                      onChange={ev => setCalEntries(prev => prev.map((r, j) => j === i ? { ...r, freq: Number(ev.target.value) } : r))}
                    />
                  </td>
                  <td>
                    <input
                      className="bfp-cal-input"
                      type="number"
                      value={e.corrDb}
                      onChange={ev => setCalEntries(prev => prev.map((r, j) => j === i ? { ...r, corrDb: Number(ev.target.value) } : r))}
                    />
                  </td>
                  <td><button className="btn-del" onClick={() => removeRow(i)}>×</button></td>
                </tr>
              ))}
              <tr className="bfp-cal-add-row">
                <td>
                  <input
                    className="bfp-cal-input"
                    type="number"
                    placeholder="MHz"
                    value={editRow.freq}
                    onChange={e => setEditRow(r => ({ ...r, freq: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    className="bfp-cal-input"
                    type="number"
                    placeholder="dB"
                    value={editRow.corrDb}
                    onChange={e => setEditRow(r => ({ ...r, corrDb: e.target.value }))}
                  />
                </td>
                <td><button className="btn-sm" onClick={addRow}>+ Add</button></td>
              </tr>
            </tbody>
          </table>
          <div className="bfp-cal-note">
            B(dBμT) = P_received(dBm) + Correction(dB). Load calibration data from the Beehive 100B datasheet.
          </div>
        </div>
      )}

      {tab === 'graph' && (
        <div className="bfp-graph">
          <div className="bfp-graph-toolbar">
            <div className="bfp-graph-controls">
              <label className="sf-radio">
                <input type="radio" checked={yUnit === 'dBuT'} onChange={() => setYUnit('dBuT')} /> dBμT
              </label>
              <label className="sf-radio">
                <input type="radio" checked={yUnit === 'uT'} onChange={() => setYUnit('uT')} /> μT (linear)
              </label>
            </div>
            <div className="bfp-graph-actions">
              <button
                className={`btn-sm${running ? ' active-btn' : ''}`}
                onClick={() => setRunning(v => !v)}
                disabled={!hasSA || !hasMarker}
              >
                {running ? '⏹ Stop' : '▶ Start'}
              </button>
              <button className="btn-sm" onClick={clearGraph}>Clear</button>
              <button className="btn-sm" onClick={handleExportTime} disabled={!timeDataRef.current.length}>
                ↓ Export CSV
              </button>
            </div>
          </div>
          {(!hasSA || !hasMarker) && (
            <div className="bfp-warn">
              {!hasSA ? 'No SA data.' : 'Add a marker to record B field over time.'}
            </div>
          )}
          <canvas ref={canvasRef} className="bfp-canvas" width={700} height={200} />
          <div className="bfp-graph-status">
            {running ? `Recording — ${timeDataRef.current.length} pts` : 'Stopped'}
            {activeMarker && ` · Marker: ${activeMarker.name} @ ${formatFreq(freqHz)}`}
          </div>
        </div>
      )}
    </div>
  );
}
