# Analyzer Interface — Agent Handoff README

> **Audience:** AI agents taking over development. This file covers architecture,
> data flow, naming conventions, and gotchas — everything needed to make correct
> changes without reading every file from scratch.

---

## 1. What This Project Is

A **single-file web app** (`dist/index.html`) for controlling RF test equipment
over USB serial via the **Web Serial API** (Chrome 89+). Two device families
are supported:

| Device | Family | Mode |
|---|---|---|
| NanoVNA (any variant) | S-parameter analyzer | VNA mode |
| TinySA (any variant) | Spectrum analyzer | SA mode |

The build output is one self-contained HTML file with no network dependencies —
open it locally in Chrome and plug in a device.

---

## 2. Repository & Branch

- **Repo:** `folkn/analyzer-interface`
- **Active development branch:** `claude/tinySA-bfield`
- **Previous branch (MRI Coil Tuner):** `claude/beautiful-albattani-rwq3uf`

Build and dev commands:
```bash
npm install
npm run dev      # Vite dev server
npm run build    # → dist/index.html (single file, no assets folder)
```

Build config: `vite.config.ts` uses `vite-plugin-singlefile` with
`assetsInlineLimit: 100_000_000` to inline everything.

---

## 3. Tech Stack

| Layer | Library/Tool | Notes |
|---|---|---|
| UI framework | React 19 + TypeScript | Functional components, hooks only |
| Build | Vite + `vite-plugin-singlefile` | Single `dist/index.html` output |
| State | Zustand | Three stores (see §6) |
| Rect plots | Recharts | `<RectPlot>` wraps it |
| Smith chart | D3 | Custom canvas/SVG in `SmithChart.tsx` |
| Waterfall | Canvas API | Raw `Uint8ClampedArray` pixel buffer |
| B Field graph | Canvas API | Custom scrolling time graph |
| Styling | Plain CSS in `src/App.css` | CSS variables for theming |
| Serial | Web Serial API | Tab-isolated, Chrome only |

---

## 4. Source Tree

```
src/
├── App.tsx                   # Root component; mode-conditional layout
├── App.css                   # ALL styles; CSS variables for dark/light theme
├── main.tsx                  # ReactDOM.createRoot entry point
├── types/
│   └── index.ts              # All shared TypeScript types (see §5)
├── serial/
│   ├── SerialManager.ts      # Low-level serial: open/close/command/flush
│   ├── NanoVNADriver.ts      # VNA: scan(), scanMultiSeg()
│   ├── TinySADriver.ts       # SA: scan(), setRbw(), calibrate()
│   └── export.ts             # toS2P(), toVNACSV(), toSACSV()
├── store/
│   ├── markerStore.ts        # Traces + markers (Zustand)
│   ├── serialStore.ts        # Connection + sweep (Zustand)
│   └── settingsStore.ts      # Persistent settings (Zustand + localStorage)
├── utils/
│   ├── sparams.ts            # magDb, phaseDeg, vswr, interpolation, formatting
│   ├── sampleData.ts         # Demo data generators (VNA + SA)
│   └── matching.ts           # L-network matching math (used by TuneMatch)
└── components/
    ├── ConnectionBar.tsx     # Connect/disconnect button, baud rate, device badge
    ├── SweepPanel.tsx        # Sweep controls, RBW, cal modal, export
    ├── FreqPresets.tsx       # Frequency band preset dropdown
    ├── RectPlot.tsx          # Shared rectangular plot (dBm/dB/phase)
    ├── SmithChart.tsx        # S11 Smith chart (VNA only)
    ├── WaterfallPlot.tsx     # Canvas waterfall (SA only)
    ├── MarkerTable.tsx       # Marker list + controls
    ├── BFieldProbe.tsx       # B Field Probe tool (SA only)
    ├── SettingsPanel.tsx     # Settings overlay
    ├── TuneMatch.tsx         # L-network Tune & Match helper (VNA only)
    └── MriCoilTuner.tsx      # MRI coil tuner, S11+S21 modes (VNA only)
```

---

## 5. Core Types (`src/types/index.ts`)

