import { useState } from 'react';
import { useSerialStore, POINT_OPTIONS, SA_RBW_OPTIONS } from '../store/serialStore';
import { useMarkerStore } from '../store/markerStore';
import { useSettingsStore } from '../store/settingsStore';
import { toS2P, toCSV, toSACSV, downloadText } from '../serial/export';
import FreqPresets from './FreqPresets';

export default function SweepPanel() {
  const {
    connState, sweepState, sweepParams, sweepSeg, autoSweep, autoIntervalMs, lastSweepMs,
    deviceType, saRbwKhz,
    sweep, setSweepParams, setAutoSweep, setAutoInterval, setSARbw, calibrateTinySA,
  } = useSerialStore();

  const traces = useMarkerStore(s => s.traces);
  const { settings } = useSettingsStore();
  const maxPtsPerSeg = settings.maxPtsPerSeg;

  const [calMsg, setCalMsg] = useState('');
  const [showCalModal, setShowCalModal] = useState(false);

  const connected = connState === 'connected';
  const scanning  = sweepState === 'scanning';
  const isSA      = deviceType === 'tinySA' || (!deviceType && settings.deviceMode === 'sa');
  const numSegs   = Math.ceil(sweepParams.points / maxPtsPerSeg);

  function mhz(hz: number) { return (hz / 1e6).toFixed(3); }

  function handleExportS2P() {
    if (!traces.s11 || !traces.s21) return;
    downloadText(toS2P(traces.s11, traces.s21), 'sweep.s2p');
  }
  function handleExportVNACSV() {
    if (!traces.s11 || !traces.s21) return;
    downloadText(toCSV(traces.s11, traces.s21), 'sweep.csv');
  }
  function handleExportSACSV() {
    if (!traces.sa) return;
    downloadText(toSACSV(traces.sa), 'spectrum.csv');
  }

  async function handleCalibrate() {
    setCalMsg('Running calibration…');
    setShowCalModal(true);
    const result = await calibrateTinySA();
    setCalMsg(result);
  }

  function handlePreset(start: number, stop: number) {
    setSweepParams({ startHz: start, stopHz: stop });
  }

  const hasVNAData = !!traces.s11?.points.length;
  const hasSAData  = !!traces.sa?.points.length;

  return (
    <div className="sweep-panel">
      <div className="sweep-fields">
        <label className="sweep-field">
          <span>Start</span>
          <div className="freq-input-wrap">
            <input
              type="number" className="freq-input"
              value={mhz(sweepParams.startHz)}
              min={0.001} max={6000} step={1}
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
              min={0.001} max={6000} step={1}
              onChange={e => setSweepParams({ stopHz: Number(e.target.value) * 1e6 })}
              disabled={!connected || scanning}
            />
            <span className="freq-unit">MHz</span>
          </div>
        </label>

        <label className="sweep-field">
          <span>Points</span>
          <div className="freq-input-wrap">
            <select
              className="pts-select"
              value={sweepParams.points}
              onChange={e => setSweepParams({ points: Number(e.target.value) })}
              disabled={!connected || scanning}
            >
              {POINT_OPTIONS.map(n => {
                const segs = Math.ceil(n / maxPtsPerSeg);
                return (
                  <option key={n} value={n}>
                    {n}{!isSA && segs > 1 ? ` (${segs}× sweep)` : ''}
                  </option>
                );
              })}
            </select>
            {!isSA && numSegs > 1 && <span className="multiseg-badge">{numSegs}×</span>}
          </div>
        </label>

        {isSA && (
          <label className="sweep-field">
            <span>RBW</span>
            <div className="freq-input-wrap">
              <select
                className="pts-select"
                value={saRbwKhz}
                onChange={e => setSARbw(Number(e.target.value))}
                disabled={!connected || scanning}
              >
                {SA_RBW_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </label>
        )}

        <FreqPresets deviceType={deviceType} onSelect={handlePreset} />
      </div>

      <div className="sweep-controls">
        <button
          className={`btn-sweep${scanning ? ' scanning' : ''}`}
          onClick={sweep}
          disabled={!connected || scanning}
        >
          {scanning ? '⟳ Scanning…' : '▶ Sweep'}
        </button>

        {scanning && sweepSeg.total > 1 && (
          <span className="seg-info">{sweepSeg.done}/{sweepSeg.total} segs</span>
        )}

        {isSA && connected && (
          <button className="btn-sm" onClick={handleCalibrate} disabled={scanning}>
            ⚙ Calibrate
          </button>
        )}

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

        {lastSweepMs !== null && <span className="sweep-time">{lastSweepMs} ms</span>}

        <div className="export-btns">
          {hasVNAData && !isSA && (
            <>
              <button className="btn-sm" onClick={handleExportS2P}>↓ S2P</button>
              <button className="btn-sm" onClick={handleExportVNACSV}>↓ CSV</button>
            </>
          )}
          {hasSAData && isSA && (
            <button className="btn-sm" onClick={handleExportSACSV}>↓ CSV</button>
          )}
        </div>
      </div>

      {scanning && (
        <div className="progress-track">
          <div
            className="progress-fill"
            style={sweepSeg.total > 1
              ? { width: `${(sweepSeg.done / sweepSeg.total) * 100}%`, animation: 'none' }
              : undefined}
          />
        </div>
      )}

      {showCalModal && (
        <div className="cal-modal-overlay" onClick={() => setShowCalModal(false)}>
          <div className="cal-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-modal-title">TinySA Calibration</div>
            <div className="cal-modal-body">
              <p>Self-calibration procedure:</p>
              <ol>
                <li>Connect a short coax cable from the <strong>output</strong> port to the <strong>input</strong> port.</li>
                <li>Click <em>Run Cal</em> below — the device will measure its own output signal.</li>
                <li>Disconnect the calibration cable when done.</li>
              </ol>
              {calMsg && <div className="cal-result">{calMsg}</div>}
            </div>
            <div className="cal-modal-footer">
              <button className="btn-sm" onClick={handleCalibrate} disabled={scanning}>Run Cal</button>
              <button className="btn-sm" onClick={() => setShowCalModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
