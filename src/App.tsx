import { useEffect, useState } from 'react';
import { useMarkerStore } from './store/markerStore';
import { useSerialStore } from './store/serialStore';
import { useSettingsStore } from './store/settingsStore';
import { generateSampleData } from './utils/sampleData';
import RectPlot from './components/RectPlot';
import SmithChart from './components/SmithChart';
import MarkerTable from './components/MarkerTable';
import ConnectionBar from './components/ConnectionBar';
import SweepPanel from './components/SweepPanel';
import SettingsPanel from './components/SettingsPanel';
import './App.css';

export default function App() {
  const { setTraces, traces } = useMarkerStore();
  const connState = useSerialStore(s => s.connState);
  const settings = useSettingsStore(s => s.settings);
  const [showSettings, setShowSettings] = useState(false);

  // Generate demo data from current default range
  useEffect(() => {
    if (connState === 'disconnected' && !traces.s11) {
      const demo = generateSampleData(settings.defaultStartHz, settings.defaultStopHz, 401);
      setTraces({ s11: demo.s11, s21: demo.s21 });
    }
  }, [connState, settings.defaultStartHz, settings.defaultStopHz]);

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
        />
        <RectPlot
          title="S11 / S21 — Phase"
          yLabel="degrees"
          mode="phase"
          traces={enabledTraces}
          yMin={settings.phaseYMin}
          yMax={settings.phaseYMax}
        />
        <SmithChart s11={traces.s11} />
      </div>

      <MarkerTable />

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