```typescript
// Every measured point (VNA or SA)
interface SParamPoint {
  freq: number;   // Hz
  re: number;
  im: number;
}

// A named collection of points (one trace = one line on a plot)
interface TraceData {
  id: string;           // 's11' | 's21' | 'sa'
  label: string;
  points: SParamPoint[];
  enabled: boolean;
  color: string;        // hex
}

// Values computed at a marker's frequency
interface MarkerValues {
  s11MagDb?: number;
  s11PhaseDeg?: number;
  s21MagDb?: number;
  s21PhaseDeg?: number;
  s11Re?: number;
  s11Im?: number;
  vswr?: number;
  saLevelDbm?: number;  // SA mode: level in dBm
}

type DeviceType = 'nanovna' | 'tinySA' | null;
```

### Critical encoding detail — SA data

SA spectrum levels are stored as if they were S-parameter complex values:

```
re = 10^(dBm / 20),  im = 0
```

This means `magDb(re, im) === dBm` identically, so **all marker interpolation,
peak search, and plot rendering code works unchanged** for both VNA and SA data.
Do not store raw dBm floats directly on `SParamPoint.re` — always apply this
encoding when creating SA traces.

---

## 6. State Management

### 6a. `markerStore` — traces and markers

```typescript
traces: { s11: TraceData | null; s21: TraceData | null; sa: TraceData | null }

setTraces(partial: Partial<TracesState>): void   // merges, then refreshAll
addMarker(freq, mode?, traceId?): string
removeMarker(id): void
searchPeak(traceId: 's11' | 's21' | 'sa', markerId?): void
searchValley(traceId: 's11' | 's21' | 'sa', markerId?): void
_refreshAll(): void   // recomputes all marker values from current traces
```

`setTraces` always calls `_refreshAll()` after merging. Never call
`setTraces` in a tight loop — it's O(markers).

### 6b. `serialStore` — connection and sweep

Key state fields:
```typescript
connState: 'disconnected' | 'connecting' | 'connected' | 'error'
sweepState: 'idle' | 'scanning' | 'error'
deviceType: DeviceType          // null until connect() succeeds
saRbwKhz: number               // 0 = auto
sweepParams: { startHz, stopHz, points }
autoSweep: boolean
autoIntervalMs: number
```

Module-level singletons (not in Zustand state):
```typescript
let mgr: SerialManager | null       // raw serial
let drv: NanoVNADriver | null       // VNA driver (set when nanovna detected)
let tinyDrv: TinySADriver | null    // SA driver (set when tinySA detected)
```

Auto-detection on `connect()`:
1. Send blank command, flush
2. Send `version`, read response
3. If response contains `tinysa` or `tiny_sa` → `deviceType = 'tinySA'`, use `tinyDrv`
4. Otherwise → `deviceType = 'nanovna'`, use `drv`

`sweep()` branches on `deviceType`:
- TinySA: `tinyDrv.setRbw()` then `tinyDrv.scan()` → stores as SA trace
- NanoVNA: `drv.scanMultiSeg()` → stores as s11/s21 traces

### 6c. `settingsStore` — persistent settings

Persisted to `localStorage` under key `spa-settings-v1`.
Key fields relevant to mode:
```typescript
deviceMode: 'vna' | 'sa'   // demo mode when disconnected
saYMin: number              // dBm (default -90)
saYMax: number              // dBm (default 0)
saRbwKhz: number            // 0 = auto
theme: 'dark' | 'light'
showMajorGrid: boolean
showMinorGrid: boolean
```

Factory defaults are in `FACTORY_DEFAULTS` const — always use that as the
reference for defaults, not hardcoded numbers elsewhere.

---

## 7. Device Mode — The `isSA` Flag

This flag drives almost all conditional rendering throughout the app:

```typescript
const isSA = deviceType === 'tinySA' || (!deviceType && settings.deviceMode === 'sa');
```

- `deviceType` comes from `serialStore` (real device, null when disconnected)
- `settings.deviceMode` controls demo mode when disconnected
- `isSA` is computed independently in `App.tsx`, `MarkerTable.tsx`, and `SweepPanel.tsx`
  — each imports both stores and derives it locally. **Do not prop-drill this flag.**

---

## 8. Layout by Mode

