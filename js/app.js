// Main application controller
const App = (() => {

  const NOW         = new Date();
  const CURR_YEAR   = NOW.getFullYear();
  const NEXT_YEAR   = CURR_YEAR + 1;

  let activeTab     = 'expenses';
  let selectedYear  = CURR_YEAR;

  // Filter state
  const EF = { from: '', to: '', store: '', remarks: '' };
  const IF = { from: '', to: '', dog:   '', source: '', type: '' };

  // ── Bootstrap ───────────────────────────────────────────────
  function init() {
    checkConfig();
    buildYearSelector();
    setupAuth();
    setupTabs();
    setupFilters();
    setupModal();
    render();
  }

  // ── Config check ────────────────────────────────────────────
  function checkConfig() {
    if (CONFIG.CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
      document.getElementById('setup-banner').classList.remove('hidden');
    }
    document.getElementById('setup-dismiss').addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('setup-banner').classList.add('hidden');
    });
  }

  // ── Year selector ────────────────────────────────────────────
  function buildYearSelector() {
    const sel = document.getElementById('year-select');
    for (let y = NEXT_YEAR; y >= (CONFIG.START_YEAR || 2020); y--) {
      const o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      if (y === CURR_YEAR) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      selectedYear = parseInt(sel.value);
      resetFilters();
      updateYearUI();
      render();
    });
    updateYearUI();
  }

  function canAdd() { return selectedYear === CURR_YEAR || selectedYear === NEXT_YEAR; }

  function updateYearUI() {
    const badge  = document.getElementById('year-badge');
    const addBtn = document.getElementById('add-btn');
    if (canAdd()) {
      badge.classList.add('hidden');
      addBtn.disabled = false;
      addBtn.title = '';
    } else {
      badge.classList.remove('hidden');
      addBtn.disabled = true;
      addBtn.title = 'Cannot add entries for past years';
    }
  }

  // ── Auth ─────────────────────────────────────────────────────
  function setupAuth() {
    Auth.init(onAuthChange);
    document.getElementById('connect-btn').addEventListener('click', Auth.connect);
    document.getElementById('disconnect-btn').addEventListener('click', Auth.disconnect);
    document.getElementById('sync-btn').addEventListener('click', handleSync);
  }

  function onAuthChange(connected) {
    document.getElementById('connect-btn').classList.toggle('hidden', connected);
    document.getElementById('auth-status').classList.toggle('hidden', !connected);
    document.getElementById('sync-btn').disabled = !connected;

    if (connected) {
      Sheets.pushPending()
        .then(({ exp, inc }) => {
          const n = exp + inc;
          if (n > 0) { render(); toast(`Auto-synced ${n} pending row(s)`, 'success'); }
        })
        .catch(err => toast('Auto-sync failed: ' + err.message, 'error'));
    }
  }

  async function handleSync() {
    const btn = document.getElementById('sync-btn');
    btn.classList.add('syncing');
    btn.disabled = true;
    try {
      const { exp, inc } = await Sheets.pullYear(selectedYear);
      render();
      if (exp + inc > 0) {
        toast(`Synced: ${exp} expense${exp !== 1 ? 's' : ''}, ${inc} income row${inc !== 1 ? 's' : ''} added`, 'success');
      } else {
        toast('Already up to date', 'info');
      }
    } catch (err) {
      toast('Sync failed: ' + err.message, 'error');
    } finally {
      btn.classList.remove('syncing');
      btn.disabled = false;
    }
  }

  // ── Tabs ──────────────────────────────────────────────────────
  function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        document.getElementById(`tab-${activeTab}`).classList.add('active');
      });
    });
  }

  // ── Filters ──────────────────────────────────────────────────
  function setupFilters() {
    // Expense filters
    document.getElementById('exp-from').addEventListener('input',    e => { EF.from    = e.target.value; renderExpenses(); });
    document.getElementById('exp-to').addEventListener('input',      e => { EF.to      = e.target.value; renderExpenses(); });
    document.getElementById('exp-store').addEventListener('change',  e => { EF.store   = e.target.value; renderExpenses(); });
    document.getElementById('exp-remarks').addEventListener('change',e => { EF.remarks = e.target.value; renderExpenses(); });
    document.getElementById('exp-clear').addEventListener('click', () => {
      resetExpenseFilters(); renderExpenses();
    });

    // Income filters
    document.getElementById('inc-from').addEventListener('input',    e => { IF.from   = e.target.value; renderIncome(); });
    document.getElementById('inc-to').addEventListener('input',      e => { IF.to     = e.target.value; renderIncome(); });
    document.getElementById('inc-dog').addEventListener('change',    e => { IF.dog    = e.target.value; renderIncome(); });
    document.getElementById('inc-source').addEventListener('change', e => { IF.source = e.target.value; renderIncome(); });
    document.getElementById('inc-type').addEventListener('change',   e => { IF.type   = e.target.value; renderIncome(); });
    document.getElementById('inc-clear').addEventListener('click', () => {
      resetIncomeFilters(); renderIncome();
    });
  }

  function resetExpenseFilters() {
    Object.assign(EF, { from: '', to: '', store: '', remarks: '' });
    document.getElementById('exp-from').value    = '';
    document.getElementById('exp-to').value      = '';
    document.getElementById('exp-store').value   = '';
    document.getElementById('exp-remarks').value = '';
  }

  function resetIncomeFilters() {
    Object.assign(IF, { from: '', to: '', dog: '', source: '', type: '' });
    document.getElementById('inc-from').value   = '';
    document.getElementById('inc-to').value     = '';
    document.getElementById('inc-dog').value    = '';
    document.getElementById('inc-source').value = '';
    document.getElementById('inc-type').value   = '';
  }

  function resetFilters() { resetExpenseFilters(); resetIncomeFilters(); }

  // ── Modal ─────────────────────────────────────────────────────
  function setupModal() {
    document.getElementById('add-btn').addEventListener('click', openModal);
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.querySelectorAll('.modal-cancel').forEach(b => b.addEventListener('click', closeModal));
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-overlay')) closeModal();
    });
    document.getElementById('expense-form').addEventListener('submit', e => { e.preventDefault(); submitExpense(); });
    document.getElementById('income-form').addEventListener('submit',  e => { e.preventDefault(); submitIncome(); });
  }

  function openModal() {
    if (!canAdd()) return;
    const isIncome = activeTab === 'income';
    document.getElementById('modal-title').textContent = isIncome ? 'Add Income' : 'Add Expense';
    document.getElementById('expense-form').classList.toggle('hidden', isIncome);
    document.getElementById('income-form').classList.toggle('hidden', !isIncome);

    // Set default date to today (within selected year)
    const today = new Date();
    const dateStr = today.getFullYear() === selectedYear
      ? today.toISOString().split('T')[0]
      : `${selectedYear}-01-01`;

    if (isIncome) {
      document.getElementById('income-form').reset();
      document.getElementById('i-date').value = dateStr;
      // Constrain dates to selected year
      document.getElementById('i-date').min = `${selectedYear}-01-01`;
      document.getElementById('i-date').max = `${selectedYear}-12-31`;
      // Populate autocomplete datalists
      populateDogDatalist();
      populateSourceDatalist();
    } else {
      document.getElementById('expense-form').reset();
      document.getElementById('f-date').value = dateStr;
      document.getElementById('f-date').min = `${selectedYear}-01-01`;
      document.getElementById('f-date').max = `${selectedYear}-12-31`;
      populateStoreDatalist();
    }

    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(() => {
      const first = (isIncome ? document.getElementById('i-date') : document.getElementById('f-date'));
      first && first.focus();
    }, 60);
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  function populateStoreDatalist() {
    const stores = [...new Set(Storage.getExpenses().map(e => e.store).filter(Boolean))].sort();
    document.getElementById('store-datalist').innerHTML = stores.map(s => `<option value="${esc(s)}">`).join('');
  }
  function populateDogDatalist() {
    const dogs = [...new Set(Storage.getIncome().map(i => i.dogName).filter(Boolean))].sort();
    document.getElementById('dog-datalist').innerHTML = dogs.map(d => `<option value="${esc(d)}">`).join('');
  }
  function populateSourceDatalist() {
    const sources = [...new Set(Storage.getIncome().map(i => i.source).filter(Boolean))].sort();
    document.getElementById('source-datalist').innerHTML = sources.map(s => `<option value="${esc(s)}">`).join('');
  }

  // ── Submit expense ────────────────────────────────────────────
  async function submitExpense() {
    const submitBtn = document.getElementById('exp-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    const expense = {
      id:        crypto.randomUUID(),
      date:      document.getElementById('f-date').value,
      expense:   document.getElementById('f-expense').value.trim(),
      amount:    parseFloat(document.getElementById('f-amount').value),
      store:     document.getElementById('f-store').value.trim(),
      remarks:   document.getElementById('f-remarks').value.trim(),
      synced:    false,
      createdAt: new Date().toISOString(),
    };

    Storage.addExpense(expense);
    closeModal();
    render();
    toast('Expense saved', 'success');

    if (Auth.isConnected()) {
      try {
        await Sheets.pushExpense(expense);
        render();
        toast('Synced to Google Sheets ✓', 'success');
      } catch (err) {
        toast('Saved locally — sync failed: ' + err.message, 'error');
      }
    } else {
      toast('Saved locally. Connect to sync.', 'info');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Expense';
  }

  // ── Submit income ─────────────────────────────────────────────
  async function submitIncome() {
    const submitBtn = document.getElementById('inc-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    const income = {
      id:         crypto.randomUUID(),
      date:       document.getElementById('i-date').value,
      dogName:    document.getElementById('i-dog').value.trim(),
      incomeType: document.getElementById('i-itype').value,
      income:     parseFloat(document.getElementById('i-amount').value),
      source:     document.getElementById('i-source').value.trim(),
      synced:     false,
      createdAt:  new Date().toISOString(),
    };

    Storage.addIncome(income);
    closeModal();
    render();
    toast('Income saved', 'success');

    if (Auth.isConnected()) {
      try {
        await Sheets.pushIncome(income);
        render();
        toast('Synced to Google Sheets ✓', 'success');
      } catch (err) {
        toast('Saved locally — sync failed: ' + err.message, 'error');
      }
    } else {
      toast('Saved locally. Connect to sync.', 'info');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Income';
  }

  // ── Delete (local only) ───────────────────────────────────────
  function deleteExpense(id) {
    if (!confirm('Remove this expense from the app?\n(It will NOT be deleted from Google Sheets.)')) return;
    Storage.removeExpense(id);
    render();
  }

  function deleteIncome(id) {
    if (!confirm('Remove this income row from the app?\n(It will NOT be deleted from Google Sheets.)')) return;
    Storage.removeIncome(id);
    render();
  }

  // ── Render ────────────────────────────────────────────────────
  function render() {
    renderExpenses();
    renderIncome();
  }

  // ── Render expenses ───────────────────────────────────────────
  function renderExpenses() {
    let rows = Storage.getExpenses()
      .filter(e => e.date && e.date.startsWith(String(selectedYear)));

    // Apply filters
    // Populate store dropdown before filtering
    populateStoreFilter(rows);

    if (EF.from)    rows = rows.filter(e => e.date >= EF.from);
    if (EF.to)      rows = rows.filter(e => e.date <= EF.to);
    if (EF.store)   rows = rows.filter(e => e.store === EF.store);
    if (EF.remarks === 'yes') rows = rows.filter(e => e.remarks && e.remarks.trim());
    if (EF.remarks === 'no')  rows = rows.filter(e => !e.remarks || !e.remarks.trim());

    rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    const total = rows.reduce((s, e) => s + e.amount, 0);
    document.getElementById('exp-count').textContent = rows.length;
    document.getElementById('exp-total').textContent = fmt(total);

    const tbody = document.getElementById('expense-body');
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
        <strong>No expenses found</strong>
        ${canAdd() ? 'Click "+ Add" to record one.' : 'Sync from Google Sheets to load data.'}
      </div></td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(e => `
      <tr>
        <td class="col-date">${fmtDate(e.date)}</td>
        <td>${esc(e.expense)}</td>
        <td class="col-num amt-expense">−${fmt(e.amount)}</td>
        <td>${esc(e.store) || '<span class="muted">—</span>'}</td>
        <td>${esc(e.remarks) || '<span class="muted">—</span>'}</td>
        <td class="col-sync">
          <span class="sync-dot ${e.synced ? 'synced' : 'pending'}"
                title="${e.synced ? 'Synced' : 'Pending sync'}"></span>
        </td>
        <td class="col-action">
          <button class="delete-btn" onclick="App.deleteExpense('${e.id}')" title="Remove from app">✕</button>
        </td>
      </tr>
    `).join('');
  }

  // ── Render income ─────────────────────────────────────────────
  function renderIncome() {
    let rows = Storage.getIncome()
      .filter(i => i.date && i.date.startsWith(String(selectedYear)));

    // Populate dog and source filter dropdowns from data
    populateIncomeFilters(rows);

    // Apply filters
    if (IF.from)   rows = rows.filter(i => i.date >= IF.from);
    if (IF.to)     rows = rows.filter(i => i.date <= IF.to);
    if (IF.dog)    rows = rows.filter(i => i.dogName === IF.dog);
    if (IF.source) rows = rows.filter(i => i.source  === IF.source);
    if (IF.type)   rows = rows.filter(i => i.incomeType === IF.type);

    rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    const total = rows.reduce((s, i) => s + i.income, 0);
    document.getElementById('inc-count').textContent = rows.length;
    document.getElementById('inc-total').textContent = fmt(total);

    const tbody = document.getElementById('income-body');
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
        <strong>No income rows found</strong>
        ${canAdd() ? 'Click "+ Add" to record one.' : 'Sync from Google Sheets to load data.'}
      </div></td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(i => `
      <tr>
        <td class="col-date">${fmtDate(i.date)}</td>
        <td>${esc(i.dogName)}</td>
        <td class="col-num amt-income">+${fmt(i.income)}</td>
        <td>${esc(i.source) || '<span class="muted">—</span>'}</td>
        <td>
          <span class="badge ${i.incomeType === 'Tips' ? 'badge-tips' : 'badge-regular'}">
            ${i.incomeType}
          </span>
        </td>
        <td class="col-sync">
          <span class="sync-dot ${i.synced ? 'synced' : 'pending'}"
                title="${i.synced ? 'Synced' : 'Pending sync'}"></span>
        </td>
        <td class="col-action">
          <button class="delete-btn" onclick="App.deleteIncome('${i.id}')" title="Remove from app">✕</button>
        </td>
      </tr>
    `).join('');
  }

  function populateStoreFilter(yearRows) {
    const stores = [...new Set(yearRows.map(e => e.store).filter(Boolean))].sort();
    const sel = document.getElementById('exp-store');
    const cur = sel.value;
    sel.innerHTML = '<option value="">All Stores</option>'
      + stores.map(s => `<option value="${esc(s)}"${s === cur ? ' selected' : ''}>${esc(s)}</option>`).join('');
  }

  function populateIncomeFilters(yearRows) {
    const dogs    = [...new Set(yearRows.map(i => i.dogName).filter(Boolean))].sort();
    const sources = [...new Set(yearRows.map(i => i.source).filter(Boolean))].sort();

    const dogSel = document.getElementById('inc-dog');
    const cur    = dogSel.value;
    dogSel.innerHTML = '<option value="">All Dogs</option>'
      + dogs.map(d => `<option value="${esc(d)}"${d === cur ? ' selected' : ''}>${esc(d)}</option>`).join('');

    const srcSel = document.getElementById('inc-source');
    const curS   = srcSel.value;
    srcSel.innerHTML = '<option value="">All Sources</option>'
      + sources.map(s => `<option value="${esc(s)}"${s === curS ? ' selected' : ''}>${esc(s)}</option>`).join('');
  }

  // ── Helpers ────────────────────────────────────────────────────
  function fmt(amount) {
    return `${CONFIG.CURRENCY}${Math.abs(amount).toLocaleString('en-GB', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    })}`;
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}${MONTHS[parseInt(m, 10) - 1]}${y}`;
  }

  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function toast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // Public surface
  return { init, deleteExpense, deleteIncome };
})();

window.addEventListener('DOMContentLoaded', App.init);
