import { useApp } from '../context/AppContext';

function formatVictimDate(title) {
  // Titles like: "09-05-2026-WIN-DDS04GK93AD-31242"
  const parts = title.split('-');
  if (parts.length >= 3) {
    const day = parts[0];
    const month = parts[1];
    const year = parts[2];
    return `${day}/${month}/${year}`;
  }
  return '';
}

function formatVictimName(title) {
  // Extract hostname part: everything after the date prefix
  const match = title.match(/^\d{2}-\d{2}-\d{4}-(.+)$/);
  return match ? match[1] : title;
}

export default function Sidebar() {
  const {
    victims, activeVictim, setActiveVictim,
    loading, fetchVictims, isConfigured,
    setShowSettings, setShowDrive, config,
    sleepStatus, victimStatus,
  } = useApp();

  return (
    <aside className="flex flex-col h-full w-64 border-r border-[#21262d] bg-[#0f1117] flex-shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[#21262d]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #00ff88, #00d4ff)' }}>
            <svg className="w-4 h-4 text-[#0a0c10]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-[#e6edf3] tracking-wide">GC2</div>
            <div className="text-[10px] text-[#8b949e] tracking-widest uppercase">Command &amp; Control</div>
          </div>
        </div>
      </div>

      {/* Victims header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-[#8b949e] font-semibold">
          Victims ({victims.length})
        </span>
        <button
          onClick={fetchVictims}
          disabled={!isConfigured || loading}
          className="text-[#8b949e] hover:text-[#00ff88] transition-colors disabled:opacity-40"
          title="Refresh victims"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Victim list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {!isConfigured ? (
          <div className="px-2 py-6 text-center">
            <div className="text-[#484f58] text-xs mb-3">Not configured</div>
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs text-[#00ff88] hover:underline"
            >
              Open Settings →
            </button>
          </div>
        ) : victims.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <div className="text-[#484f58] text-xs">
              {loading ? 'Loading...' : 'No victims connected'}
            </div>
          </div>
        ) : (
          victims.map((v) => {
            const isActive = activeVictim?.id === v.id;
            const sleepEntry = sleepStatus?.[v.id];
            const now = new Date();
            const isSleeping = sleepEntry && new Date(sleepEntry.wakeAt) > now;
            const status = sleepEntry?.state || (victimStatus?.[v.id] === 'online' ? 'online' : 'offline');

            let statusColor = 'bg-[#30363d]';
            let statusLabel = 'Offline';
            if (isSleeping) {
              statusColor = 'bg-[#ffa502]';
              statusLabel = 'Sleeping';
            } else if (status === 'ready') {
              statusColor = 'bg-[#00ff88]';
              statusLabel = 'Ready';
            } else if (status === 'waiting') {
              statusColor = 'bg-[#ff4757]';
              statusLabel = 'Offline';
            } else if (status === 'online' || isActive) {
              statusColor = 'bg-[#00ff88]';
              statusLabel = 'Online';
            }

            const name = formatVictimName(v.title);
            const date = formatVictimDate(v.title);
            return (
              <button
                key={v.id}
                onClick={() => setActiveVictim(v)}
                className={`victim-card w-full text-left px-3 py-2.5 rounded-lg mb-1 ${isActive ? 'active' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 pulse-online ${statusColor}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#e6edf3] truncate" title={name}>
                      {name}
                    </div>
                    {date && (
                      <div className="text-[10px] text-[#484f58] mt-0.5">
                        {date}
                        {statusLabel !== 'Online' && (
                          <span className={`ml-2 ${
                            statusColor === 'bg-[#ffa502]' ? 'text-[#ffa502]' :
                            statusColor === 'bg-[#ff4757]' ? 'text-[#ff4757]' :
                            'text-[#484f58]'
                          }`}>
                            {statusLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Bottom nav */}
      <div className="border-t border-[#21262d] p-2 space-y-1">
        {config.driveId && (
          <button
            onClick={() => setShowDrive(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#8b949e] hover:text-[#00d4ff] hover:bg-[#00d4ff]/5 transition-all text-xs"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Exfiltrated Files
          </button>
        )}
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] transition-all text-xs"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>
    </aside>
  );
}
