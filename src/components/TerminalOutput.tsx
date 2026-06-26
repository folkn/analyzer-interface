import { useRef, useEffect } from 'react';
import { useTerminalStore } from '../store/terminalStore';

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

export default function TerminalOutput() {
  const { entries, clear } = useTerminalStore();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <details className="terminal-panel">
      <summary className="terminal-summary">
        <span className="terminal-summary-label">Terminal</span>
        {entries.length > 0 && (
          <span className={`terminal-badge${entries.some(e => e.level === 'error') ? ' badge-error' : entries.some(e => e.level === 'warn') ? ' badge-warn' : ''}`}>
            {entries.length}
          </span>
        )}
        <button
          className="terminal-clear"
          onClick={e => { e.preventDefault(); clear(); }}
          title="Clear terminal"
        >
          Clear
        </button>
      </summary>
      <div className="terminal-body" ref={bodyRef}>
        {entries.length === 0 ? (
          <span className="terminal-empty">No messages yet.</span>
        ) : (
          entries.map(e => (
            <div key={e.id} className={`terminal-line tl-${e.level}`}>
              <span className="tl-time">{fmtTime(e.ts)}</span>
              <span className="tl-text">{e.text}</span>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
