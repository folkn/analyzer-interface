import { useCallback, useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer, Scatter,
} from 'recharts';
import { useMarkerStore } from '../store/markerStore';
import type { TraceData } from '../types';
import type { SquareWaveOverlay } from '../utils/squareWave';
import { magDb, phaseDeg, interpolatePoint, formatFreq } from '../utils/sparams';
import { getChartColors } from '../store/settingsStore';

type ChartColors = ReturnType<typeof getChartColors>;

interface Props {
  title: string;
  yLabel: string;
  mode: 'mag' | 'phase';
  traces: TraceData[];
  yMin?: number;
  yMax?: number;
  showMajorGrid?: boolean;
  showMinorGrid?: boolean;
  colors: ChartColors;
  squareWaveOverlay?: SquareWaveOverlay | null;
}

function buildChartData(traces: TraceData[], mode: 'mag' | 'phase') {
  if (!traces.length || !traces[0].points.length) return [];
  const freqs = traces[0].points.map(p => p.freq);
  return freqs.map((f, i) => {
    const row: Record<string, number> = { freq: f };
    for (const tr of traces) {
      if (!tr.enabled) continue;
      const p = tr.points[i];
      row[tr.id] = mode === 'mag'
        ? magDb(p.re, p.im)
        : phaseDeg(p.re, p.im);
    }
    return row;
  });
}

