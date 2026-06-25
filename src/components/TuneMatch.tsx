import { useState, useMemo } from 'react';
import { useMarkerStore } from '../store/markerStore';
import { computeAntennaMetrics, solveLNetwork, gammaToZ } from '../utils/matching';
import { interpolatePoint, formatFreq } from '../utils/sparams';

function fmtZ(z: { re: number; im: number }): string {
  if (!isFinite(z.re) || !isFinite(z.im)) return '∞ (open)';
  const sign = z.im >= 0 ? '+' : '−';
  return `${z.re.toFixed(2)} ${sign} j${Math.abs(z.im).toFixed(2)} Ω`;
}

export default function TuneMatch() {
  const traces = useMarkerStore(s => s.traces);
  const [manualMhz, setManualMhz] = useState('');
  const [useManual, setUseManual] = useState(false);

  const s11pts = useMemo(() => traces.s11?.points ?? [], [traces.s11]);

  const metrics = useMemo(() => computeAntennaMetrics(s11pts), [s11pts]);

  const targetHz = useMemo(() => {
    if (useManual && manualMhz) {
      const v = parseFloat(manualMhz) * 1e6;
      return isNaN(v) ? metrics.resonantFreq : v;
    }
    return metrics.resonantFreq;
  }, [useManual, manualMhz, metrics.resonantFreq]);

  const matchData = useMemo(() => {
    if (!s11pts.length || targetHz === 0) return null;
    const pt = interpolatePoint(s11pts, targetHz);
    if (!pt) return null;
    const ZL = gammaToZ(pt.re, pt.im);
    const networks = solveLNetwork(ZL, targetHz);
    return { ZL, networks };
  }, [s11pts, targetHz]);

  const hasData = s11pts.length > 0;

  return (
    <div className="tune-match">
      <div className="tm-header">
        <span className="section-title">Tune &amp; Match Helper</span>
        <span className="tm-subtitle">L-network calculator from live S11</span>
      </div>

      {!hasData ? (
        <p className="tm-empty">No S11 data. Connect a device or wait for demo data.</p>
      ) : (
        <div className="tm-body">

          {/* ── Antenna Metrics ── */}
          <div className="tm-section">
            <div className="tm-section-title">Antenna Metrics (S11 minimum)</div>
            <div className="tm-metrics-grid">
              <div className="tm-metric">
                <span className="tm-metric-label">Resonant freq</span>
                <span className="tm-metric-value mono">{formatFreq(metrics.resonantFreq)}</span>
              </div>
              <div className="tm-metric">
                <span className="tm-metric-label">S11 at resonance</span>
                <span className="tm-metric-value mono">{metrics.resonantS11dB.toFixed(1)} dB</span>
              </div>
              <div className="tm-metric">
                <span className="tm-metric-label">VSWR at resonance</span>
                <span className={`tm-metric-value mono${metrics.resonantVSWR <= 2 ? ' tm-good' : metrics.resonantVSWR <= 3 ? ' tm-warn' : ' tm-bad'}`}>
                  {isFinite(metrics.resonantVSWR) ? metrics.resonantVSWR.toFixed(2) : '∞'}
                </span>
              </div>
              <div className="tm-metric">
                <span className="tm-metric-label">Impedance at res.</span>
                <span className="tm-metric-value mono">{fmtZ(metrics.resonantZ)}</span>
              </div>
              {metrics.bw10dB && (
                <div className="tm-metric tm-metric-wide">
                  <span className="tm-metric-label">BW (−10 dB S11)</span>
                  <span className="tm-metric-value mono">
                    {formatFreq(metrics.bw10dB.low)} – {formatFreq(metrics.bw10dB.high)}
                    <span className="tm-bw-detail"> &nbsp;({formatFreq(metrics.bw10dB.bw)} wide)</span>
                  </span>
                </div>
              )}
              {metrics.bw6dB && (
                <div className="tm-metric tm-metric-wide">
                  <span className="tm-metric-label">BW (−6 dB S11)</span>
                  <span className="tm-metric-value mono">
                    {formatFreq(metrics.bw6dB.low)} – {formatFreq(metrics.bw6dB.high)}
                    <span className="tm-bw-detail"> &nbsp;({formatFreq(metrics.bw6dB.bw)} wide)</span>
                  </span>
                </div>
              )}
              {metrics.loadedQ !== null && (
                <div className="tm-metric">
                  <span className="tm-metric-label">Loaded Q (from BW)</span>
                  <span className="tm-metric-value mono">{metrics.loadedQ.toFixed(1)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Matching network ── */}
          <div className="tm-section">
            <div className="tm-section-title">L-Network to 50 Ω</div>

            <div className="tm-target-row">
              <span className="tm-target-label">Match at:</span>
              <label className="tm-radio">
                <input
                  type="radio"
                  checked={!useManual}
                  onChange={() => setUseManual(false)}
                />
                Resonant ({formatFreq(metrics.resonantFreq)})
              </label>
              <label className="tm-radio">
                <input
                  type="radio"
                  checked={useManual}
                  onChange={() => setUseManual(true)}
                />
                Manual:
                <input
                  type="number"
                  className="tm-freq-input"
                  value={manualMhz}
                  placeholder="MHz"
                  min={0.05} max={4400} step={0.1}
                  onFocus={() => setUseManual(true)}
                  onChange={e => { setUseManual(true); setManualMhz(e.target.value); }}
                />
                MHz
              </label>
            </div>

            {matchData && (
              <>
                <div className="tm-zl-row">
                  <span className="tm-zl-label">ZL @ {formatFreq(targetHz)}</span>
                  <span className="tm-zl-value mono">{fmtZ(matchData.ZL)}</span>
                </div>

                {matchData.networks.length === 0 ? (
                  <div className="tm-no-match">
                    No L-network solution (R<sub>L</sub> ≤ 0 — check S11 calibration or try a different frequency).
                  </div>
                ) : (
                  <div className="tm-networks">
                    {matchData.networks.map((net, i) => (
                      <div key={i} className="tm-network-card">
                        <div className="tm-network-hdr">
                          <span className="tm-network-idx">{i + 1}</span>
                          <span className="tm-network-label">{net.label}</span>
                          <span className="tm-network-q">Q = {net.Q.toFixed(2)}</span>
                        </div>
                        <div className="tm-network-elements">
                          <div className="tm-element">
                            <span className="tm-el-side">Source ←</span>
                            {net.el1.type === 'none' ? (
                              <span className="tm-el-none">short</span>
                            ) : (
                              <>
                                <span className={`tm-el-type tm-el-${net.el1.type.toLowerCase()}`}>
                                  {net.el1.type}
                                </span>
                                <span className="tm-el-placement">{net.el1.placement}</span>
                                <span className="tm-el-value mono">{net.el1.valueFmt}</span>
                              </>
                            )}
                          </div>
                          <div className="tm-el-divider">|</div>
                          <div className="tm-element">
                            <span className="tm-el-side">→ Load</span>
                            {net.el2.type === 'none' ? (
                              <span className="tm-el-none">short</span>
                            ) : (
                              <>
                                <span className={`tm-el-type tm-el-${net.el2.type.toLowerCase()}`}>
                                  {net.el2.type}
                                </span>
                                <span className="tm-el-placement">{net.el2.placement}</span>
                                <span className="tm-el-value mono">{net.el2.valueFmt}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
