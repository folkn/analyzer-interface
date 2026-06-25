import { useState } from 'react';
import type { DeviceType } from '../types';

interface Preset {
  label: string;
  start: number;  // Hz
  stop: number;   // Hz
  note?: string;
}

const VNA_PRESETS: Preset[] = [
  { label: 'HF',          start: 1e6,    stop: 30e6,   note: '1–30 MHz' },
  { label: 'VHF',         start: 30e6,   stop: 300e6,  note: '30–300 MHz' },
  { label: 'UHF',         start: 300e6,  stop: 1000e6, note: '300–1000 MHz' },
  { label: 'ISM 433',     start: 420e6,  stop: 450e6,  note: '420–450 MHz' },
  { label: 'ISM 868',     start: 855e6,  stop: 875e6,  note: '855–875 MHz' },
  { label: 'ISM 915',     start: 902e6,  stop: 928e6,  note: '902–928 MHz' },
  { label: '2.4 GHz',     start: 2400e6, stop: 2500e6, note: 'ISM / WiFi / BT' },
  { label: 'NanoVNA full',start: 50e3,   stop: 900e6,  note: '50 kHz–900 MHz' },
];

const SA_PRESETS: Preset[] = [
  { label: 'LW/MW',       start: 100e3,  stop: 3e6,    note: '0.1–3 MHz' },
  { label: 'SW',          start: 3e6,    stop: 30e6,   note: '3–30 MHz' },
  { label: 'FM',          start: 87.5e6, stop: 108e6,  note: '87.5–108 MHz' },
  { label: 'Air Band',    start: 118e6,  stop: 137e6,  note: 'Aviation voice' },
  { label: '2m Ham',      start: 144e6,  stop: 148e6,  note: '144–148 MHz' },
  { label: 'NOAA Wx',     start: 162e6,  stop: 163e6,  note: '162.4–162.55 MHz' },
  { label: 'PMR 446',     start: 446e6,  stop: 447e6,  note: '446 MHz' },
  { label: '70cm Ham',    start: 430e6,  stop: 440e6,  note: '430–440 MHz' },
  { label: 'ISM 433',     start: 420e6,  stop: 450e6,  note: '420–450 MHz' },
  { label: 'ISM 868',     start: 855e6,  stop: 875e6,  note: 'Ultra' },
  { label: 'ISM 915',     start: 902e6,  stop: 928e6,  note: 'Ultra' },
  { label: 'WiFi 2.4G',   start: 2400e6, stop: 2484e6, note: 'Ultra' },
  { label: 'Bluetooth',   start: 2400e6, stop: 2480e6, note: 'Ultra' },
  { label: 'GPS L1',      start: 1575e6, stop: 1577e6, note: 'Ultra' },
];

interface Props {
  deviceType: DeviceType;
  onSelect: (start: number, stop: number) => void;
}

export default function FreqPresets({ deviceType, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const presets = deviceType === 'tinySA' ? SA_PRESETS : VNA_PRESETS;

  return (
    <div className="freq-presets">
      <button className="btn-presets" onClick={() => setOpen(v => !v)} title="Frequency band presets">
        {open ? '▲ Presets' : '▼ Presets'}
      </button>
      {open && (
        <div className="presets-dropdown">
          {presets.map(p => (
            <button
              key={p.label}
              className="preset-item"
              onClick={() => { onSelect(p.start, p.stop); setOpen(false); }}
              title={p.note}
            >
              <span className="preset-label">{p.label}</span>
              {p.note && <span className="preset-note">{p.note}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
