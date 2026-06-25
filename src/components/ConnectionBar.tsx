import { useSerialStore, BAUD_RATES } from '../store/serialStore';

const DOT_COLOR: Record<string, string> = {
  disconnected: '#4b5563',
  connecting:   '#f59e0b',
  connected:    '#22c55e',
  error:        '#ef4444',
};

export default function ConnectionBar() {
  const {
    connState, deviceInfo, errorMsg, baudRate,
    hasSerial, connect, disconnect, setBaudRate,
  } = useSerialStore();

  const isConnected  = connState === 'connected';
  const isConnecting = connState === 'connecting';

  if (!hasSerial) {
    return (
      <div className="connection-bar no-serial">
        <span className="status-dot" style={{ background: '#ef4444' }} />
        Web Serial API not available — open this page in Chrome 89+ served from localhost.
      </div>
    );
  }

  return (
    <div className="connection-bar">
      <div className="conn-left">
        <span className="status-dot" style={{ background: DOT_COLOR[connState] }} />
        <span className="status-label">
          {connState === 'connected'   ? (deviceInfo || 'Connected') :
           connState === 'connecting'  ? 'Connecting…' :
           connState === 'error'       ? `Error: ${errorMsg}` :
                                         'Disconnected'}
        </span>
      </div>

      <div className="conn-right">
        {!isConnected && (
          <label className="baud-label">
            Baud
            <select
              className="baud-select"
              value={baudRate}
              onChange={e => setBaudRate(Number(e.target.value))}
              disabled={isConnecting}
            >
              {BAUD_RATES.map(b => <option key={b} value={b}>{b.toLocaleString()}</option>)}
            </select>
          </label>
        )}

        {isConnected ? (
          <button className="btn-disconnect" onClick={disconnect}>
            Disconnect
          </button>
        ) : (
          <button
            className="btn-connect"
            onClick={connect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting…' : '⚡ Connect Serial'}
          </button>
        )}
      </div>
    </div>
  );
}