### SA Mode (`isSA === true`)
```
<header>   title: "Spectrum Analyzer", DEMO badge, SA/VNA toggle button
<SweepPanel>   freq range, points, RBW dropdown, Calibrate button, CSV export
<div.plots-grid-sa>
  <RectPlot title="Spectrum — dBm" yLabel="dBm" mode="mag" />
  <WaterfallPlot saYMin saYMax />
<MarkerTable>   shows: Vis, Name, Freq, Level(dBm), Delete
<div.tools-panel>
  [B Field Probe tab] → <BFieldProbe />
<SettingsPanel>   (overlay, toggled by ⚙ button)
```

### VNA Mode (`isSA === false`)
```
<header>   title: "S-Parameter Analyzer"
<SweepPanel>   freq range, points, auto-sweep, S2P + CSV export
<div.plots-grid>
  <RectPlot title="S11/S21 — Magnitude" yLabel="dB" mode="mag" />
  <RectPlot title="S11/S21 — Phase" yLabel="degrees" mode="phase" />
  <SmithChart s11={traces.s11} />
<MarkerTable>   shows: Vis, Name, Freq, S11(dB), S11∠, VSWR, S21(dB), S21∠
<div.tools-panel>
  [Tune & Match tab] → <TuneMatch />
  [MRI Coil Tuner tab] → <MriCoilTuner />
<SettingsPanel>
```

---

## 9. Serial Layer

### `SerialManager` (`src/serial/SerialManager.ts`)
Owns the raw `SerialPort`. Key method:
```typescript
command(cmd: string, timeoutMs: number): Promise<string>
```
Sends `cmd + '\r'`, collects bytes until the prompt (`'ch> '`) or timeout,
returns accumulated string. All drivers go through this.

### `NanoVNADriver` — VNA scan command
```
scan <startHz> <stopHz> <points> 3
```
Response: one line per point — `re11 im11 re21 im21` (space-separated floats).

### `TinySADriver` — SA scan command
```
scan <startHz> <stopHz> <points> 3
```
Response: one line per point — either `freq level` or just `level` (dBm float).
`parseSAResponse` handles both. Frequencies are computed linearly from scan params
(the freq column, if present, is currently ignored in favor of linear interpolation).

RBW command: `rbw 0` (auto) or `rbw <N>` where N is kHz integer.

---

## 10. Waterfall Plot (`src/components/WaterfallPlot.tsx`)

Canvas dimensions: `DATA_W = 820` px (spectrum), `SCALE_W = 56` px (colorbar),
total `CANVAS_W = 876` px. Height = `numRows` (50–400 px, one pixel = one sweep row).

Pixel buffer: `bufRef: Uint8ClampedArray` of size `DATA_W * numRows * 4` (RGBA).

**Scroll mechanism** (every new SA sweep):
```typescript
buf.copyWithin(0, speed * DATA_W * 4);  // shift up by `speed` rows
// fill bottom `speed` rows with new spectrum data
```

**Render:**
```typescript
const id = ctx.createImageData(DATA_W, numRows);
id.data.set(buf);
ctx.putImageData(id, 0, 0);    // data area only
// then drawColorbar() and drawTimeAxis() use 2D API on the right/left margins
```

**Why not `new ImageData(buf, ...)`?** TypeScript's `ImageData` constructor
requires `ArrayBuffer` but `Uint8ClampedArray` uses `ArrayBufferLike` (which
can be `SharedArrayBuffer`). `createImageData` + `data.set()` avoids the type error.

**Colormaps:** 9 colormaps defined as piecewise-linear control points in
`COLORMAPS: Record<string, CP[]>`. `buildLUT(name)` returns a
`Uint8ClampedArray` of 256 RGB triples. The LUT is rebuilt only when
`colormapName` changes (memoized).

---

## 11. B Field Probe (`src/components/BFieldProbe.tsx`)

**Math:**
```
B(dBμT) = P_received(dBm) + CF(freq)
B(μT)   = 10^(B(dBμT) / 20)
B(nT)   = B(μT) * 1000
```
where `CF(freq)` is the correction factor in dB, linearly interpolated from
the editable calibration table (`CalEntry[]`).

**Data source:** Reads `activeMarker.values.saLevelDbm` from `markerStore`.
No marker selected → shows "No active marker" warning.

