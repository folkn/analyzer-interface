import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMarkerStore } from '../store/markerStore';
import { magDb } from '../utils/sparams';

// ── Colormap definitions (piecewise linear: [t, r, g, b]) ────────

type CP = [number, number, number, number];

const COLORMAPS: Record<string, CP[]> = {
  plasma:    [[0,13,8,135],[0.25,126,3,167],[0.5,203,70,121],[0.75,248,149,64],[1,240,249,33]],
  viridis:   [[0,68,1,84],[0.25,59,82,139],[0.5,33,145,140],[0.75,94,201,98],[1,253,231,37]],
  inferno:   [[0,0,0,4],[0.25,87,16,110],[0.5,188,55,84],[0.75,249,142,9],[1,252,255,164]],
  turbo:     [[0,48,18,59],[0.1,86,67,200],[0.2,51,142,254],[0.3,18,200,225],[0.4,15,240,157],
              [0.5,64,254,68],[0.6,152,251,16],[0.7,230,220,35],[0.8,254,168,17],[0.9,230,101,7],[1,178,24,2]],
  hot:       [[0,0,0,0],[0.33,255,0,0],[0.66,255,255,0],[1,255,255,255]],
  jet:       [[0,0,0,128],[0.125,0,0,255],[0.375,0,255,255],[0.625,255,255,0],[0.875,255,0,0],[1,128,0,0]],
  cool:      [[0,0,255,255],[1,255,0,255]],
  grayscale: [[0,0,0,0],[1,255,255,255]],
  twilight:  [[0,226,217,226],[0.25,163,108,155],[0.5,45,34,86],[0.75,36,108,167],[1,226,217,226]],
};

const COLORMAP_OPTIONS = [
  { label: 'Plasma',    value: 'plasma'    },
  { label: 'Viridis',   value: 'viridis'   },
  { label: 'Inferno',   value: 'inferno'   },
  { label: 'Turbo',     value: 'turbo'     },
  { label: 'Hot',       value: 'hot'       },
  { label: 'Jet',       value: 'jet'       },
  { label: 'Cool',      value: 'cool'      },
  { label: 'Twilight',  value: 'twilight'  },
  { label: 'Grayscale', value: 'grayscale' },
];

function buildLUT(name: string, n = 256): Uint8ClampedArray {
  const cps = COLORMAPS[name] ?? COLORMAPS.plasma;
  const lut = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let lo = 0, hi = cps.length - 1;
    for (let j = 1; j < cps.length; j++) {
      if (cps[j][0] >= t) { hi = j; lo = j - 1; break; }
    }
    const [t0, r0, g0, b0] = cps[lo];
    const [t1, r1, g1, b1] = cps[hi];
    const s = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    lut[i * 3]     = Math.round(r0 + (r1 - r0) * s);
    lut[i * 3 + 1] = Math.round(g0 + (g1 - g0) * s);
    lut[i * 3 + 2] = Math.round(b0 + (b1 - b0) * s);
  }
  return lut;
}

const DATA_W   = 820;  // waterfall pixel columns
const SCALE_W  = 56;   // colorbar + labels
const CANVAS_W = DATA_W + SCALE_W;

interface Props {
  saYMin: number;
  saYMax: number;
}

