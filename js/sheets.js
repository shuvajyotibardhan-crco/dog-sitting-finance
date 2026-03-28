// Google Sheets API v4 integration
// Expense tab columns: Date | Expense | Amount | Store | Remarks
// Income  tab columns: Date | DogName | Income | Source   (tips = "DogName-tips")
const Sheets = (() => {

  // ── Tab name helpers ────────────────────────────────────────
  function expTab(year) { return CONFIG.TAB_EXPENSE.replace('{year}', year); }
  function incTab(year) { return CONFIG.TAB_INCOME.replace('{year}', year); }

  // ── Low-level API call ──────────────────────────────────────
  async function api(url, options = {}) {
    const token = Auth.getToken();
    if (!token) throw new Error('Not connected to Google Sheets. Please connect first.');
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  // ── Range helpers ───────────────────────────────────────────
  function readUrl(tabName) {
    const r = encodeURIComponent(`'${tabName}'!A:F`);
    return `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${r}`;
  }

  function appendUrl(tabName) {
    const r = encodeURIComponent(`'${tabName}'!A:F`);
    return `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${r}:append`
         + `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  }

  // ── Date normalisation ──────────────────────────────────────
  // Handles DD/MM/YYYY, YYYY-MM-DD, and anything Date() can parse
  function normaliseDate(str) {
    if (!str) return '';
    str = String(str).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const ddmm = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`;
    const d = new Date(str);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
    return str;
  }

  // ── Tips parsing ────────────────────────────────────────────
  function parseDogName(raw) {
    const s = (raw || '').trim();
    if (s.toLowerCase().endsWith('-tips')) {
      return { dogName: s.slice(0, -5).trim(), incomeType: 'Tips' };
    }
    return { dogName: s, incomeType: 'Regular' };
  }

  function toDogField(dogName, incomeType) {
    return incomeType === 'Tips' ? `${dogName}-tips` : dogName;
  }

  // ── Push one expense to sheet ───────────────────────────────
  async function pushExpense(e) {
    await api(appendUrl(expTab(e.date.substring(0, 4))), {
      method: 'POST',
      body: JSON.stringify({ values: [[
        e.date, e.expense, e.amount, e.store || '', e.remarks || ''
      ]] }),
    });
    Storage.markExpenseSynced(e.id);
  }

  // ── Push one income row to sheet ────────────────────────────
  async function pushIncome(i) {
    await api(appendUrl(incTab(i.date.substring(0, 4))), {
      method: 'POST',
      body: JSON.stringify({ values: [[
        i.date, toDogField(i.dogName, i.incomeType), i.income, i.source || ''
      ]] }),
    });
    Storage.markIncomeSynced(i.id);
  }

  // ── Push all pending (called after reconnect) ───────────────
  async function pushPending() {
    let exp = 0, inc = 0;
    for (const e of Storage.getPendingExpenses()) { await pushExpense(e); exp++; }
    for (const i of Storage.getPendingIncome())   { await pushIncome(i);   inc++; }
    return { exp, inc };
  }

  // ── Pull expenses for a given year ─────────────────────────
  async function pullExpenses(year) {
    let data;
    try {
      data = await api(readUrl(expTab(year)));
    } catch (e) {
      // Tab might not exist yet — treat as empty
      if (e.message.includes('Unable to parse range') || e.message.includes('404')) return 0;
      throw e;
    }
    if (!data.values || data.values.length <= 1) return 0;

    let added = 0;
    for (const row of data.values.slice(1)) {       // skip header row
      const date = normaliseDate(row[0]);
      if (!date) continue;
      const amount = parseFloat(String(row[2]).replace(/[^0-9.-]/g, ''));
      if (isNaN(amount)) continue;

      const ok = Storage.upsertExpense({
        id:        crypto.randomUUID(),
        date,
        expense:   row[1] || '',
        amount,
        store:     row[3] || '',
        remarks:   row[4] || '',
        synced:    true,
        createdAt: new Date().toISOString(),
      });
      if (ok) added++;
    }
    return added;
  }

  // ── Pull income for a given year ────────────────────────────
  async function pullIncome(year) {
    let data;
    try {
      data = await api(readUrl(incTab(year)));
    } catch (e) {
      if (e.message.includes('Unable to parse range') || e.message.includes('404')) return 0;
      throw e;
    }
    if (!data.values || data.values.length <= 1) return 0;

    let added = 0;
    for (const row of data.values.slice(1)) {
      const date = normaliseDate(row[0]);
      if (!date) continue;
      const income = parseFloat(String(row[2]).replace(/[^0-9.-]/g, ''));
      if (isNaN(income)) continue;

      const { dogName, incomeType } = parseDogName(row[1]);

      const ok = Storage.upsertIncome({
        id:         crypto.randomUUID(),
        date,
        dogName,
        incomeType,
        income,
        source:     row[3] || '',
        synced:     true,
        createdAt:  new Date().toISOString(),
      });
      if (ok) added++;
    }
    return added;
  }

  // ── Pull both sheets for a year ─────────────────────────────
  async function pullYear(year) {
    const [exp, inc] = await Promise.all([pullExpenses(year), pullIncome(year)]);
    return { exp, inc };
  }

  return { pushExpense, pushIncome, pushPending, pullYear };
})();
