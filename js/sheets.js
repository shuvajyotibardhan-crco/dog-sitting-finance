// Google Sheets API v4 integration
const Sheets = (() => {
  const HEADER = ['ID', 'Date', 'Type', 'Category', 'Amount', 'Description', 'Created At'];

  function range() {
    return `${CONFIG.SHEET_TAB}!A:G`;
  }

  async function apiCall(url, options = {}) {
    const token = Auth.getToken();
    if (!token) throw new Error('Not connected to Google. Please connect first.');

    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body?.error?.message || `API error (${res.status})`);
    }
    return body;
  }

  // Ensure the sheet has a header row (safe to call multiple times — checks first)
  async function ensureHeader() {
    const data = await apiCall(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${range()}`
    );
    if (!data.values || data.values.length === 0) {
      await appendRows([HEADER]);
    }
  }

  async function appendRows(rows) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${range()}:append`
      + `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    return apiCall(url, {
      method: 'POST',
      body: JSON.stringify({ values: rows })
    });
  }

  // Push one transaction to the sheet immediately after it's added in the app
  async function pushTransaction(transaction) {
    await ensureHeader();
    await appendRows([[
      transaction.id,
      transaction.date,
      transaction.type,
      transaction.category,
      transaction.amount,
      transaction.description || '',
      transaction.createdAt
    ]]);
    Storage.markSynced(transaction.id);
  }

  // Push all locally-pending transactions (used after reconnect)
  async function pushPending() {
    const pending = Storage.getPending();
    for (const t of pending) {
      await pushTransaction(t);
    }
    return pending.length;
  }

  // Pull all rows from the sheet; merge any missing IDs into localStorage
  async function pullFromSheet() {
    if (CONFIG.SHEET_ID === 'YOUR_SHEET_ID_HERE') {
      throw new Error('Please fill in your SHEET_ID in js/config.js');
    }
    const data = await apiCall(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${range()}`
    );

    if (!data.values || data.values.length <= 1) return 0;

    // Skip row 0 (header), parse the rest
    const rows = data.values.slice(1);
    const localIds = new Set(Storage.getAll().map(t => t.id));

    let added = 0;
    for (const row of rows) {
      const id = row[0];
      if (!id || localIds.has(id)) continue;

      const amount = parseFloat(row[4]);
      if (!amount) continue; // skip malformed rows

      Storage.upsert({
        id,
        date:        row[1] || '',
        type:        (row[2] || 'expense').toLowerCase(),
        category:    row[3] || 'Other',
        amount,
        description: row[5] || '',
        createdAt:   row[6] || new Date().toISOString(),
        synced: true
      });
      added++;
    }
    return added;
  }

  return { pushTransaction, pushPending, pullFromSheet };
})();
