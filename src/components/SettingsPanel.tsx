import { useRef, useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useSerialStore, BAUD_RATES, POINT_OPTIONS } from '../store/serialStore';

interface Props {
  onClose: () => void;
}

function mhz(hz: number) { return (hz / 1e6).toFixed(3); }

export default function SettingsPanel({ onClose }: Props) {
  const { settings, isDirty, update, saveAsDefault, resetToFactory, exportJSON, importJSON } =
    useSettingsStore();
  const serialStore = useSerialStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [importOk, setImportOk] = useState(false);

  function handleSaveAsDefault() {
    saveAsDefault();
    serialStore.setSweepParams({
      startHz: settings.defaultStartHz,
      stopHz:  settings.defaultStopHz,
      points:  settings.defaultPoints,
    });
    serialStore.setBaudRate(settings.defaultBaudRate);
    serialStore.setAutoInterval(settings.defaultAutoIntervalMs);
  }

  function handleImportClick() {
    setImportError('');
    setImportOk(false);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const err = importJSON(ev.target?.result as string);
      if (err) {
        setImportError(err);
        setImportOk(false);
      } else {
        setImportOk(true);
        setImportError('');
        const s = useSettingsStore.getState().settings;
        serialStore.setSweepParams({ startHz: s.defaultStartHz, stopHz: s.defaultStopHz, points: s.defaultPoints });
        serialStore.setBaudRate(s.defaultBaudRate);
        serialStore.setAutoInterval(s.defaultAutoIntervalMs);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleReset() {
    if (!confirm('Reset all settings to factory defaults?')) return;
    resetToFactory();
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">

          {/* ── Device mode ────────────────────────────── */}
          <section className="sf-section">
            <div className="sf-section-title">Device Mode (Demo)</div>
            <div className="sf-grid">
              <label className="sf-label">Default mode</label>
              <div className="sf-row">
                <label className="sf-radio">
                  <input type="radio" name="devmode" value="vna"
                    checked={settings.deviceMode === 'vna'}
                    onChange={() => update({ deviceMode: 'vna' })} />
                  VNA (NanoVNA)
                </label>
                <label className="sf-radio">
                  <input type="radio" name="devmode" value="sa"
                    checked={settings.deviceMode === 'sa'}
                    onChange={() => update({ deviceMode: 'sa' })} />
                  Spectrum Analyzer (TinySA)
                </label>
              </div>
              <label className="sf-label" style={{ gridColumn: '1 / -1', color: 'var(--c-text-muted)', fontSize: 11 }}>
                When disconnected, controls which demo data is shown. Auto-detected on connect.
              </label>
            </div>
          </section>

          {/* ── SA Settings ─────────────────────────────── */}
          <section className="sf-section">
            <div className="sf-section-title">Spectrum Analyzer (TinySA)</div>
            <div className="sf-grid">
              <label className="sf-label">SA Y min</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={settings.saYMin} min={-140} max={-10} step={5}
                  onChange={e => update({ saYMin: Number(e.target.value) })} />
                <span className="sf-unit">dBm</span>
              </div>

              <label className="sf-label">SA Y max</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={settings.saYMax} min={-30} max={0} step={5}
                  onChange={e => update({ saYMax: Number(e.target.value) })} />
                <span className="sf-unit">dBm</span>
              </div>

              <label className="sf-label">Default RBW</label>
              <div className="sf-row">
                <select className="sf-select"
                  value={settings.saRbwKhz}
                  onChange={e => update({ saRbwKhz: Number(e.target.value) })}>
                  <option value={0}>Auto</option>
                  <option value={3}>3 kHz</option>
                  <option value={10}>10 kHz</option>
                  <option value={30}>30 kHz</option>
                  <option value={100}>100 kHz</option>
                  <option value={300}>300 kHz</option>
                  <option value={1000}>1 MHz</option>
                  <option value={3000}>3 MHz</option>
                </select>
              </div>
            </div>
          </section>

          {/* ── Appearance ─────────────────────────────── */}
          <section className="sf-section">
            <div className="sf-section-title">Appearance</div>
            <div className="sf-grid">
              <label className="sf-label">Theme</label>
              <div className="sf-row">
                <label className="sf-radio">
                  <input
                    type="radio"
                    name="theme"
                    value="dark"
                    checked={settings.theme === 'dark'}
                    onChange={() => update({ theme: 'dark' })}
                  />
                  Dark
                </label>
                <label className="sf-radio">
                  <input
                    type="radio"
                    name="theme"
                    value="light"
                    checked={settings.theme === 'light'}
                    onChange={() => update({ theme: 'light' })}
                  />
                  Light
                </label>
              </div>

              <label className="sf-label">Major grid lines</label>
              <div className="sf-row">
                <input
                  type="checkbox"
                  className="sf-checkbox"
                  checked={settings.showMajorGrid}
                  onChange={e => update({ showMajorGrid: e.target.checked })}
                />
              </div>

              <label className="sf-label">Minor grid lines</label>
              <div className="sf-row">
                <input
                  type="checkbox"
                  className="sf-checkbox"
                  checked={settings.showMinorGrid}
                  onChange={e => update({ showMinorGrid: e.target.checked })}
                />
              </div>
            </div>
          </section>

          {/* ── Sweep defaults ─────────────────────────── */}
          <section className="sf-section">
            <div className="sf-section-title">Default Sweep</div>
            <div className="sf-grid">
              <label className="sf-label">Start frequency</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={mhz(settings.defaultStartHz)} min={0.05} max={4400} step={1}
                  onChange={e => update({ defaultStartHz: Number(e.target.value) * 1e6 })} />
                <span className="sf-unit">MHz</span>
              </div>

              <label className="sf-label">Stop frequency</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={mhz(settings.defaultStopHz)} min={0.05} max={4400} step={1}
                  onChange={e => update({ defaultStopHz: Number(e.target.value) * 1e6 })} />
                <span className="sf-unit">MHz</span>
              </div>

              <label className="sf-label">Points</label>
              <div className="sf-row">
                <select className="sf-select"
                  value={settings.defaultPoints}
                  onChange={e => update({ defaultPoints: Number(e.target.value) })}>
                  {POINT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <label className="sf-label">Max pts per segment</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={settings.maxPtsPerSeg} min={51} max={1001} step={1}
                  onChange={e => update({ maxPtsPerSeg: Math.max(51, Math.min(1001, Number(e.target.value))) })} />
                <span className="sf-unit">pts</span>
              </div>

              <label className="sf-label">Auto-sweep interval</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={(settings.defaultAutoIntervalMs / 1000).toFixed(1)}
                  min={0.5} max={60} step={0.5}
                  onChange={e => update({ defaultAutoIntervalMs: Number(e.target.value) * 1000 })} />
                <span className="sf-unit">s</span>
              </div>

              <label className="sf-label">Default baud rate</label>
              <div className="sf-row">
                <select className="sf-select"
                  value={settings.defaultBaudRate}
                  onChange={e => update({ defaultBaudRate: Number(e.target.value) })}>
                  {BAUD_RATES.map(b => <option key={b} value={b}>{b.toLocaleString()}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* ── Plot axes ──────────────────────────────── */}
          <section className="sf-section">
            <div className="sf-section-title">Plot Axes</div>
            <div className="sf-grid">
              <label className="sf-label">Magnitude Y min</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={settings.magYMin} min={-200} max={-1} step={1}
                  onChange={e => update({ magYMin: Number(e.target.value) })} />
                <span className="sf-unit">dB</span>
              </div>

              <label className="sf-label">Magnitude Y max</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={settings.magYMax} min={0} max={60} step={1}
                  onChange={e => update({ magYMax: Number(e.target.value) })} />
                <span className="sf-unit">dB</span>
              </div>

              <label className="sf-label">Phase Y min</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={settings.phaseYMin} min={-360} max={-1} step={10}
                  onChange={e => update({ phaseYMin: Number(e.target.value) })} />
                <span className="sf-unit">°</span>
              </div>

              <label className="sf-label">Phase Y max</label>
              <div className="sf-row">
                <input type="number" className="sf-input"
                  value={settings.phaseYMax} min={1} max={360} step={10}
                  onChange={e => update({ phaseYMax: Number(e.target.value) })} />
                <span className="sf-unit">°</span>
              </div>
            </div>
          </section>
        </div>

        {/* ── Footer actions ─────────────────────────── */}
        <div className="settings-footer">
          <div className="sf-footer-left">
            <button className="btn-reset" onClick={handleReset}>Reset to factory</button>
          </div>
          <div className="sf-footer-right">
            <button className="btn-sm" onClick={handleImportClick}>↑ Import JSON</button>
            <button className="btn-sm" onClick={exportJSON}>↓ Export JSON</button>
            <button
              className={`btn-save${isDirty ? ' unsaved' : ''}`}
              onClick={handleSaveAsDefault}
            >
              {isDirty ? '● Save as Default' : '✓ Saved'}
            </button>
          </div>
        </div>

        {importError && <div className="import-error">Import error: {importError}</div>}
        {importOk && <div className="import-ok">Settings imported and saved.</div>}

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
