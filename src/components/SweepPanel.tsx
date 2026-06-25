import { useSerialStore, POINT_OPTIONS } from '../store/serialStore';
import { useMarkerStore } from '../store/markerStore';
import { toS2P, toCSV, downloadText } from '../serial/export';

export default function SweepPanel() {
  const {
    connState, sweepState, sweepParams, autoSweep, autoIntervalMs, lastSweepMs,
    sweep, setSweepParams, setAutoSweep, setAutoInterval,
  } = useSerialStore();

  const traces = useMarkerStore(s => s.traces);

  const connected = connState === 'connected';
  const scanning  = sweepState === 'scanning';

  function mhz(hz: number) { return (hz / 1e6).toFixed(3); }

  function handleExportS2P() {
    if (!traces.s11 || !traces.s21) return;
    downloadText(toS2P(traces.s11, traces.s21), 'sweep.s2p');
  }

  function handleExportCSV() {
    if (!traces.s11 || !traces.s21) return;
    downloadText(toCSV(traces.s11, traces.s21), 'sweep.csv');
  }

  const hasData = !!traces.s11?.points.length;

  return (
    <div className="sweep-panel">
      <div className="sweep-fields">
        <label className="sweep-field">
          <span>Start</span>
          <div className="freq-input-wrap">
            <input
              type="number" className="freq-input"
              value={mhz(sweepParams.startHz)}
              min={0.05} max={4400} step={1}
              onChange={e => setSweepParams({ startHz: Number(e.target.value) * 1e6 })}
              disabled={!connected || scanning}
            />
            <span className="freq-unit">MHz</span>
          </div>
        </label>

        <label className="sweep-field">
          <span>Stop</span>
          <div className="freq-input-wrap">
            <input
              type="number" className="freq-input"
              value={mhz(sweepParams.stopHz)}
              min={0.05} max={4400} step={1}
              onChange={e => setSweepParams({ stopHz: Number(e.target.value) * 1e6 })}
              disabled={!connected || scanning}
            />
            <span className="freq-unit">MHz</span>
          </div>
        </label>

        <label className="sweep-field">
          <span>Points</span>
          <select
            className="pts-select"
            value={sweepParams.points}
            onChange={e => setSweepParams({ points: Number(e.target.value) })}
            disabled={!connected || scanning}
          >
            {POINT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="sweep-controls">
        <button
          className={`btn-sweep${scanning ? ' scanning' : ''}`}
          onClick={sweep}
          disabled={!connected || scanning}
        >
          {scanning ? '⟳ Scanning…' : '▶ Sweep'}
        </button>

        <label className="auto-label">
          <input
            type="checkbox"
            checked={autoSweep}
            onChange={e => setAutoSweep(e.target.checked)}
            disabled={!connected}
          />
          Auto
          <input
            type="number" className="interval-input"
            value={(autoIntervalMs / 1000).toFixed(1)}
            min={0.5} max={60} step={0.5}
            onChange={e => setAutoInterval(Number(e.target.value) * 1000)}
            disabled={!connected}
          />
          s
        </label>

        {lastSweepMs !== null && (
          <span className="sweep-time">{lastSweepMs} ms</span>
        )}

        {hasData && (
          <div className="export-btns">
            <button className="btn-sm" onClick={handleExportS2P}>↓ S2P</button>
            <button className="btn-sm" onClick={handleExportCSV}>↓ CSV</button>
          </div>
        )}
      </div>

      {scanning && (
        <div className="progress-track">
          <div className="progress-fill" />
        </div>
      )}
    </div>
  );
}
