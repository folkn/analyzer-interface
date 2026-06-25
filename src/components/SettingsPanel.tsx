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
    // Also push sweep defaults into serialStore so a reconnect uses them
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
        // Push imported sweep params to serialStore
        const s = useSettingsStore.getState().settings;
        serialStore.setSweepParams({ startHz: s.defaultStartHz, stopHz: s.defaultStopHz, points: s.defaultPoints });
        serialStore.setBaudRate(s.defaultBaudRate);
        serialStore.setAutoInterval(s.defaultAutoIntervalMs);
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
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
