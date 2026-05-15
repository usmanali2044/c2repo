import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import axios from 'axios';

function formatSize(bytes) {
  if (!bytes) return '—';
  const n = parseInt(bytes, 10);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType, name) {
  const ext = name?.split('.').pop()?.toLowerCase();
  if (mimeType?.includes('image') || ['png','jpg','jpeg','gif','webp'].includes(ext)) return '🖼';
  if (mimeType?.includes('pdf') || ext === 'pdf') return '📄';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return '📦';
  if (['txt','log','md','csv'].includes(ext)) return '📝';
  if (['exe','dll','bin'].includes(ext)) return '⚙️';
  if (['py','js','go','sh','bat','ps1'].includes(ext)) return '💻';
  return '📁';
}

export default function DrivePanel() {
  const { config, driveFiles, fetchDriveFiles, driveLoading, setShowDrive } = useApp();
  const [viewing, setViewing] = useState(null);
  const [viewContent, setViewContent] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchDriveFiles(); }, []);

  const filtered = driveFiles.filter(f =>
    f.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleView = async (file) => {
    setViewing(file);
    setViewContent(null);
    setViewLoading(true);
    try {
      const res = await axios.get(`/api/drive/view/${file.id}`, {
        params: { serviceAccountKey: config.serviceAccountKey },
      });
      setViewContent(res.data);
    } catch (e) {
      setViewContent({ error: e.response?.data?.error || e.message });
    } finally {
      setViewLoading(false);
    }
  };

  const handleDownload = (file) => {
    const key = encodeURIComponent(config.serviceAccountKey);
    const url = `/api/drive/download/${file.id}?serviceAccountKey=${key}`;
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click();
  };

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-end justify-end p-4">
      <div className="bg-[#0f1117] border border-[#21262d] rounded-xl w-full max-w-lg h-[85vh] flex flex-col shadow-2xl fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#21262d] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #00d4ff22, #00d4ff11)', border: '1px solid #00d4ff30' }}>
              <svg className="w-4 h-4 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#e6edf3]">Exfiltrated Files</h2>
              <p className="text-[10px] text-[#8b949e]">{driveFiles.length} files in Google Drive</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchDriveFiles} disabled={driveLoading}
              className="text-[#8b949e] hover:text-[#00d4ff] transition-colors disabled:opacity-40">
              <svg className={`w-4 h-4 ${driveLoading ? 'spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
            <button onClick={() => setShowDrive(false)} className="text-[#8b949e] hover:text-[#e6edf3] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[#21262d] flex-shrink-0">
          <div className="flex items-center gap-2 bg-[#161b22] border border-[#21262d] rounded-lg px-3 py-2">
            <svg className="w-3.5 h-3.5 text-[#484f58]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search files…"
              className="bg-transparent flex-1 text-xs text-[#e6edf3] placeholder-[#484f58] outline-none"/>
          </div>
        </div>

        {/* File viewer */}
        {viewing && (
          <div className="border-b border-[#21262d] flex-shrink-0 max-h-48 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 bg-[#161b22]">
              <span className="text-xs text-[#00d4ff] font-medium truncate">{viewing.name}</span>
              <button onClick={() => { setViewing(null); setViewContent(null); }}
                className="text-[#484f58] hover:text-[#e6edf3] text-xs ml-2 flex-shrink-0">✗ close</button>
            </div>
            <div className="flex-1 overflow-auto px-4 py-2">
              {viewLoading ? (
                <p className="text-xs text-[#8b949e]">Loading…</p>
              ) : viewContent?.error ? (
                <p className="text-xs text-[#ff4757]">{viewContent.error}</p>
              ) : viewContent?.isText ? (
                <pre className="text-[11px] text-[#c9d1d9] whitespace-pre-wrap break-all leading-relaxed">
                  {viewContent.content}
                </pre>
              ) : (
                <p className="text-xs text-[#8b949e]">Binary file — download to view</p>
              )}
            </div>
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {driveLoading && driveFiles.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <svg className="w-5 h-5 spin text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="text-3xl mb-3 opacity-20">📂</div>
              <p className="text-[#484f58] text-xs">
                {search ? 'No matching files' : 'No files in Drive folder yet'}
              </p>
              <p className="text-[#484f58] text-[10px] mt-1">
                Use <code className="text-[#00d4ff]">upload;&lt;path&gt;</code> in the terminal
              </p>
            </div>
          ) : (
            filtered.map((file) => (
              <div key={file.id}
                className="file-card flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 border border-transparent cursor-pointer"
                onClick={() => handleView(file)}>
                <span className="text-xl flex-shrink-0">{fileIcon(file.mimeType, file.name)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#e6edf3] truncate font-medium">{file.name}</p>
                  <p className="text-[10px] text-[#484f58] mt-0.5">
                    {formatSize(file.size)} · {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); handleView(file); }}
                    className="p-1.5 rounded-lg text-[#8b949e] hover:text-[#00d4ff] hover:bg-[#00d4ff]/10 transition-all"
                    title="Preview">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDownload(file); }}
                    className="p-1.5 rounded-lg text-[#8b949e] hover:text-[#00ff88] hover:bg-[#00ff88]/10 transition-all"
                    title="Download">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
