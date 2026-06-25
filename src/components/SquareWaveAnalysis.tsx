import { useState, useMemo, useEffect, useCallback } from 'react';
import { useMarkerStore } from '../store/markerStore';
import { analyzeSquareWave, findPeakInRange, idealSquareWaveThd } from '../utils/squareWave';
import type { SquareWaveOverlay } from '../utils/squareWave';
import { formatFreq, formatVal } from '../utils/sparams';

const OVERLAY_COLORS = ['#22d3ee', '#a78bfa', '#fb923c', '#4ade80', '#f472b6'];
const MAX_ORDERS = [3, 5, 7, 9, 11, 13] as const;

function ordinal(n: number): string {
  const map: Record<number, string> = { 3: '3rd', 5: '5th', 7: '7th', 9: '9th', 11: '11th', 13: '13th' };
  return map[n] ?? `${n}th`;
}

interface Props {
  onOverlayChange: (overlay: SquareWaveOverlay | null) => void;
}

export default function SquareWaveAnalysis({ onOverlayChange }: Props) {
  const traces = useMarkerStore(s => s.traces);
  const addMarker = useMarkerStore(s => s.addMarker);
  const removeMarker = useMarkerStore(s => s.removeMarker);
  const setMarkerName = useMarkerStore(s => s.setMarkerName);

  const [traceId, setTraceId] = useState<'s11' | 's21'>('s21');
  const [manualMhz, setManualMhz] = useState('');
  const [useManual, setUseManual] = useState(false);
  const [maxOrder, setMaxOrder] = useState(9);
  const [overlayColor, setOverlayColor] = useState(OVERLAY_COLORS[0]);
  const [overlayOpacity, setOverlayOpacity] = useState(0.7);
  const [showOverlay, setShowOverlay] = useState(true);
  const [placedMarkerIds, setPlacedMarkerIds] = useState<string[]>([]);

  const trace = traces[traceId];
  const hasData = (trace?.points.length ?? 0) > 0;

  const autoPeak = useMemo(() => {
    if (!trace?.points.length) return null;
    return findPeakInRange(trace);
  }, [trace]);

  const fundamentalHz = useMemo(() => {
    if (useManual && manualMhz) {
      const v = parseFloat(manualMhz) * 1e6;
      return isNaN(v) ? (autoPeak?.freq ?? 0) : v;
    }
    return autoPeak?.freq ?? 0;
  }, [useManual, manualMhz, autoPeak]);

  const result = useMemo(() => {
    if (!trace?.points.length || fundamentalHz <= 0) return null;
    return analyzeSquareWave(trace, fundamentalHz, maxOrder);
  }, [trace, fundamentalHz, maxOrder]);

  useEffect(() => {
    if (!result || !showOverlay) {
      onOverlayChange(null);
      return;
    }
    onOverlayChange({ harmonics: result.harmonics, color: overlayColor, opacity: overlayOpacity });
  }, [result, showOverlay, overlayColor, overlayOpacity, onOverlayChange]);

  useEffect(() => () => { onOverlayChange(null); }, [onOverlayChange]);

  const placeMarkers = useCallback(() => {
    placedMarkerIds.forEach(id => removeMarker(id));
    if (!result) { setPlacedMarkerIds([]); return; }
    const newIds: string[] = [];
    result.harmonics.forEach(h => {
      if (!h.inRange) return;
      const id = addMarker(h.freq);
      setMarkerName(id, h.order === 1 ? 'F1' : `${h.order}F1`);
      newIds.push(id);
    });
    setPlacedMarkerIds(newIds);
  }, [result, placedMarkerIds, addMarker, removeMarker, setMarkerName]);

  const clearMarkers = useCallback(() => {
    placedMarkerIds.forEach(id => removeMarker(id));
    setPlacedMarkerIds([]);
  }, [placedMarkerIds, removeMarker]);

  const idealThd = idealSquareWaveThd(maxOrder);

  return (
    <div className="sqa-panel">
      <div className="tm-header">
        <span className="section-title">Square Wave Analysis</span>
        <span className="tm-subtitle">Odd harmonic detection &amp; ideal overlay</span>
      </div>

      {!hasData ? (
        <p className="tm-empty">No trace data — connect a device or wait for demo data.</p>
      ) : (
        <div className="sqa-body">

          {/* ── Controls ── */}
          <div className="sqa-controls">

            <div className="sqa-row">
              <span className="sqa-label">Trace</span>
              <select
                className="sqa-select"
                value={traceId}
                onChange={e => setTraceId(e.target.value as 's11' | 's21')}
              >
                <option value="s21">S21 — Transmission</option>
                <option value="s11">S11 — Reflection</option>
              </select>
            </div>

            <div className="sqa-row">
              <span className="sqa-label">Fundamental</span>
              <div className="sqa-freq-row">
                <label className="tm-radio">
                  <input
                    type="radio"
                    checked={!useManual}
                    onChange={() => { setUseManual(false); setManualMhz(''); }}
                  />
                  Auto&nbsp;
                  <span className="mono sqa-auto-freq">
                    ({autoPeak ? formatFreq(autoPeak.freq) : '—'})
                  </span>
                </label>
                <label className="tm-radio">
                  <input type="radio" checked={useManual} onChange={() => setUseManual(true)} />
                  Manual
                  <input
                    className="tm-freq-input"
                    type="number"
                    value={manualMhz}
                    placeholder="MHz"
                    min={0.001}
                    step={0.001}
                    onFocus={() => setUseManual(true)}
                    onChange={e => { setUseManual(true); setManualMhz(e.target.value); }}
                  />
                  MHz
                </label>
              </div>
            </div>

            <div className="sqa-row">
              <span className="sqa-label">Max order</span>
              <select
                className="sqa-select"
                value={maxOrder}
                onChange={e => setMaxOrder(Number(e.target.value))}
              >
                {MAX_ORDERS.map(n => (
                  <option key={n} value={n}>
                    {ordinal(n)} — {(n + 1) / 2} lines
                  </option>
                ))}
              </select>
            </div>

            <div className="sqa-row">
              <span className="sqa-label">Overlay</span>
              <div className="sqa-overlay-row">
                <label className="tm-radio">
                  <input
                    type="checkbox"
                    checked={showOverlay}
                    onChange={e => setShowOverlay(e.target.checked)}
                  />
                  Show
                </label>
                <div className="sqa-color-chips">
                  {OVERLAY_COLORS.map(c => (
                    <button
                      key={c}
                      className={`sqa-color-chip${overlayColor === c ? ' active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setOverlayColor(c)}
                      title={c}
                    />
                  ))}
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={overlayOpacity}
                  onChange={e => setOverlayOpacity(Number(e.target.value))}
                  className="sqa-opacity-slider"
                />
                <span className="sqa-opacity-val mono">{Math.round(overlayOpacity * 100)}%</span>
              </div>
            </div>

            <div className="sqa-actions">
              <button
                className="btn-sm"
                onClick={placeMarkers}
                disabled={!result}
                title="Place markers at fundamental and odd harmonics"
              >
                ⊕ Place Markers
              </button>
              {placedMarkerIds.length > 0 && (
                <button className="btn-sm" onClick={clearMarkers}>
                  ✕ Clear Markers
                </button>
              )}
            </div>
          </div>

          {/* ── Results ── */}
          {result && (
            <div className="sqa-results">
              <div className="sqa-result-hdr">
                <span className="sqa-result-title">Harmonic Table</span>
                <div className="sqa-thd-group">
                  {result.thdPercent !== undefined && (
                    <span className="sqa-thd mono">
                      Measured THD&nbsp;=&nbsp;{result.thdPercent.toFixed(1)}%
                    </span>
                  )}
                  <span className="sqa-thd-ideal mono">
                    Ideal sq.wave&nbsp;≈&nbsp;{idealThd.toFixed(1)}%
                  </span>
                </div>
              </div>

              <table className="sqa-table">
                <thead>
                  <tr>
                    <th>n</th>
                    <th>Frequency</th>
                    <th className="sqa-th-ideal">Ideal (dB)</th>
                    <th>Measured (dB)</th>
                    <th>Δ (dB)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.harmonics.map(h => (
                    <tr key={h.order} className={!h.inRange ? 'sqa-row-oor' : ''}>
                      <td className="mono sqa-order-cell" style={{ color: overlayColor }}>
                        {h.order === 1 ? 'F₁' : `${h.order}F₁`}
                      </td>
                      <td className="mono">{formatFreq(h.freq)}</td>
                      <td className="mono" style={{ color: overlayColor, opacity: 0.85 }}>
                        {isFinite(h.idealDb) ? formatVal(h.idealDb, ' dB', 1) : '—'}
                      </td>
                      <td className="mono">
                        {!h.inRange
                          ? <span className="sqa-oor">out of range</span>
                          : formatVal(h.measuredDb, ' dB', 1)
                        }
                      </td>
                      <td className={`mono ${
                        h.diff === undefined ? ''
                          : Math.abs(h.diff) > 3 ? 'tm-bad'
                          : Math.abs(h.diff) > 1 ? 'tm-warn'
                          : 'tm-good'
                      }`}>
                        {h.diff !== undefined
                          ? `${h.diff >= 0 ? '+' : ''}${h.diff.toFixed(1)}`
                          : '—'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="sqa-note">
                Ideal: nth harmonic decays as 1/n amplitude → −20·log₁₀(n) dB relative to F₁
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