**Three tabs:**
1. **Live Reading** — real-time P_received, CF, B(dBμT), B(μT/nT)
2. **Calibration** — editable `freq (MHz) | correction (dB)` table;
   CSV import via `FileReader`; export; add/delete rows
3. **Time Graph** — canvas scrolling plot; Start/Stop/Clear; CSV export;
   y-axis toggles dBμT / μT

**Canvas theming:** Uses CSS variables via `getComputedStyle(canvas)`:
`--c-surface`, `--c-text`, `--c-border` — these are set in `App.css` for both
dark and light themes.

---

## 12. Theming

**CSS variables** (defined in `src/App.css`):
```css
:root {                          /* dark defaults */
  --c-bg: #0f172a;
  --c-surface: #1e293b;
  --c-border: #334155;
  --c-text: #e2e8f0;
  --c-text-muted: #64748b;
  --c-accent: #3b82f6;
  /* ... more ... */
}
[data-theme="light"] {           /* light overrides */
  --c-bg: #f8fafc;
  /* ... */
}
```

Theme is applied via `document.documentElement.dataset.theme = settings.theme`.

**For SVG/Canvas** (where CSS vars don't work): use `getChartColors(theme)`
from `settingsStore.ts` — returns a hardcoded object of hex colors keyed by theme.

---

## 13. Demo Mode

When `connState` is `'disconnected'` or `'error'`, `App.tsx` generates demo data:
- VNA: `generateSampleData(startHz, stopHz, 401)` → `{ s11, s21 }`
- SA: `generateSADemoData(startHz, stopHz, 401)` → `{ sa }`

SA demo creates a noise floor at ~-88 dBm with 3 Lorentzian-shaped synthetic peaks.
All demo SA points use the same `{re: 10^(level/20), im: 0}` encoding.

The demo badge and SA/VNA mode toggle button appear only when disconnected.

---

## 14. Export

All export functions are in `src/serial/export.ts`:

| Function | Output format | Used in |
|---|---|---|
| `toS2P(freqs, s11, s21)` | Touchstone `.s2p` | SweepPanel (VNA) |
| `toVNACSV(freqs, s11, s21)` | CSV: Freq, S11_re, S11_im, ... | SweepPanel (VNA) |
| `toSACSV(sa: TraceData)` | CSV: Freq_Hz, Level_dBm | SweepPanel (SA) |

B Field time graph CSV is generated inline in `BFieldProbe.tsx`.

---

## 15. Known Patterns & Conventions

- **No prop drilling of `isSA`** — each component derives it locally from stores.
- **No simultaneous VNA+SA** in one tab — `connect()` sets exactly one of `drv` or
  `tinyDrv` and nulls the other. Concurrent tabs each have their own serial connection.
- **Marker freq snapping** — `setMarkerFreq` snaps to the nearest measured frequency
  in the current trace by default (`snap = true`). Pass `false` for peak/valley search
  results (already on exact measured frequencies).
- **`useEffect` deps on `drawWaterfall`** — `drawWaterfall` depends on `drawColorbar`
  and `drawTimeAxis` which depend on `lut`, `saYMin`, `saYMax`, `speed`. The dependency
  chain is correct; do not flatten it without re-checking all the `useCallback` deps.
- **Settings dirty flag** — `isDirty` compares `settings` to what's stored in
  localStorage. `update()` computes it after every change. Do not manually set `isDirty`.
- **CSS class naming** — components use flat BEM-style prefixes:
  `wf-*` (waterfall), `bfp-*` (B field probe), `sf-*` (settings form),
  `marker-*`, `btn-*`, etc. All in `src/App.css`.

---

## 16. What Does Not Exist Yet (Potential Future Work)

- **Touchstone import** (load `.s2p` file for offline analysis)
- **Marker delta mode** (type field exists in `Marker` but UI not wired)
- **SA max-hold / average** sweep modes
- **TinySA level calibration via signal generator** (currently UI shows steps
  but the `calibrate()` driver method is minimal)
- **Multi-device support** (one VNA + one TinySA simultaneously in same tab)
- **PWA / offline caching** (the single-file build already works offline once loaded)