function freqFormatter(hz: number) {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)}G`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(0)}M`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(0)}k`;
  return `${hz}`;
}

function makeTicks(lo: number, hi: number, step: number): number[] {
  const ticks: number[] = [];
  const start = Math.ceil(lo / step) * step;
  for (let v = start; v <= hi + 1e-9; v += step)
    ticks.push(parseFloat(v.toFixed(6)));
  return ticks;
}

export default function RectPlot({
  title, yLabel, mode, traces,
  yMin, yMax,
  showMajorGrid = true, showMinorGrid = false,
  colors,
  squareWaveOverlay,
}: Props) {
  const { markers, activeMarkerId, setActive, setMarkerFreq, addMarker } = useMarkerStore();

  const data = useMemo(() => buildChartData(traces, mode), [traces, mode]);

  const visibleMarkers = useMemo(
    () => markers.filter(m => m.visible),
    [markers],
  );

  const handleChartClick = useCallback(
    (e: any) => {
      if (!e || e.activePayload == null) return;
      const freq: number = e.activeLabel;
      if (activeMarkerId) {
        setMarkerFreq(activeMarkerId, freq);
      } else {
        addMarker(freq);
      }
    },
    [activeMarkerId, setMarkerFreq, addMarker],
  );

  const markerLines = visibleMarkers.map(m => {
    const isActive = m.id === activeMarkerId;
    return (
      <ReferenceLine
        key={m.id}
        x={m.freq}
        stroke={m.color}
        strokeWidth={isActive ? 2 : 1.5}
        strokeDasharray={isActive ? undefined : '4 2'}
        label={{
          value: m.name,
          position: 'insideTopRight',
          fill: m.color,
          fontSize: 11,
          fontWeight: isActive ? 700 : 400,
        }}
        onClick={() => setActive(m.id)}
        style={{ cursor: 'pointer' }}
      />
    );
  });

  const markerScatters = traces.filter(tr => tr.enabled).flatMap(tr =>
    visibleMarkers.map(m => {
      const pt = interpolatePoint(tr.points, m.freq);
      if (!pt) return null;
      const y = mode === 'mag' ? magDb(pt.re, pt.im) : phaseDeg(pt.re, pt.im);
      const isActive = m.id === activeMarkerId;
      return (
        <Scatter
          key={`${m.id}-${tr.id}`}
          name={`${m.name} ${tr.label}`}
          data={[{ freq: m.freq, [tr.id]: y }]}
          fill={m.color}
          stroke={isActive ? '#fff' : m.color}
          strokeWidth={isActive ? 2 : 0}
          shape={(props: any) => {
            const { cx, cy } = props;
            if (!cx || !cy) return <g />;
            return (
              <g>
                <circle
                  cx={cx} cy={cy} r={isActive ? 7 : 5}
                  fill={m.color}
                  stroke={isActive ? '#fff' : 'none'}
                  strokeWidth={2}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setActive(m.id)}
                />
                <text x={cx + 8} y={cy - 6} fill={m.color} fontSize={10} fontWeight={isActive ? 700 : 400}>
                  {m.name}
                </text>
              </g>
            );
          }}
          xAxisId="freq"
          yAxisId="val"
          legendType="none"
        />
      );
    }).filter(Boolean),
  );

  const tooltipFormatter = (value: unknown, name: unknown): [string, string] => {
    const v = Number(value);
    const n = String(name).toUpperCase();
    return mode === 'mag' ? [`${v.toFixed(2)} dB`, n] : [`${v.toFixed(1)}°`, n];
  };

  // Grid and tick configuration
  const yStepMajor = mode === 'mag' ? 10 : 60;
  const yStepMinor = mode === 'mag' ? 5 : 30;
  const yMinD = yMin !== undefined ? yMin : (mode === 'mag' ? -40 : -180);
  const yMaxD = yMax !== undefined ? yMax : (mode === 'mag' ? 20 : 180);

  const yTicks = showMinorGrid
    ? makeTicks(yMinD, yMaxD, yStepMinor)
    : undefined;
  const yTickFmt = (v: number) =>
    showMinorGrid ? (v % yStepMajor === 0 ? String(v) : '') : String(v);

  const gridStroke = showMinorGrid
    ? colors.gridMinor
    : showMajorGrid ? colors.gridMajor : 'transparent';
  const gridDash = showMinorGrid ? '1 3' : '3 3';
  const showGrid = showMajorGrid || showMinorGrid;

  // Square-wave overlay — only on magnitude plot
  const sqwLines = (mode === 'mag' && squareWaveOverlay)
    ? squareWaveOverlay.harmonics.filter(h => h.inRange).map(h => (
        <ReferenceLine
          key={`sqw-ref-${h.order}`}
          x={h.freq}
          stroke={squareWaveOverlay.color}
          strokeOpacity={squareWaveOverlay.opacity * 0.55}
          strokeWidth={1}
          strokeDasharray="3 3"
          label={{
            value: h.order === 1 ? 'F₁' : `${h.order}F₁`,
            position: 'insideTopLeft',
            fill: squareWaveOverlay.color,
            fillOpacity: squareWaveOverlay.opacity,
            fontSize: 9,
            fontWeight: 600,
          }}
        />
      ))
    : [];

  const sqwIdealPoints =
    mode === 'mag' && squareWaveOverlay
      ? squareWaveOverlay.harmonics
          .filter(h => h.inRange && isFinite(h.idealDb))
          .map(h => ({ freq: h.freq, __sqIdeal: h.idealDb, order: h.order }))
      : [];

  const sqwScatter =
    sqwIdealPoints.length > 0 && squareWaveOverlay ? (
      <Scatter
        key="sqw-ideal"
        xAxisId="freq"
        yAxisId="val"
        data={sqwIdealPoints}
        legendType="none"
        isAnimationActive={false}
        shape={(props: any) => {
          const { cx, cy, payload } = props;
          if (!cx || !cy) return <g />;
          const c = squareWaveOverlay.color;
          const op = squareWaveOverlay.opacity;
          const label = payload.order === 1 ? 'F₁' : `${payload.order}F₁`;
          return (
            <g>
              {/* Horizontal tick mark at ideal level */}
              <line x1={cx - 12} y1={cy} x2={cx + 12} y2={cy}
                stroke={c} strokeWidth={2} strokeOpacity={op} />
              {/* Diamond */}
              <polygon
                points={`${cx},${cy - 5} ${cx + 4},${cy} ${cx},${cy + 5} ${cx - 4},${cy}`}
                fill={c} fillOpacity={op} />
              {/* Label */}
              <text x={cx + 9} y={cy - 5} fill={c} fillOpacity={op}
                fontSize={9} fontWeight={600}>
                {label}
              </text>
            </g>
          );
        }}
      />
    ) : null;

  return (
    <div className="plot-container">
      <div className="plot-title">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} onClick={handleChartClick} style={{ cursor: 'crosshair' }}>
          <CartesianGrid
            strokeDasharray={gridDash}
            stroke={showGrid ? gridStroke : 'transparent'}
            strokeOpacity={showGrid ? 1 : 0}
          />
          <XAxis
            dataKey="freq"
            xAxisId="freq"
            tickFormatter={freqFormatter}
            tick={{ fill: colors.tick, fontSize: 11 }}
            type="number"
            scale="linear"
            domain={['dataMin', 'dataMax']}
            stroke={colors.gridMajor}
          />
          <YAxis
            yAxisId="val"
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: colors.tick, fontSize: 11 }}
            tick={{ fill: colors.tick, fontSize: 11 }}
            tickFormatter={yTickFmt}
            ticks={yTicks}
            width={55}
            domain={[yMin ?? 'auto', yMax ?? 'auto']}
            allowDataOverflow={yMin !== undefined || yMax !== undefined}
            stroke={colors.gridMajor}
          />
          {traces.filter(tr => tr.enabled).map(tr => (
            <Line
              key={tr.id}
              xAxisId="freq"
              yAxisId="val"
              dataKey={tr.id}
              stroke={tr.color}
              dot={false}
              strokeWidth={1.8}
              name={tr.label}
              isAnimationActive={false}
            />
          ))}
          {sqwLines}
          {sqwScatter}
          {markerLines}
          {markerScatters}
          <Tooltip
            formatter={tooltipFormatter}
            labelFormatter={v => formatFreq(Number(v))}
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.tooltipBorder}`,
              borderRadius: 4,
            }}
            labelStyle={{ color: colors.tooltipLabel }}
          />
          <Legend wrapperStyle={{ color: colors.tick, fontSize: 12, paddingTop: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
