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
    // dateTimeRenderOption=FORMATTED_STRING: date cells come back as visible text
    // (without this, Google Sheets returns date cells as integer serial numbers)
    return `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${r}`
         + `?dateTimeRenderOption=FORMATTED_STRING&valueRenderOption=FORMATTED_VALUE`;
  }

  function appendUrl(tabName) {
    const r = encodeURIComponent(`'${tabName}'!A:F`);
    return `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${r}:append`
         + `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  }

  // ── Date normalisation ──────────────────────────────────────
  // Handles DD/MM/YYYY, YYYY-MM-DD, and anything Date() can parse
  const MONTH_MAP = {
    jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
  };

  function normaliseDate(str) {
    if (!str) return '';
    str = String(str).trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // DD/MM/YYYY or D/M/YYYY
    const slashFmt = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashFmt) return `${slashFmt[3]}-${slashFmt[2].padStart(2,'0')}-${slashFmt[1].padStart(2,'0')}`;
    // ddMMMyyyy  e.g. "01Jan2025"
    const dmyFmt = str.match(/^(\d{1,2})([A-Za-z]{3})(\d{4})$/);
    if (dmyFmt) {
      const mo = MONTH_MAP[dmyFmt[2].toLowerCase()];
      if (mo) return `${dmyFmt[3]}-${String(mo).padStart(2,'0')}-${dmyFmt[1].padStart(2,'0')}`;
    }
    // DDMMYYYY (8 digits, no separator)
    if (/^\d{8}$/.test(str)) {
      return `${str.slice(4)}-${str.slice(2,4)}-${str.slice(0,2)}`;
    }
    // Fallback
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
      if (e.message.includes('Unable to parse range') || e.message.includes('404')) return { added: 0, removed: 0 };
      throw e;
    }

    const sheetRows = [];
    const sheetKeys = new Set();

    for (const row of (data.values || [])) {
      const date = normaliseDate(row[0]);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const amount = parseFloat(String(row[2]).replace(/[^0-9.-]/g, ''));
      if (isNaN(amount) || amount === 0) continue;

      const e = {
        id: crypto.randomUUID(), date,
        expense:   row[1] || '',
        amount,
        store:     row[3] || '',
        remarks:   row[4] || '',
        synced: true, createdAt: new Date().toISOString(),
      };
      sheetKeys.add(Storage.expKey(e));
      sheetRows.push(e);
    }

    let added = 0;
    for (const e of sheetRows) { if (Storage.upsertExpense(e)) added++; }

    // Remove local rows that were deleted from the sheet
    const removed = Storage.removeExpensesNotInSheet(year, sheetKeys);
    return { added, removed };
  }

  // ── Pull income for a given year ────────────────────────────
  async function pullIncome(year) {
    let data;
    try {
      data = await api(readUrl(incTab(year)));
    } catch (e) {
      if (e.message.includes('Unable to parse range') || e.message.includes('404')) return { added: 0, removed: 0 };
      throw e;
    }

    const sheetRows = [];
    const sheetKeys = new Set();

    for (const row of (data.values || [])) {
      const date = normaliseDate(row[0]);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const income = parseFloat(String(row[2]).replace(/[^0-9.-]/g, ''));
      if (isNaN(income) || income === 0) continue;

      const { dogName, incomeType } = parseDogName(row[1]);
      const i = {
        id: crypto.randomUUID(), date, dogName, incomeType, income,
        source: row[3] || '',
        synced: true, createdAt: new Date().toISOString(),
      };
      sheetKeys.add(Storage.incKey(i));
      sheetRows.push(i);
    }

    let added = 0;
    for (const i of sheetRows) { if (Storage.upsertIncome(i)) added++; }

    // Remove local rows that were deleted from the sheet
    const removed = Storage.removeIncomeNotInSheet(year, sheetKeys);
    return { added, removed };
  }

  // ── Pull both sheets for a year ─────────────────────────────
  async function pullYear(year) {
    const [exp, inc] = await Promise.all([pullExpenses(year), pullIncome(year)]);
    return {
      added:   exp.added   + inc.added,
      removed: exp.removed + inc.removed,
      exp, inc,
    };
  }

  return { pushExpense, pushIncome, pushPending, pullYear };
})();
