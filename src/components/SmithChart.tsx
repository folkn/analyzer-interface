import React, { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { useMarkerStore } from '../store/markerStore';
import type { TraceData } from '../types';
import { interpolatePoint } from '../utils/sparams';
import { getChartColors } from '../store/settingsStore';

type ChartColors = ReturnType<typeof getChartColors>;

interface Props {
  s11: TraceData | null;
  colors: ChartColors;
}

const W = 320;
const H = 320;
const CX = W / 2;
const CY = H / 2;
const R = W / 2 - 20;

function gammaToXY(re: number, im: number): [number, number] {
  return [CX + re * R, CY - im * R];
}

function xyToGamma(x: number, y: number): [number, number] {
  return [(x - CX) / R, -(y - CY) / R];
}

function resistanceCircle(r: number): string {
  const center = r / (1 + r);
  const radius = 1 / (1 + r);
  const x = CX + center * R;
  const y = CY;
  const rPx = radius * R;
  return `M ${x - rPx} ${y} A ${rPx} ${rPx} 0 1 1 ${x - rPx + 0.001} ${y}`;
}

function reactanceArc(x: number): string {
  const cy = 1 / x;
  const r = Math.abs(1 / x);
  const centerX = CX + R;
  const centerY = CY - cy * R;
  const rPx = r * R;
  const startAngle = x > 0 ? Math.PI : -Math.PI;
  const sweep = x > 0 ? -Math.PI : Math.PI;
  const x1 = centerX + rPx * Math.cos(startAngle);
  const y1 = centerY + rPx * Math.sin(startAngle);
  const x2 = centerX + rPx * Math.cos(startAngle + sweep * 0.99);
  const y2 = centerY + rPx * Math.sin(startAngle + sweep * 0.99);
  const large = Math.abs(sweep) > Math.PI ? 1 : 0;
  const sweepFlag = sweep > 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${rPx} ${rPx} 0 ${large} ${sweepFlag} ${x2} ${y2}`;
}

export default function SmithChart({ s11, colors }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { markers, activeMarkerId, setActive, setMarkerFreq, addMarker } = useMarkerStore();

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !s11) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [re, im] = xyToGamma(sx, sy);
    if (re * re + im * im > 1.02) return;

    let bestFreq = s11.points[0]?.freq ?? 1e8;
    let bestDist = Infinity;
    for (const p of s11.points) {
      const d = (p.re - re) ** 2 + (p.im - im) ** 2;
      if (d < bestDist) { bestDist = d; bestFreq = p.freq; }
    }

    if (activeMarkerId) {
      setMarkerFreq(activeMarkerId, bestFreq, false);
    } else {
      addMarker(bestFreq);
    }
  }, [s11, activeMarkerId, setMarkerFreq, addMarker]);

  // Redraw grid whenever colors change (theme switch)
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('.smith-grid').remove();

    const grid = svg.append('g').attr('class', 'smith-grid');

    grid.append('circle')
      .attr('cx', CX).attr('cy', CY).attr('r', R)
      .attr('stroke', colors.smithRing)
      .attr('fill', colors.smithBg)
      .attr('stroke-width', 1.5);

    grid.append('line')
      .attr('x1', CX - R).attr('y1', CY).attr('x2', CX + R).attr('y2', CY)
      .attr('stroke', colors.smithRing).attr('stroke-width', 0.8);

    for (const r of [0, 0.2, 0.5, 1, 2, 5]) {
      grid.append('path')
        .attr('d', resistanceCircle(r))
        .attr('stroke', r === 1 ? colors.smithGridBold : colors.smithGrid)
        .attr('stroke-width', r === 0 ? 1.5 : 0.8)
        .attr('fill', 'none')
        .attr('clip-path', `circle(${R}px at ${CX}px ${CY}px)`);
      const cx = (r / (1 + r)) * R + CX;
      if (r > 0) {
        grid.append('text')
          .attr('x', cx).attr('y', CY - 4)
          .attr('fill', colors.smithText).attr('font-size', 9).attr('text-anchor', 'middle')
          .text(r);
      }
    }

    for (const x of [0.2, 0.5, 1, 2, 5, -0.2, -0.5, -1, -2, -5]) {
      grid.append('path')
        .attr('d', reactanceArc(x))
        .attr('stroke', colors.smithGrid).attr('stroke-width', 0.8)
        .attr('fill', 'none')
        .attr('clip-path', `circle(${R}px at ${CX}px ${CY}px)`);
    }

    grid.append('text').attr('x', CX + R + 5).attr('y', CY + 4).attr('fill', colors.smithText).attr('font-size', 9).text('1');
    grid.append('text').attr('x', CX - R - 5).attr('y', CY + 4).attr('fill', colors.smithText).attr('font-size', 9).attr('text-anchor', 'end').text('-1');
    grid.append('text').attr('x', CX + 4).attr('y', CY - R - 4).attr('fill', colors.smithText).attr('font-size', 9).text('+j');
    grid.append('text').attr('x', CX + 4).attr('y', CY + R + 12).attr('fill', colors.smithText).attr('font-size', 9).text('-j');

  }, [colors]);

  useEffect(() => {
    if (!svgRef.current || !s11) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('.smith-trace').remove();

    const traceG = svg.append('g').attr('class', 'smith-trace');
    const line = d3.line<{ re: number; im: number }>()
      .x(d => gammaToXY(d.re, d.im)[0])
      .y(d => gammaToXY(d.re, d.im)[1]);

    traceG.append('path')
      .datum(s11.points)
      .attr('d', line as any)
      .attr('stroke', s11.color)
      .attr('stroke-width', 1.8)
      .attr('fill', 'none')
      .attr('clip-path', `circle(${R}px at ${CX}px ${CY}px)`);

    const p0 = s11.points[0];
    if (p0) {
      const [x0, y0] = gammaToXY(p0.re, p0.im);
      traceG.append('circle').attr('cx', x0).attr('cy', y0).attr('r', 3)
        .attr('fill', s11.color);
    }
  }, [s11]);

  useEffect(() => {
    if (!svgRef.current || !s11) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('.smith-marker').remove();

    const mg = svg.append('g').attr('class', 'smith-marker');

    for (const m of markers) {
      if (!m.visible) continue;
      const pt = interpolatePoint(s11.points, m.freq);
      if (!pt) continue;
      const [x, y] = gammaToXY(pt.re, pt.im);
      const isActive = m.id === activeMarkerId;
      const r = isActive ? 8 : 6;

      mg.append('circle')
        .attr('cx', x).attr('cy', y).attr('r', r)
        .attr('fill', m.color)
        .attr('stroke', isActive ? '#fff' : 'none')
        .attr('stroke-width', isActive ? 2 : 0)
        .attr('class', 'smith-marker-dot')
        .style('cursor', 'pointer')
        .on('click', (event: Event) => {
          event.stopPropagation();
          setActive(m.id);
        });

      mg.append('text')
        .attr('x', x + r + 3).attr('y', y - r)
        .attr('fill', m.color)
        .attr('font-size', 11)
        .attr('font-weight', isActive ? 700 : 400)
        .text(m.name)
        .style('pointer-events', 'none');
    }
  }, [markers, activeMarkerId, s11, setActive]);

  return (
    <div className="plot-container">
      <div className="plot-title">Smith Chart (S11)</div>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        style={{ cursor: 'crosshair', display: 'block', margin: '0 auto' }}
        onClick={handleClick}
      />
    </div>
  );
}
