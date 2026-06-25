import { useCallback, useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer, Scatter,
} from 'recharts';
import { useMarkerStore } from '../store/markerStore';
import type { TraceData } from '../types';
import { magDb, phaseDeg, interpolatePoint, formatFreq } from '../utils/sparams';

interface Props {
  title: string;
  yLabel: string;
  mode: 'mag' | 'phase';
  traces: TraceData[];
  yMin?: number;
  yMax?: number;
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

export default function RectPlot({ title, yLabel, mode, traces, yMin, yMax }: Props) {
  const { markers, activeMarkerId, setActive, setMarkerFreq, addMarker } = useMarkerStore();

  const data = useMemo(() => buildChartData(traces, mode), [traces, mode]);

  // Visible markers with values on at least one enabled trace
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

  // Build reference lines for markers
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

  // Marker scatter dots on each trace
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

  return (
    <div className="plot-container">
      <div className="plot-title">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} onClick={handleChartClick} style={{ cursor: 'crosshair' }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
          <XAxis
            dataKey="freq"
            xAxisId="freq"
            tickFormatter={freqFormatter}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            type="number"
            scale="linear"
            domain={['dataMin', 'dataMax']}
          />
          <YAxis
            yAxisId="val"
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            width={55}
            domain={[yMin ?? 'auto', yMax ?? 'auto']}
            allowDataOverflow={yMin !== undefined || yMax !== undefined}
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
          {markerLines}
          {markerScatters}
          <Tooltip
            formatter={tooltipFormatter}
            labelFormatter={v => formatFreq(Number(v))}
            contentStyle={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 4 }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12, paddingTop: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
