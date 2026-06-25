import { useState, useMemo } from 'react';
import { useMarkerStore } from '../store/markerStore';
import { computeAntennaMetrics, computeS21Metrics } from '../utils/matching';
import { formatFreq } from '../utils/sparams';

// Standard capacitor series
const E12_BASE = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const E24_BASE = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
                  3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];

function expandSeries(base: number[], minPf = 1, maxPf = 1500): number[] {
  const out: number[] = [];
  for (const mult of [1, 10, 100, 1000]) {
    for (const b of base) {
      const v = parseFloat((b * mult).toFixed(1));
      if (v >= minPf && v <= maxPf) out.push(v);
    }
  }
  return out.sort((a, b) => a - b);
}

const E12_ALL = expandSeries(E12_BASE);
const E24_ALL = expandSeries(E24_BASE);

function nearest(target: number, values: number[], n = 4): Array<{ v: number; pct: number }> {
  return [...values]
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
    .slice(0, n)
    .sort((a, b) => a - b)
    .map(v => ({ v, pct: (v - target) / target * 100 }));
}

function bestTwoPar(target: number, values: number[]): { c1: number; c2: number; total: number; pct: number } | null {
  let best: { c1: number; c2: number; total: number; err: number } | null = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= target) break;
    for (let j = i; j < values.length; j++) {
      const total = values[i] + values[j];
      const err = Math.abs(total - target);
      if (!best || err < best.err) best = { c1: values[i], c2: values[j], total, err };
      if (total > target * 1.5) break;
    }
  }
  if (!best) return null;
  return { c1: best.c1, c2: best.c2, total: best.total, pct: (best.total - target) / target * 100 };
}

function fmtPf(pf: number): string {
  if (pf >= 1000) return `${(pf / 1000).toFixed(2)} nF`;
  if (pf >= 10)   return `${pf.toFixed(0)} pF`;
  return `${pf.toFixed(1)} pF`;
}

function fmtNh(nh: number): string {
  if (nh >= 1000) return `${(nh / 1000).toFixed(2)} μH`;
  return `${nh.toFixed(1)} nH`;
}

// Larmor frequencies for common MRI systems
const MRI_PRESETS = [
  { label: '1.5T ¹H',  f: 63.87  },
  { label: '3T ¹H',    f: 127.74 },
  { label: '7T ¹H',    f: 297.20 },
  { label: '9.4T ¹H',  f: 400.00 },
  { label: '3T ³¹P',   f: 51.70  },
  { label: '3T ²³Na',  f: 33.79  },
  { label: '3T ¹³C',   f: 32.13  },
];

const SEGMENT_OPTIONS = [1, 2, 4, 6, 8, 10, 12, 16, 24, 32];

type ProbeMode = 's11' | 's21';

