// Main application controller
const App = (() => {

  const NOW         = new Date();
  const CURR_YEAR   = NOW.getFullYear();
  const NEXT_YEAR   = CURR_YEAR + 1;

  let activeTab     = 'expenses';
  let selectedYear  = CURR_YEAR;

  // Filter state
  const EF = { from: '', to: '', store: '', remarks: '', sort: 'desc' };
  const IF = { from: '', to: '', dog:   '', source: '', type: '', sort: 'desc' };

  // Selection state (persists across re-renders)
  const expSelected = new Set();
  const incSelected = new Set();

  // Edit state
  let editingId   = null;
  let editingType = null; // 'expense' | 'income'

  // ── Bootstrap ───────────────────────────────────────────────
  function init() {
    checkConfig();
    buildYearSelector();
    setupAuth();
    setupTabs();
    setupFilters();
    setupModal();
    setupSelection();
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
    // Sync currency symbol in form labels
    document.querySelectorAll('.currency-label').forEach(el => el.textContent = CONFIG.CURRENCY);
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
      // ① Push any locally-pending rows first
      const { exp: pushedExp, inc: pushedInc } = await Sheets.pushPending();

      // ② Pull from sheet (adds missing, removes deleted)
      const { added, removed, exp, inc } = await Sheets.pullYear(selectedYear);
      render();

      const parts = [];
      const pushed = pushedExp + pushedInc;
      if (pushed)      parts.push(`${pushed} pending row${pushed !== 1 ? 's' : ''} pushed`);
      if (exp.added)   parts.push(`${exp.added} expense${exp.added !== 1 ? 's' : ''} added`);
      if (inc.added)   parts.push(`${inc.added} income row${inc.added !== 1 ? 's' : ''} added`);
      if (removed)     parts.push(`${removed} removed (deleted from sheet)`);
      toast(parts.length ? parts.join(' · ') : 'Already up to date', parts.length ? 'success' : 'info');
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
    document.getElementById('exp-sort').addEventListener('change',   e => { EF.sort    = e.target.value; renderExpenses(); });
    document.getElementById('exp-clear').addEventListener('click', () => {
      resetExpenseFilters(); renderExpenses();
    });

    // Income filters
    document.getElementById('inc-from').addEventListener('input',    e => { IF.from   = e.target.value; renderIncome(); });
    document.getElementById('inc-to').addEventListener('input',      e => { IF.to     = e.target.value; renderIncome(); });
    document.getElementById('inc-dog').addEventListener('change',    e => { IF.dog    = e.target.value; renderIncome(); });
    document.getElementById('inc-source').addEventListener('change', e => { IF.source = e.target.value; renderIncome(); });
    document.getElementById('inc-type').addEventListener('change',   e => { IF.type   = e.target.value; renderIncome(); });
    document.getElementById('inc-sort').addEventListener('change',   e => { IF.sort   = e.target.value; renderIncome(); });
    document.getElementById('inc-clear').addEventListener('click', () => {
      resetIncomeFilters(); renderIncome();
    });
  }

  function resetExpenseFilters() {
    Object.assign(EF, { from: '', to: '', store: '', remarks: '', sort: 'desc' });
    document.getElementById('exp-from').value    = '';
    document.getElementById('exp-to').value      = '';
    document.getElementById('exp-store').value   = '';
    document.getElementById('exp-remarks').value = '';
    document.getElementById('exp-sort').value    = 'desc';
  }

  function resetIncomeFilters() {
    Object.assign(IF, { from: '', to: '', dog: '', source: '', type: '', sort: 'desc' });
    document.getElementById('inc-from').value   = '';
    document.getElementById('inc-to').value     = '';
    document.getElementById('inc-dog').value    = '';
    document.getElementById('inc-source').value = '';
    document.getElementById('inc-type').value   = '';
    document.getElementById('inc-sort').value   = 'desc';
  }

  function resetFilters() { resetExpenseFilters(); resetIncomeFilters(); }

  // ── Selection & Re-sync ───────────────────────────────────────
  function setupSelection() {
    // Expense checkboxes (event delegation on tbody)
    document.getElementById('expense-body').addEventListener('change', e => {
      if (!e.target.matches('.row-check')) return;
      const id = e.target.dataset.id;
      e.target.checked ? expSelected.add(id) : expSelected.delete(id);
      updateResyncBtn('exp', expSelected);
      updateSelectAllBox('exp-check-all', expSelected, 'expense-body');
    });

    // Income checkboxes
    document.getElementById('income-body').addEventListener('change', e => {
      if (!e.target.matches('.row-check')) return;
      const id = e.target.dataset.id;
      e.target.checked ? incSelected.add(id) : incSelected.delete(id);
      updateResyncBtn('inc', incSelected);
      updateSelectAllBox('inc-check-all', incSelected, 'income-body');
    });

    // Select-all checkboxes
    document.getElementById('exp-check-all').addEventListener('change', e => {
      document.querySelectorAll('#expense-body .row-check').forEach(cb => {
        cb.checked = e.target.checked;
        e.target.checked ? expSelected.add(cb.dataset.id) : expSelected.delete(cb.dataset.id);
      });
      updateResyncBtn('exp', expSelected);
    });
    document.getElementById('inc-check-all').addEventListener('change', e => {
      document.querySelectorAll('#income-body .row-check').forEach(cb => {
        cb.checked = e.target.checked;
        e.target.checked ? incSelected.add(cb.dataset.id) : incSelected.delete(cb.dataset.id);
      });
      updateResyncBtn('inc', incSelected);
    });

    // Re-sync and delete buttons
    document.getElementById('exp-resync').addEventListener('click', () => resyncSelected('expenses'));
    document.getElementById('inc-resync').addEventListener('click', () => resyncSelected('income'));
    document.getElementById('exp-delete').addEventListener('click', () => deleteSelected('expenses'));
    document.getElementById('inc-delete').addEventListener('click', () => deleteSelected('income'));
  }

  function updateResyncBtn(prefix, selected) {
    const show = selected.size > 0;
    const resyncBtn = document.getElementById(`${prefix}-resync`);
    const deleteBtn = document.getElementById(`${prefix}-delete`);
    resyncBtn.classList.toggle('hidden', !show);
    deleteBtn.classList.toggle('hidden', !show);
    if (show) {
      resyncBtn.textContent = `↻ Re-sync selected (${selected.size})`;
      deleteBtn.textContent = `🗑 Delete selected (${selected.size})`;
    }
  }

  function updateSelectAllBox(checkAllId, selected, tbodyId) {
    const allBoxes = document.querySelectorAll(`#${tbodyId} .row-check`);
    const allChecked = allBoxes.length > 0 && [...allBoxes].every(cb => selected.has(cb.dataset.id));
    document.getElementById(checkAllId).checked = allChecked;
  }

  async function resyncSelected(tab) {
    if (!Auth.isConnected()) { toast('Connect Google Sheets first', 'error'); return; }
    const selected = tab === 'expenses' ? expSelected : incSelected;
    const prefix   = tab === 'expenses' ? 'exp' : 'inc';
    const btn      = document.getElementById(`${prefix}-resync`);

    btn.disabled = true;
    btn.textContent = 'Re-syncing…';

    // Remove selected records from local storage
    selected.forEach(id => {
      tab === 'expenses' ? Storage.removeExpense(id) : Storage.removeIncome(id);
    });
    const count = selected.size;
    selected.clear();

    // Pull fresh data from sheet — re-imports the deleted rows with updated values
    try {
      await Sheets.pullYear(selectedYear);
      render();
      toast(`Re-synced ${count} row${count !== 1 ? 's' : ''} from sheet`, 'success');
    } catch (err) {
      render();
      toast('Re-sync failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      updateResyncBtn(prefix, selected);
    }
  }

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
    editingId   = null;
    editingType = null;
    const isIncome = activeTab === 'income';
    document.getElementById('modal-title').textContent = isIncome ? 'Add Income' : 'Add Expense';
    document.getElementById('expense-form').classList.toggle('hidden', isIncome);
    document.getElementById('income-form').classList.toggle('hidden', !isIncome);
    document.getElementById('exp-submit').textContent = 'Add Expense';
    document.getElementById('inc-submit').textContent = 'Add Income';

    // Set default date to today (within selected year)
    const today = new Date();
    const dateStr = today.getFullYear() === selectedYear
      ? today.toISOString().split('T')[0]
      : `${selectedYear}-01-01`;

    if (isIncome) {
      document.getElementById('income-form').reset();
      document.getElementById('i-date').value = dateStr;
      document.getElementById('i-date').min = `${selectedYear}-01-01`;
      document.getElementById('i-date').max = `${selectedYear}-12-31`;
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

  function openEditModal(type, id) {
    editingId   = id;
    editingType = type;
    const isIncome = type === 'income';

    document.getElementById('modal-title').textContent = isIncome ? 'Edit Income' : 'Edit Expense';
    document.getElementById('expense-form').classList.toggle('hidden', isIncome);
    document.getElementById('income-form').classList.toggle('hidden', !isIncome);
    document.getElementById('exp-submit').textContent = 'Save Changes';
    document.getElementById('inc-submit').textContent = 'Save Changes';

    const rowYear = isIncome
      ? (Storage.getIncome().find(i => i.id === id) || {}).date?.substring(0, 4)
      : (Storage.getExpenses().find(e => e.id === id) || {}).date?.substring(0, 4);
    const yr = parseInt(rowYear) || selectedYear;

    if (isIncome) {
      const row = Storage.getIncome().find(i => i.id === id);
      if (!row) return;
      document.getElementById('income-form').reset();
      document.getElementById('i-date').value  = row.date;
      document.getElementById('i-date').min    = `${yr}-01-01`;
      document.getElementById('i-date').max    = `${yr}-12-31`;
      document.getElementById('i-itype').value = row.incomeType;
      document.getElementById('i-dog').value   = row.dogName;
      document.getElementById('i-amount').value = row.income;
      document.getElementById('i-source').value = row.source || '';
      populateDogDatalist();
      populateSourceDatalist();
    } else {
      const row = Storage.getExpenses().find(e => e.id === id);
      if (!row) return;
      document.getElementById('expense-form').reset();
      document.getElementById('f-date').value    = row.date;
      document.getElementById('f-date').min      = `${yr}-01-01`;
      document.getElementById('f-date').max      = `${yr}-12-31`;
      document.getElementById('f-expense').value = row.expense;
      document.getElementById('f-amount').value  = row.amount;
      document.getElementById('f-store').value   = row.store || '';
      document.getElementById('f-remarks').value = row.remarks || '';
      populateStoreDatalist();
    }

    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(() => {
      const first = (isIncome ? document.getElementById('i-date') : document.getElementById('f-date'));
      first && first.focus();
    }, 60);
  }

  function closeModal() {
    editingId   = null;
    editingType = null;
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

    if (editingId) {
      await saveEditedExpense(editingId, submitBtn);
    } else {
      await saveNewExpense(submitBtn);
    }
  }

  async function saveNewExpense(submitBtn) {
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

  async function saveEditedExpense(id, submitBtn) {
    const oldRow = Storage.getExpenses().find(e => e.id === id);
    if (!oldRow) { closeModal(); return; }

    const updates = {
      date:    document.getElementById('f-date').value,
      expense: document.getElementById('f-expense').value.trim(),
      amount:  parseFloat(document.getElementById('f-amount').value),
      store:   document.getElementById('f-store').value.trim(),
      remarks: document.getElementById('f-remarks').value.trim(),
      synced:  false,
    };

    Storage.updateExpense(id, updates);
    closeModal();
    render();
    toast('Expense updated', 'success');

    if (Auth.isConnected()) {
      try {
        const newRow = Storage.getExpenses().find(e => e.id === id);
        await Sheets.updateExpenseRow(oldRow, newRow);
        render();
        toast('Synced to Google Sheets ✓', 'success');
      } catch (err) {
        toast('Saved locally — sync failed: ' + err.message, 'error');
      }
    } else {
      toast('Saved locally. Connect to sync.', 'info');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }

  // ── Submit income ─────────────────────────────────────────────
  async function submitIncome() {
    const submitBtn = document.getElementById('inc-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    if (editingId) {
      await saveEditedIncome(editingId, submitBtn);
    } else {
      await saveNewIncome(submitBtn);
    }
  }

  async function saveNewIncome(submitBtn) {
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

  async function saveEditedIncome(id, submitBtn) {
    const oldRow = Storage.getIncome().find(i => i.id === id);
    if (!oldRow) { closeModal(); return; }

    const updates = {
      date:       document.getElementById('i-date').value,
      dogName:    document.getElementById('i-dog').value.trim(),
      incomeType: document.getElementById('i-itype').value,
      income:     parseFloat(document.getElementById('i-amount').value),
      source:     document.getElementById('i-source').value.trim(),
      synced:     false,
    };

    Storage.updateIncome(id, updates);
    closeModal();
    render();
    toast('Income updated', 'success');

    if (Auth.isConnected()) {
      try {
        const newRow = Storage.getIncome().find(i => i.id === id);
        await Sheets.updateIncomeRow(oldRow, newRow);
        render();
        toast('Synced to Google Sheets ✓', 'success');
      } catch (err) {
        toast('Saved locally — sync failed: ' + err.message, 'error');
      }
    } else {
      toast('Saved locally. Connect to sync.', 'info');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }

  // ── Edit ──────────────────────────────────────────────────────
  function editExpense(id) { openEditModal('expense', id); }
  function editIncome(id)  { openEditModal('income',  id); }

  // ── Delete (app + sheet) ──────────────────────────────────────
  async function deleteExpense(id) {
    if (!confirm('Delete this expense from the app and Google Sheets?')) return;
    const row = Storage.getExpenses().find(e => e.id === id);
    Storage.removeExpense(id);
    render();
    if (row && row.synced && Auth.isConnected()) {
      try {
        await Sheets.deleteExpenseRows([row]);
        toast('Deleted from app and sheet', 'success');
      } catch (err) {
        toast('Removed from app — sheet delete failed: ' + err.message, 'error');
      }
    } else {
      toast('Deleted' + (!row?.synced ? ' (was not yet in sheet)' : ''), 'info');
    }
  }

  async function deleteIncome(id) {
    if (!confirm('Delete this income row from the app and Google Sheets?')) return;
    const row = Storage.getIncome().find(i => i.id === id);
    Storage.removeIncome(id);
    render();
    if (row && row.synced && Auth.isConnected()) {
      try {
        await Sheets.deleteIncomeRows([row]);
        toast('Deleted from app and sheet', 'success');
      } catch (err) {
        toast('Removed from app — sheet delete failed: ' + err.message, 'error');
      }
    } else {
      toast('Deleted' + (!row?.synced ? ' (was not yet in sheet)' : ''), 'info');
    }
  }

  async function deleteSelected(tab) {
    const selected = tab === 'expenses' ? expSelected : incSelected;
    const count = selected.size;
    if (!confirm(`Delete ${count} row${count !== 1 ? 's' : ''} from the app and Google Sheets?`)) return;

    const prefix = tab === 'expenses' ? 'exp' : 'inc';
    const btn = document.getElementById(`${prefix}-resync`);
    const delBtn = document.getElementById(`${prefix}-delete`);
    delBtn.disabled = true;
    delBtn.textContent = 'Deleting…';

    const ids = [...selected];
    const rows = (tab === 'expenses' ? Storage.getExpenses() : Storage.getIncome())
      .filter(r => ids.includes(r.id));
    const syncedRows = rows.filter(r => r.synced);

    // Remove from local storage
    ids.forEach(id => tab === 'expenses' ? Storage.removeExpense(id) : Storage.removeIncome(id));
    selected.clear();
    render();

    // Delete synced rows from sheet
    if (syncedRows.length > 0 && Auth.isConnected()) {
      try {
        const deleted = await (tab === 'expenses'
          ? Sheets.deleteExpenseRows(syncedRows)
          : Sheets.deleteIncomeRows(syncedRows));
        toast(`Deleted ${count} row${count !== 1 ? 's' : ''} from app and sheet`, 'success');
      } catch (err) {
        toast(`Removed from app — sheet delete failed: ${err.message}`, 'error');
      }
    } else {
      toast(`Deleted ${count} row${count !== 1 ? 's' : ''}`, 'info');
    }

    delBtn.disabled = false;
    delBtn.textContent = `Delete selected (0)`;
    updateResyncBtn(prefix, selected);
  }

  // ── Render ────────────────────────────────────────────────────
  function render() {
    renderExpenses();
    renderIncome();
    updatePendingBadge();
  }

  function updatePendingBadge() {
    const n = Storage.getPendingExpenses().length + Storage.getPendingIncome().length;
    const badge = document.getElementById('pending-badge');
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
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

    rows.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
      return EF.sort === 'asc' ? cmp : -cmp;
    });

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

    // Remove stale selections (rows no longer visible)
    const visibleExpIds = new Set(rows.map(e => e.id));
    [...expSelected].forEach(id => { if (!visibleExpIds.has(id)) expSelected.delete(id); });
    updateResyncBtn('exp', expSelected);

    tbody.innerHTML = rows.map(e => `
      <tr class="${expSelected.has(e.id) ? 'selected-row' : ''}">
        <td class="col-check">
          <input type="checkbox" class="row-check" data-id="${e.id}" ${expSelected.has(e.id) ? 'checked' : ''}>
        </td>
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
          <button class="edit-btn" onclick="App.editExpense('${e.id}')" title="Edit">✎</button>
          <button class="delete-btn" onclick="App.deleteExpense('${e.id}')" title="Delete">✕</button>
        </td>
      </tr>
    `).join('');
    updateSelectAllBox('exp-check-all', expSelected, 'expense-body');
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

    rows.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
      return IF.sort === 'asc' ? cmp : -cmp;
    });

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

    // Remove stale selections
    const visibleIncIds = new Set(rows.map(i => i.id));
    [...incSelected].forEach(id => { if (!visibleIncIds.has(id)) incSelected.delete(id); });
    updateResyncBtn('inc', incSelected);

    tbody.innerHTML = rows.map(i => `
      <tr class="${incSelected.has(i.id) ? 'selected-row' : ''}">
        <td class="col-check">
          <input type="checkbox" class="row-check" data-id="${i.id}" ${incSelected.has(i.id) ? 'checked' : ''}>
        </td>
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
          <button class="edit-btn" onclick="App.editIncome('${i.id}')" title="Edit">✎</button>
          <button class="delete-btn" onclick="App.deleteIncome('${i.id}')" title="Delete">✕</button>
        </td>
      </tr>
    `).join('');
    updateSelectAllBox('inc-check-all', incSelected, 'income-body');
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
  return { init, deleteExpense, deleteIncome, editExpense, editIncome };
})();

window.addEventListener('DOMContentLoaded', App.init);
