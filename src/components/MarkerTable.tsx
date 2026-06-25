import { useMarkerStore } from '../store/markerStore';
import { formatFreq, formatVal } from '../utils/sparams';

export default function MarkerTable() {
  const {
    markers, activeMarkerId, setActive, removeMarker,
    setMarkerVisible, setMarkerName, searchPeak, searchValley, addMarker, traces,
  } = useMarkerStore();

  const midFreq = traces.s11?.points
    ? traces.s11.points[Math.floor(traces.s11.points.length / 2)]?.freq ?? 1e8
    : 1e8;

  return (
    <div className="marker-table-container">
      <div className="marker-table-header">
        <span className="section-title">Markers</span>
        <div className="marker-actions">
          <button className="btn-sm" onClick={() => addMarker(midFreq)}>+ Add</button>
          <button className="btn-sm" onClick={() => searchPeak('s11')}>Peak S11</button>
          <button className="btn-sm" onClick={() => searchValley('s11')}>Min S11</button>
          <button className="btn-sm" onClick={() => searchPeak('s21')}>Peak S21</button>
          <button className="btn-sm" onClick={() => searchValley('s21')}>Min S21</button>
        </div>
      </div>

      {markers.length === 0 ? (
        <div className="marker-empty">No markers. Click "+ Add" or click on a plot.</div>
      ) : (
        <table className="marker-tbl">
          <thead>
            <tr>
              <th>Vis</th>
              <th>Name</th>
              <th>Frequency</th>
              <th>S11 (dB)</th>
              <th>S11 ∠</th>
              <th>VSWR</th>
              <th>S21 (dB)</th>
              <th>S21 ∠</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {markers.map(m => {
              const isActive = m.id === activeMarkerId;
              return (
                <tr
                  key={m.id}
                  className={isActive ? 'marker-row active' : 'marker-row'}
                  onClick={() => setActive(m.id)}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={m.visible}
                      onChange={e => { e.stopPropagation(); setMarkerVisible(m.id, e.target.checked); }}
                    />
                  </td>
                  <td>
                    <input
                      className="marker-name-input"
                      value={m.name}
                      style={{ borderBottom: `2px solid ${m.color}` }}
                      onChange={e => setMarkerName(m.id, e.target.value)}
                      onClick={e => e.stopPropagation()}
                    />
                  </td>
                  <td className="mono">{formatFreq(m.freq)}</td>
                  <td className="mono">{formatVal(m.values.s11MagDb, ' dB')}</td>
                  <td className="mono">{formatVal(m.values.s11PhaseDeg, '°')}</td>
                  <td className="mono">{formatVal(m.values.vswr, '', 2)}</td>
                  <td className="mono">{formatVal(m.values.s21MagDb, ' dB')}</td>
                  <td className="mono">{formatVal(m.values.s21PhaseDeg, '°')}</td>
                  <td>
                    <button
                      className="btn-del"
                      onClick={e => { e.stopPropagation(); removeMarker(m.id); }}
                    >×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