export default function WaterfallPlot({ saYMin, saYMax }: Props) {
  const [visible,      setVisible]      = useState(true);
  const [numRows,      setNumRows]      = useState(150);
  const [speed,        setSpeed]        = useState(1);
  const [colormapName, setColormapName] = useState('plasma');

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const bufRef      = useRef<Uint8ClampedArray | null>(null);
  const timesRef    = useRef<number[]>([]);   // timestamps per row (circular)
  const prevSaRef   = useRef<unknown>(null);
  const sweepTsRef  = useRef<number>(0);

  const lut = useMemo(() => buildLUT(colormapName), [colormapName]);

  const { traces } = useMarkerStore();

  // ── Colorbar ─────────────────────────────────────────────────

  const drawColorbar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const H = canvas.height;

    // Clear colorbar area
    const theme = document.documentElement.dataset.theme ?? 'dark';
    const bg = theme === 'light' ? '#f0f4f8' : '#111827';
    ctx.fillStyle = bg;
    ctx.fillRect(DATA_W, 0, SCALE_W, H);

    // Color gradient bar (top = max, bottom = min)
    const barX = DATA_W + 4;
    const barW = 12;
    for (let y = 0; y < H; y++) {
      const t = 1 - y / (H - 1);
      const lutIdx = Math.floor(t * 255) * 3;
      ctx.fillStyle = `rgb(${lut[lutIdx]},${lut[lutIdx+1]},${lut[lutIdx+2]})`;
      ctx.fillRect(barX, y, barW, 1);
    }

    // Tick labels
    const fg = theme === 'light' ? '#1e293b' : '#9ca3af';
    ctx.fillStyle = fg;
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    const dRange = saYMax - saYMin;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const y = Math.round(t * (H - 1));
      const dBm = saYMax - t * dRange;
      ctx.fillText(`${Math.round(dBm)}`, barX + barW + 3, y + 4);
    }

    // Unit label
    ctx.save();
    ctx.translate(DATA_W + 2, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = fg;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('dBm', 0, 0);
    ctx.restore();
  }, [lut, saYMin, saYMax]);

  // ── Time axis overlay ─────────────────────────────────────────

  const drawTimeAxis = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const H = canvas.height;
    const times = timesRef.current;
    if (times.length < 2) return;

    const now = times[times.length - 1];
    const theme = document.documentElement.dataset.theme ?? 'dark';
    const fg = theme === 'light' ? '#1e293b' : '#9ca3af';

    ctx.font = '9px monospace';
    ctx.fillStyle = fg;
    ctx.textAlign = 'right';

    // Label every ~30 rows
    const step = Math.max(1, Math.floor(30 / speed));
    for (let row = 0; row < H; row += step) {
      const timeIdx = times.length - 1 - Math.floor((H - 1 - row) / speed);
      if (timeIdx < 0) continue;
      const ageSec = ((now - (times[timeIdx] ?? now)) / 1000).toFixed(0);
      ctx.fillText(`${ageSec}s`, DATA_W - 2, row + 9);
    }
  }, [speed]);

  // ── Main waterfall draw ───────────────────────────────────────

  const drawWaterfall = useCallback(() => {
    const canvas = canvasRef.current;
    const buf = bufRef.current;
    if (!canvas || !buf) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const id = ctx.createImageData(DATA_W, numRows);
    id.data.set(buf);
    ctx.putImageData(id, 0, 0);
    drawColorbar();
    drawTimeAxis();
  }, [numRows, drawColorbar, drawTimeAxis]);

  // ── Reset buffer when numRows or SA range changes ─────────────

  useEffect(() => {
    bufRef.current = new Uint8ClampedArray(DATA_W * numRows * 4);
    timesRef.current = [];
    prevSaRef.current = null;
    drawWaterfall();
  }, [numRows, drawWaterfall]);

  // Redraw colorbar when colormap or range changes (no new data needed)
  useEffect(() => { drawColorbar(); }, [drawColorbar]);

  // ── New SA sweep → push row(s) ────────────────────────────────

  useEffect(() => {
    if (!traces.sa || traces.sa === prevSaRef.current || !visible) return;
    prevSaRef.current = traces.sa;

    const buf = bufRef.current;
    if (!buf) return;

    const H  = numRows;
    const dRange = saYMax - saYMin || 1;
    const pts = traces.sa.points;
    const now = Date.now();
    sweepTsRef.current = now;
    timesRef.current = [...timesRef.current, now].slice(-H);

    // Scroll up by `speed` rows
    const scrollBytes = speed * DATA_W * 4;
    buf.copyWithin(0, Math.min(scrollBytes, buf.length));

    // Fill bottom `speed` rows with the new spectrum
    for (let row = 0; row < speed; row++) {
      const yBase = (H - speed + row) * DATA_W;
      for (let x = 0; x < DATA_W; x++) {
        const dataIdx = Math.floor((x / DATA_W) * (pts.length - 1));
        const p       = pts[Math.min(dataIdx, pts.length - 1)];
        const dBm     = magDb(p.re, p.im);
        const t       = Math.max(0, Math.min(1, (dBm - saYMin) / dRange));
        const lutIdx  = Math.floor(t * 255) * 3;
        const pi      = (yBase + x) * 4;
        buf[pi]     = lut[lutIdx];
        buf[pi + 1] = lut[lutIdx + 1];
        buf[pi + 2] = lut[lutIdx + 2];
        buf[pi + 3] = 255;
      }
    }

    drawWaterfall();
  }, [traces.sa, visible, speed, numRows, saYMin, saYMax, lut, drawWaterfall]);

  function handleClear() {
    bufRef.current = new Uint8ClampedArray(DATA_W * numRows * 4);
    timesRef.current = [];
    prevSaRef.current = null;
    drawWaterfall();
  }

  const ROW_OPTIONS = [50, 100, 150, 200, 300, 400];
  const SPEED_OPTIONS = [
    { label: '1 px/sweep', value: 1 },
    { label: '2 px/sweep', value: 2 },
    { label: '3 px/sweep', value: 3 },
    { label: '5 px/sweep', value: 5 },
    { label: '10 px/sweep', value: 10 },
  ];

  return (
    <div className="wf-outer">
      <div className="wf-header">
        <span className="wf-title">Waterfall</span>
        <div className="wf-controls">
          <label className="wf-ctl">
            <span>Colormap</span>
            <select className="wf-select" value={colormapName} onChange={e => setColormapName(e.target.value)}>
              {COLORMAP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="wf-ctl">
            <span>Rows</span>
            <select className="wf-select" value={numRows} onChange={e => setNumRows(Number(e.target.value))}>
              {ROW_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="wf-ctl">
            <span>Speed</span>
            <select className="wf-select" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
              {SPEED_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <button className="btn-sm wf-clear" onClick={handleClear} title="Clear waterfall">Clear</button>
          <button
            className="btn-sm wf-toggle"
            onClick={() => setVisible(v => !v)}
            title={visible ? 'Hide waterfall' : 'Show waterfall'}
          >
            {visible ? '▲ Hide' : '▼ Show'}
          </button>
        </div>
      </div>
      {visible && (
        <canvas
          ref={canvasRef}
          className="wf-canvas"
          width={CANVAS_W}
          height={numRows}
        />
      )}
    </div>
  );
}
