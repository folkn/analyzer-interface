import { useEffect } from 'react';
import { useMarkerStore } from './store/markerStore';
import { useSerialStore } from './store/serialStore';
import { generateSampleData } from './utils/sampleData';
import RectPlot from './components/RectPlot';
import SmithChart from './components/SmithChart';
import MarkerTable from './components/MarkerTable';
import ConnectionBar from './components/ConnectionBar';
import SweepPanel from './components/SweepPanel';
import './App.css';

const DEMO = generateSampleData(100e6, 500e6, 401);

export default function App() {
  const { setTraces, traces } = useMarkerStore();
  const connState = useSerialStore(s => s.connState);

  // Load demo data only if no real device is connected
  useEffect(() => {
    if (connState === 'disconnected' && !traces.s11) {
      setTraces({ s11: DEMO.s11, s21: DEMO.s21 });
    }
  }, [connState]);

  const enabledTraces = [traces.s11, traces.s21].filter(Boolean) as any[];
  const isDemo = connState === 'disconnected' || connState === 'error';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="app-title">S-Parameter Analyzer</span>
          {isDemo && <span className="demo-badge">DEMO DATA</span>}
        </div>
        <ConnectionBar />
      </header>

      <SweepPanel />

      <div className="plots-grid">
        <RectPlot
          title="S11 / S21 — Magnitude"
          yLabel="dB"
          mode="mag"
          traces={enabledTraces}
        />
        <RectPlot
          title="S11 / S21 — Phase"
          yLabel="degrees"
          mode="phase"
          traces={enabledTraces}
        />
        <SmithChart s11={traces.s11} />
      </div>

      <MarkerTable />
    </div>
  );
}
