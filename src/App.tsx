import { useEffect, useState } from 'react';
import { useMarkerStore } from './store/markerStore';
import { useSerialStore } from './store/serialStore';
import { useSettingsStore, getChartColors } from './store/settingsStore';
import { generateSampleData, generateSADemoData } from './utils/sampleData';
import RectPlot from './components/RectPlot';
import SmithChart from './components/SmithChart';
import MarkerTable from './components/MarkerTable';
import ConnectionBar from './components/ConnectionBar';
import SweepPanel from './components/SweepPanel';
import SettingsPanel from './components/SettingsPanel';
import TuneMatch from './components/TuneMatch';
import MriCoilTuner from './components/MriCoilTuner';
import BFieldProbe from './components/BFieldProbe';
import './App.css';

export default function App() {
  const { setTraces, traces } = useMarkerStore();
  const { connState, deviceType } = useSerialStore();
  const { settings, update } = useSettingsStore();
  const [showSettings, setShowSettings] = useState(false);
  const [activeTool, setActiveTool] = useState<'tune-match' | 'mri-coil' | 'bfield' | null>(null);

  const isSA = deviceType === 'tinySA' || (!deviceType && settings.deviceMode === 'sa');

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Generate demo data whenever disconnected or device/range changes
  useEffect(() => {
    if (connState !== 'disconnected' && connState !== 'error') return;
    if (isSA) {
      const demo = generateSADemoData(settings.defaultStartHz, settings.defaultStopHz, 401);
      setTraces({ sa: demo.sa, s11: null, s21: null });
    } else {
      const demo = generateSampleData(settings.defaultStartHz, settings.defaultStopHz, 401);
      setTraces({ s11: demo.s11, s21: demo.s21, sa: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connState, isSA, settings.defaultStartHz, settings.defaultStopHz]);

  // Clear mode-incompatible tools on switch
  useEffect(() => {
    if (isSA && (activeTool === 'tune-match' || activeTool === 'mri-coil')) setActiveTool(null);
    if (!isSA && activeTool === 'bfield') setActiveTool(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSA]);

  function toggleTheme() {
    const next = settings.theme === 'dark' ? 'light' : 'dark';
    update({ theme: next });
    useSettingsStore.getState().saveAsDefault();
  }

  function toggleDeviceMode() {
    update({ deviceMode: settings.deviceMode === 'sa' ? 'vna' : 'sa' });
  }

  const colors = getChartColors(settings.theme);
  const isDemo = connState === 'disconnected' || connState === 'error';
  const spectrumTraces = traces.sa ? [traces.sa] : [];
  const vnaTraces = [traces.s11, traces.s21].filter(Boolean) as any[];

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="app-title">
            {isSA ? 'Spectrum Analyzer' : 'S-Parameter Analyzer'}
          </span>
          {isDemo && <span className="demo-badge">DEMO</span>}
          {isDemo && (
            <button
              className={`btn-device-mode${isSA ? ' sa-active' : ''}`}
              onClick={toggleDeviceMode}
              title="Switch demo mode between VNA and SA"
            >
              {isSA ? '〰 VNA mode' : '📡 SA mode'}
            </button>
          )}
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

      <div className={isSA ? 'plots-grid-sa' : 'plots-grid'}>
        {isSA ? (
          <RectPlot
            title="Spectrum — dBm"
            yLabel="dBm"
            mode="mag"
            traces={spectrumTraces}
            yMin={settings.saYMin}
            yMax={settings.saYMax}
            showMajorGrid={settings.showMajorGrid}
            showMinorGrid={settings.showMinorGrid}
            colors={colors}
          />
        ) : (
          <>
            <RectPlot
              title="S11 / S21 — Magnitude"
              yLabel="dB"
              mode="mag"
              traces={vnaTraces}
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
              traces={vnaTraces}
              yMin={settings.phaseYMin}
              yMax={settings.phaseYMax}
              showMajorGrid={settings.showMajorGrid}
              showMinorGrid={settings.showMinorGrid}
              colors={colors}
            />
            <SmithChart s11={traces.s11} colors={colors} />
          </>
        )}
      </div>

      <MarkerTable />

      <div className="tools-panel">
        <div className="tools-tabs">
          {isSA ? (
            <button
              className={`tools-tab${activeTool === 'bfield' ? ' active' : ''}`}
              onClick={() => setActiveTool(v => v === 'bfield' ? null : 'bfield')}
            >
              🧲 B Field Probe
            </button>
          ) : (
            <>
              <button
                className={`tools-tab${activeTool === 'tune-match' ? ' active' : ''}`}
                onClick={() => setActiveTool(v => v === 'tune-match' ? null : 'tune-match')}
              >
                ◎ Tune &amp; Match
              </button>
              <button
                className={`tools-tab${activeTool === 'mri-coil' ? ' active' : ''}`}
                onClick={() => setActiveTool(v => v === 'mri-coil' ? null : 'mri-coil')}
              >
                ⊕ MRI Coil Tuner
              </button>
            </>
          )}
        </div>
        {activeTool === 'tune-match' && <TuneMatch />}
        {activeTool === 'mri-coil' && <MriCoilTuner />}
        {activeTool === 'bfield' && <BFieldProbe />}
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
