import { useEffect } from 'react';
import { useMarkerStore } from './store/markerStore';
import { generateSampleData } from './utils/sampleData';
import RectPlot from './components/RectPlot';
import SmithChart from './components/SmithChart';
import MarkerTable from './components/MarkerTable';
import './App.css';

const { s11, s21 } = generateSampleData(100e6, 500e6, 401);

export default function App() {
  const { setTraces, traces } = useMarkerStore();

  useEffect(() => {
    setTraces({ s11, s21 });
  }, []);

  const enabledTraces = [traces.s11, traces.s21].filter(Boolean) as any[];

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">S-Parameter Analyzer</span>
        <span className="app-subtitle">
          Click a plot to place/move the active marker · Click a marker dot or table row to select it
        </span>
      </header>

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
