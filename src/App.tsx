import { useEffect, useState } from 'react';
import { useMarkerStore } from './store/markerStore';
import { useSerialStore } from './store/serialStore';
import { useSettingsStore, getChartColors } from './store/settingsStore';
import { generateSampleData } from './utils/sampleData';
import RectPlot from './components/RectPlot';
import SmithChart from './components/SmithChart';
import MarkerTable from './components/MarkerTable';
import ConnectionBar from './components/ConnectionBar';
import SweepPanel from './components/SweepPanel';
import SettingsPanel from './components/SettingsPanel';
import TuneMatch from './components/TuneMatch';
import './App.css';

export default function App() {
  const { setTraces, traces } = useMarkerStore();
  const connState = useSerialStore(s => s.connState);
  const { settings, update } = useSettingsStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showTuneMatch, setShowTuneMatch] = useState(false);

  // Apply theme to document root so CSS variables take effect
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Generate demo data from current default range when disconnected
  useEffect(() => {
    if (connState === 'disconnected' && !traces.s11) {
      const demo = generateSampleData(settings.defaultStartHz, settings.defaultStopHz, 401);
      setTraces({ s11: demo.s11, s21: demo.s21 });
    }
  }, [connState, settings.defaultStartHz, settings.defaultStopHz]);

  function toggleTheme() {
    const next = settings.theme === 'dark' ? 'light' : 'dark';
    update({ theme: next });
    // Persist immediately — theme toggle always auto-saves
    useSettingsStore.getState().saveAsDefault();
  }

  const colors = getChartColors(settings.theme);
  const enabledTraces = [traces.s11, traces.s21].filter(Boolean) as any[];
  const isDemo = connState === 'disconnected' || connState === 'error';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="app-title">S-Parameter Analyzer</span>
          {isDemo && <span className="demo-badge">DEMO</span>}
        </div>
        <div className="header-right">
          <button
            className="btn-theme"
            onClick={toggleTheme}
            title={`Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {settings.theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
          <button
            className={`btn-settings${showSettings ? ' active' : ''}`}
            onClick={() => setShowSettings(v => !v)}
            title="Settings"
          >
            ⚙ Settings
          </button>
          <ConnectionBar />
        </div>
      </header>

      <SweepPanel />

      <div className="plots-grid">
        <RectPlot
          title="S11 / S21 — Magnitude"
          yLabel="dB"
          mode="mag"
          traces={enabledTraces}
          yMin={settings.magYMin}
          yMax={settings.magYMax}
          showMajorGrid={settings.showMajorGrid}
          showMinorGrid={settings.showMinorGrid}
          colors={colors}
        />
        <RectPlot
          title="S11 / S21 — Phase"
          yLabel="degrees"
          mode="phase"
          traces={enabledTraces}
          yMin={settings.phaseYMin}
          yMax={settings.phaseYMax}
          showMajorGrid={settings.showMajorGrid}
          showMinorGrid={settings.showMinorGrid}
          colors={colors}
        />
        <SmithChart s11={traces.s11} colors={colors} />
      </div>

      <MarkerTable />

      {/* ── Tools panel ── */}
      <div className="tools-panel">
        <div className="tools-tabs">
          <button
            className={`tools-tab${showTuneMatch ? ' active' : ''}`}
            onClick={() => setShowTuneMatch(v => !v)}
          >
            ◎ Tune &amp; Match
          </button>
        </div>
        {showTuneMatch && <TuneMatch />}
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