export default function MriCoilTuner() {
  const traces = useMarkerStore(s => s.traces);
  const [probeMode, setProbeMode] = useState<ProbeMode>('s11');
  const [numSegments, setNumSegments] = useState(8);
  const [capInput, setCapInput]       = useState('56');
  const [targetInput, setTargetInput] = useState('127.74');

  const s11pts = useMemo(() => traces.s11?.points ?? [], [traces.s11]);
  const s21pts = useMemo(() => traces.s21?.points ?? [], [traces.s21]);

  const s11metrics = useMemo(() => computeAntennaMetrics(s11pts), [s11pts]);
  const s21metrics = useMemo(() => computeS21Metrics(s21pts),      [s21pts]);

  const hasS11 = s11pts.length > 0 && s11metrics.resonantFreq > 0;
  const hasS21 = s21pts.length > 0 && s21metrics.peakFreq > 0;
  const hasData = probeMode === 's11' ? hasS11 : hasS21;

  // Resonant frequency comes from either S11 dip or S21 peak
  const fCurrent = probeMode === 's11' ? s11metrics.resonantFreq : s21metrics.peakFreq;

  const capPf    = parseFloat(capInput)    || 0;
  const targetHz = parseFloat(targetInput) * 1e6 || 0;

  // Estimated loop inductance: C_eff = C_each / N_segments  →  L = 1/(ω² C_eff)
  const inductanceNh = useMemo(() => {
    if (!fCurrent || !capPf || !numSegments) return null;
    const omega = 2 * Math.PI * fCurrent;
    const cEff  = (capPf * 1e-12) / numSegments;
    return 1e9 / (omega * omega * cEff);
  }, [fCurrent, capPf, numSegments]);

  // Required cap per segment: C_new = C_old × (f_current / f_target)²
  const reqCapPf = useMemo(() => {
    if (!fCurrent || !targetHz || !capPf) return null;
    return capPf * (fCurrent / targetHz) ** 2;
  }, [fCurrent, targetHz, capPf]);

  const e12Sug = useMemo(() => (reqCapPf ? nearest(reqCapPf, E12_ALL) : []), [reqCapPf]);
  const e24Sug = useMemo(() => (reqCapPf ? nearest(reqCapPf, E24_ALL) : []), [reqCapPf]);
  const parSug = useMemo(() => (reqCapPf ? bestTwoPar(reqCapPf, E12_ALL) : null), [reqCapPf]);

  const freqDeltaMhz = hasData && targetHz ? (fCurrent - targetHz) / 1e6 : null;
  const direction    = freqDeltaMhz !== null
    ? (freqDeltaMhz > 0.05 ? '↓ decrease cap' : freqDeltaMhz < -0.05 ? '↑ increase cap' : '✓ on target')
    : null;

  // S11 match quality (only relevant in S11 mode)
  const matchQuality = s11metrics.resonantVSWR <= 1.5 ? 'good'
    : s11metrics.resonantVSWR <= 2.5 ? 'fair' : 'poor';

  return (
    <div className="mri-tuner">

      {/* ── Measurement mode selector ── */}
      <div className="mri-mode-bar">
        <span className="mri-mode-label">Measurement mode</span>
        <button
          className={`mri-mode-btn${probeMode === 's11' ? ' active' : ''}`}
          onClick={() => setProbeMode('s11')}
        >
          S11 — Reflection
          <span className="mri-mode-hint">dip = resonance</span>
        </button>
        <button
          className={`mri-mode-btn${probeMode === 's21' ? ' active' : ''}`}
          onClick={() => setProbeMode('s21')}
          disabled={!hasS21 && s21pts.length === 0}
        >
          S21 — Coupling probe
          <span className="mri-mode-hint">peak = resonance</span>
        </button>
      </div>

      <div className="mri-cols">

        {/* ── Left: Live measurements ── */}
        <div className="mri-panel">
          <div className="mri-sec-title">
            {probeMode === 's11' ? 'Live S11 Measurements' : 'Live S21 Coupling Probe'}
          </div>

          {!hasData ? (
            <p className="tm-empty">
              {probeMode === 's21' && !hasS21
                ? 'No S21 data. Ensure port 2 is connected to the coupling probe.'
                : 'No data available.'}
            </p>
          ) : probeMode === 's11' ? (
            /* S11 mode metrics */
            <div className="mri-metrics">
              <div className="mri-metric">
                <span className="mri-lbl">Resonant freq (S11 dip)</span>
                <span className="mri-val mono">{formatFreq(s11metrics.resonantFreq)}</span>
              </div>
              <div className="mri-metric">
                <span className="mri-lbl">Return loss</span>
                <span className="mri-val mono">{s11metrics.resonantS11dB.toFixed(1)} dB</span>
              </div>
              <div className="mri-metric">
                <span className="mri-lbl">VSWR</span>
                <span className={`mri-val mono tm-${matchQuality === 'good' ? 'good' : matchQuality === 'fair' ? 'warn' : 'bad'}`}>
                  {isFinite(s11metrics.resonantVSWR) ? s11metrics.resonantVSWR.toFixed(2) : '∞'}
                  <span className="mri-vswr-q"> — {matchQuality}</span>
                </span>
              </div>
              {s11metrics.bw10dB && (
                <div className="mri-metric">
                  <span className="mri-lbl">BW (−10 dB S11)</span>
                  <span className="mri-val mono">{formatFreq(s11metrics.bw10dB.bw)}</span>
                </div>
              )}
              {s11metrics.loadedQ !== null && (
                <div className="mri-metric">
                  <span className="mri-lbl">Loaded Q</span>
                  <span className="mri-val mono">{s11metrics.loadedQ.toFixed(1)}</span>
                </div>
              )}
              {inductanceNh !== null && (
                <div className="mri-metric">
                  <span className="mri-lbl">Est. inductance</span>
                  <span className="mri-val mono">{fmtNh(inductanceNh)}</span>
                </div>
              )}
              {freqDeltaMhz !== null && Math.abs(freqDeltaMhz) > 0.01 && (
                <div className="mri-metric">
                  <span className="mri-lbl">Δ to target</span>
                  <span className={`mri-val mono ${Math.abs(freqDeltaMhz) < 1 ? 'tm-good' : Math.abs(freqDeltaMhz) < 5 ? 'tm-warn' : 'tm-bad'}`}>
                    {freqDeltaMhz > 0 ? '+' : ''}{freqDeltaMhz.toFixed(3)} MHz
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* S21 coupling probe mode metrics */
            <div className="mri-metrics">
              <div className="mri-metric">
                <span className="mri-lbl">Resonant freq (S21 peak)</span>
                <span className="mri-val mono">{formatFreq(s21metrics.peakFreq)}</span>
              </div>
              <div className="mri-metric">
                <span className="mri-lbl">S21 peak (coupling level)</span>
                <span className="mri-val mono">{s21metrics.peakS21dB.toFixed(1)} dB</span>
              </div>
              {s21metrics.bw3dB && (
                <div className="mri-metric">
                  <span className="mri-lbl">BW (−3 dB)</span>
                  <span className="mri-val mono">{formatFreq(s21metrics.bw3dB.bw)}</span>
                </div>
              )}
              {s21metrics.bw6dB && (
                <div className="mri-metric">
                  <span className="mri-lbl">BW (−6 dB)</span>
                  <span className="mri-val mono">{formatFreq(s21metrics.bw6dB.bw)}</span>
                </div>
              )}
              {s21metrics.Q3dB !== null && (
                <div className="mri-metric">
                  <span className="mri-lbl">Q (from −3 dB BW) ≈ Q<sub>u</sub></span>
                  <span className="mri-val mono">{s21metrics.Q3dB.toFixed(1)}</span>
                </div>
              )}
              {inductanceNh !== null && (
                <div className="mri-metric">
                  <span className="mri-lbl">Est. inductance</span>
                  <span className="mri-val mono">{fmtNh(inductanceNh)}</span>
                </div>
              )}
              {freqDeltaMhz !== null && Math.abs(freqDeltaMhz) > 0.01 && (
                <div className="mri-metric">
                  <span className="mri-lbl">Δ to target</span>
                  <span className={`mri-val mono ${Math.abs(freqDeltaMhz) < 1 ? 'tm-good' : Math.abs(freqDeltaMhz) < 5 ? 'tm-warn' : 'tm-bad'}`}>
                    {freqDeltaMhz > 0 ? '+' : ''}{freqDeltaMhz.toFixed(3)} MHz
                  </span>
                </div>
              )}
              {hasS11 && (
                <div className="mri-metric mri-crossref">
                  <span className="mri-lbl">S11 at probe resonance</span>
                  <span className="mri-val mono">{s11metrics.resonantS11dB.toFixed(1)} dB</span>
                </div>
              )}
              <p className="mri-probe-note">
                Coupling probe Q ≈ unloaded Q when probe coupling is weak (S21 peak well below 0 dB).
              </p>
            </div>
          )}
        </div>

        {/* ── Right: Tuning calculator ── */}
        <div className="mri-panel mri-calc-panel">
          <div className="mri-sec-title">Tuning Calculator</div>

          <div className="mri-form">
            <div className="mri-form-row">
              <label className="mri-lbl">Segments (caps)</label>
              <select className="sf-select" value={numSegments}
                onChange={e => setNumSegments(Number(e.target.value))}>
                {SEGMENT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="mri-form-row">
              <label className="mri-lbl">Tuning cap / segment</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={capInput} min={0.1} max={10000} step={0.1}
                  onChange={e => setCapInput(e.target.value)} />
                <span className="sf-unit">pF</span>
              </div>
            </div>

            <div className="mri-form-row">
              <label className="mri-lbl">Target frequency</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={targetInput} min={0.1} max={4400} step={0.01}
                  onChange={e => setTargetInput(e.target.value)} />
                <span className="sf-unit">MHz</span>
              </div>
            </div>

            <div className="mri-presets">
              {MRI_PRESETS.map(p => (
                <button
                  key={p.label}
                  className={`mri-preset${Math.abs(parseFloat(targetInput) - p.f) < 0.01 ? ' active' : ''}`}
                  onClick={() => setTargetInput(String(p.f))}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {reqCapPf !== null && hasData ? (
            <div className="mri-results">
              <div className="mri-req-row">
                <span className="mri-req-label">Required cap / segment</span>
                <span className="mri-req-val mono">{fmtPf(reqCapPf)}</span>
                {direction && (
                  <span className={`mri-dir ${freqDeltaMhz! > 0.05 ? 'mri-dec' : freqDeltaMhz! < -0.05 ? 'mri-inc' : 'mri-ok'}`}>
                    {direction}
                  </span>
                )}
              </div>

              <div className="mri-sug-groups">
                <div className="mri-sug-group">
                  <div className="mri-sug-hdr">E12 nearest single cap</div>
                  <div className="mri-chips">
                    {e12Sug.map(({ v, pct }) => (
                      <div key={v} className={`mri-chip${Math.abs(pct) < 5 ? ' best' : ''}`}>
                        <span className="mono">{fmtPf(v)}</span>
                        <span className="mri-pct">{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mri-sug-group">
                  <div className="mri-sug-hdr">E24 nearest single cap</div>
                  <div className="mri-chips">
                    {e24Sug.map(({ v, pct }) => (
                      <div key={v} className={`mri-chip${Math.abs(pct) < 3 ? ' best' : ''}`}>
                        <span className="mono">{fmtPf(v)}</span>
                        <span className="mri-pct">{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {parSug && (
                  <div className="mri-sug-group">
                    <div className="mri-sug-hdr">E12 parallel pair</div>
                    <div className="mri-par-row">
                      <span className="mri-chip best"><span className="mono">{fmtPf(parSug.c1)}</span></span>
                      <span className="mri-sym">‖</span>
                      <span className="mri-chip best"><span className="mono">{fmtPf(parSug.c2)}</span></span>
                      <span className="mri-sym">=</span>
                      <span className="mri-par-total mono">{fmtPf(parSug.total)}</span>
                      <span className="mri-pct">{parSug.pct >= 0 ? '+' : ''}{parSug.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="tm-empty mri-no-data">
              {!hasData
                ? `Connect a device or switch to a mode with data to enable cap suggestions.`
                : 'Enter cap value and target frequency above.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
