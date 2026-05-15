import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function SettingsModal() {
  const { config, saveConfig, fetchConfig, setShowSettings, fetchVictims, configError } = useApp();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    serviceAccountKey: '',
    sheetId: config.sheetId || '',
    driveId: config.driveId || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const handle = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    const payload = {};
    if (form.sheetId)           payload.sheetId = form.sheetId;
    if (form.driveId)           payload.driveId = form.driveId;
    if (form.serviceAccountKey) payload.serviceAccountKey = form.serviceAccountKey;
    await saveConfig(payload);
    await fetchVictims();
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); setEditing(false); }, 1500);
  };

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f1117] border border-[#21262d] rounded-xl w-full max-w-xl shadow-2xl fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#e6edf3]">Configuration</h2>
              <p className="text-[10px] text-[#8b949e]">Auto-loaded from <code className="text-[#00ff88]">cmd/options.yml</code></p>
            </div>
          </div>
          <button onClick={() => setShowSettings(false)} className="text-[#8b949e] hover:text-[#e6edf3] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Config error banner */}
          {configError && (
            <div className="flex items-start gap-2 bg-[#ff4757]/10 border border-[#ff4757]/20 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-[#ff4757] flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-[#ff4757]">{configError}</p>
            </div>
          )}

          {/* Read-only status cards */}
          {!editing && (
            <div className="space-y-3">
              <StatusRow
                label="Command Service"
                value={config.commandService || '—'}
                ok={!!config.commandService}
              />
              <StatusRow
                label="File System Service"
                value={config.fileSystemService || '—'}
                ok={!!config.fileSystemService}
              />
              <StatusRow
                label="Google Sheet ID"
                value={config.sheetId || 'Not set'}
                ok={!!config.sheetId}
                mono
              />
              <StatusRow
                label="Google Drive ID"
                value={config.driveId || 'Not set'}
                ok={!!config.driveId}
                mono
              />
              <StatusRow
                label="Service Account Key"
                value={config.hasServiceAccount ? '✓ Loaded from options.yml' : '✗ Not found'}
                ok={config.hasServiceAccount}
              />
            </div>
          )}

          {/* Edit form */}
          {editing && (
            <div className="space-y-4">
              <div className="bg-[#161b22] border border-[#ffa502]/20 rounded-lg px-4 py-3 text-xs text-[#ffa502]">
                ⚠ Changes will be written back to <code>cmd/options.yml</code>
              </div>

              <Field
                label="Google Sheet ID"
                value={form.sheetId}
                onChange={handle('sheetId')}
                placeholder="0987654321..."
              />
              <Field
                label="Google Drive Folder ID"
                value={form.driveId}
                onChange={handle('driveId')}
                placeholder="1234554321..."
              />
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#8b949e] mb-2">
                  Google Service Account Key (JSON) — leave blank to keep current
                </label>
                <textarea
                  rows={4}
                  value={form.serviceAccountKey}
                  onChange={handle('serviceAccountKey')}
                  placeholder='{"type":"service_account", ...}'
                  className="w-full bg-[#0a0c10] border border-[#21262d] rounded-lg px-3 py-2.5 text-xs text-[#e6edf3] placeholder-[#484f58] terminal-input resize-none"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#21262d]">
          <button
            onClick={fetchConfig}
            className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#00ff88] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Re-read options.yml
          </button>

          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 rounded-lg text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#00ff88,#00d4ff)', color: '#0a0c10' }}
                >
                  {saving ? '…Saving' : saved ? '✓ Saved!' : '💾 Save to options.yml'}
                </button>
              </>
            ) : (
              <button
                onClick={() => { setForm({ serviceAccountKey: '', sheetId: config.sheetId, driveId: config.driveId }); setEditing(true); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] border border-[#21262d] transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, value, ok, mono }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#21262d]/50">
      <span className="text-xs text-[#8b949e]">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-xs ${mono ? 'font-mono' : ''} ${ok ? 'text-[#e6edf3]' : 'text-[#484f58]'} max-w-[220px] truncate text-right`}>
          {value}
        </span>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-[#00ff88]' : 'bg-[#ff4757]'}`} />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-[#8b949e] mb-2">{label}</label>
      <input
        type="text" value={value} onChange={onChange} placeholder={placeholder}
        className="w-full bg-[#0a0c10] border border-[#21262d] rounded-lg px-3 py-2.5 text-xs text-[#e6edf3] placeholder-[#484f58] terminal-input"
        style={{ fontFamily: 'monospace' }}
      />
    </div>
  );
}
