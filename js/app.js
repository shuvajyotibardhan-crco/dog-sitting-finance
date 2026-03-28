// Main application controller
const App = (() => {

  const CATEGORIES = {
    expense: ['Food & Drink', 'Transport', 'Housing', 'Dog Supplies', 'Vet & Health',
              'Entertainment', 'Shopping', 'Utilities', 'Insurance', 'Education', 'Other'],
    income:  ['Client Payment', 'Salary', 'Freelance', 'Investment', 'Rental', 'Gift', 'Refund', 'Other']
  };

  let currentType = 'expense';
  let searchQuery = '';
  let filterType  = '';
  let filterMonth = '';

  // ── Bootstrap ──────────────────────────────────────────────
  function init() {
    checkConfig();
    setupAuth();
    setupTabs();
    setupModal();
    setupFilters();
    updateCategoryOptions();
    render();
  }

  function checkConfig() {
    if (
      CONFIG.CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE' ||
      CONFIG.SHEET_ID  === 'YOUR_SHEET_ID_HERE'
    ) {
      document.getElementById('setup-banner').classList.remove('hidden');
      document.getElementById('currency-symbol').textContent = CONFIG.CURRENCY;
    }
    document.getElementById('setup-dismiss').addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('setup-banner').classList.add('hidden');
    });
    document.getElementById('currency-symbol').textContent = CONFIG.CURRENCY;
  }

  // ── Auth ───────────────────────────────────────────────────
  function setupAuth() {
    Auth.init(onAuthChange);
    document.getElementById('connect-btn').addEventListener('click', Auth.connect);
    document.getElementById('disconnect-btn').addEventListener('click', () => {
      Auth.disconnect();
    });
    document.getElementById('sync-btn').addEventListener('click', handleSyncFromSheet);
  }

  function onAuthChange(connected) {
    const connectBtn    = document.getElementById('connect-btn');
    const authStatus    = document.getElementById('auth-status');
    const syncBtn       = document.getElementById('sync-btn');

    if (connected) {
      connectBtn.classList.add('hidden');
      authStatus.classList.remove('hidden');
      syncBtn.disabled = false;

      // Push anything that was added while offline
      Sheets.pushPending()
        .then(n => { if (n > 0) { render(); showToast(`${n} pending transaction(s) synced to sheet`, 'success'); } })
        .catch(err => showToast('Auto-sync failed: ' + err.message, 'error'));
    } else {
      connectBtn.classList.remove('hidden');
      authStatus.classList.add('hidden');
      syncBtn.disabled = true;
    }
  }

  async function handleSyncFromSheet() {
    const btn = document.getElementById('sync-btn');
    btn.classList.add('syncing');
    btn.disabled = true;
    try {
      const added = await Sheets.pullFromSheet();
      render();
      showToast(
        added > 0 ? `Added ${added} transaction(s) from sheet` : 'Already up to date',
        'success'
      );
    } catch (err) {
      showToast('Sync failed: ' + err.message, 'error');
    } finally {
      btn.classList.remove('syncing');
      btn.disabled = false;
    }
  }

  // ── Tabs ───────────────────────────────────────────────────
  function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      });
    });
  }

  // ── Modal ──────────────────────────────────────────────────
  function setupModal() {
    document.getElementById('add-btn').addEventListener('click', openModal);
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-overlay')) closeModal();
    });
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentType = btn.dataset.type;
        updateCategoryOptions();
      });
    });
    document.getElementById('transaction-form').addEventListener('submit', async e => {
      e.preventDefault();
      await submitTransaction();
    });
  }

  function openModal() {
    // Reset form
    currentType = 'expense';
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.type-btn[data-type="expense"]').classList.add('active');
    updateCategoryOptions();
    document.getElementById('transaction-form').reset();
    document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('f-amount').focus(), 50);
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  function updateCategoryOptions() {
    const cats = CATEGORIES[currentType];
    document.getElementById('f-category').innerHTML =
      cats.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  async function submitTransaction() {
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const transaction = {
      id:          crypto.randomUUID(),
      date:        document.getElementById('f-date').value,
      type:        currentType,
      category:    document.getElementById('f-category').value,
      amount:      parseFloat(document.getElementById('f-amount').value),
      description: document.getElementById('f-description').value.trim(),
      createdAt:   new Date().toISOString(),
      synced:      false
    };

    Storage.add(transaction);
    closeModal();
    render();
    showToast('Transaction saved', 'success');

    // Push to sheet immediately
    if (Auth.isConnected()) {
      try {
        await Sheets.pushTransaction(transaction);
        render(); // refresh sync indicator
        showToast('Synced to Google Sheets', 'success');
      } catch (err) {
        showToast('Saved locally — sheet sync failed: ' + err.message, 'error');
      }
    } else {
      showToast('Saved locally. Connect Google Sheets to sync.', 'info');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Transaction';
  }

  // ── Filters ────────────────────────────────────────────────
  function setupFilters() {
    document.getElementById('search').addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase();
      renderTransactions();
    });
    document.getElementById('filter-type').addEventListener('change', e => {
      filterType = e.target.value;
      renderTransactions();
    });
    document.getElementById('filter-month').addEventListener('change', e => {
      filterMonth = e.target.value;
      renderTransactions();
    });
  }

  function populateMonthFilter(transactions) {
    const months = [...new Set(
      transactions.map(t => t.date ? t.date.substring(0, 7) : null).filter(Boolean)
    )].sort().reverse();

    const sel = document.getElementById('filter-month');
    const cur = sel.value;
    sel.innerHTML = '<option value="">All Time</option>' + months.map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(+y, +mo-1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      return `<option value="${m}"${m === cur ? ' selected' : ''}>${label}</option>`;
    }).join('');
  }

  // ── Render ─────────────────────────────────────────────────
  function render() {
    const all = Storage.getAll();
    Dashboard.update(all);
    populateMonthFilter(all);
    renderTransactions();
  }

  function renderTransactions() {
    let list = Storage.getAll();

    if (filterType)  list = list.filter(t => t.type === filterType);
    if (filterMonth) list = list.filter(t => t.date && t.date.startsWith(filterMonth));
    if (searchQuery) list = list.filter(t =>
      (t.description || '').toLowerCase().includes(searchQuery) ||
      (t.category    || '').toLowerCase().includes(searchQuery)
    );

    list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    const tbody = document.getElementById('transactions-body');
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="empty-state">
          <strong>No transactions found</strong>
          Add one with the button above, or sync from your Google Sheet.
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(t => `
      <tr>
        <td>${fmtDate(t.date)}</td>
        <td><span class="badge badge-${t.type}">${cap(t.type)}</span></td>
        <td>${esc(t.category)}</td>
        <td class="amount-${t.type}">${t.type === 'income' ? '+' : '-'}${Dashboard.fmt(t.amount)}</td>
        <td class="note-text">${esc(t.description) || '—'}</td>
        <td>
          <span class="sync-dot ${t.synced ? 'synced' : 'pending'}"
                title="${t.synced ? 'Synced to Google Sheets' : 'Pending sync'}"></span>
        </td>
        <td>
          <button class="delete-btn" onclick="App.deleteTransaction('${t.id}')" title="Delete">✕</button>
        </td>
      </tr>
    `).join('');
  }

  // ── Public actions ─────────────────────────────────────────
  function deleteTransaction(id) {
    if (!confirm('Delete this transaction? It will NOT be removed from Google Sheets.')) return;
    Storage.remove(id);
    render();
    showToast('Transaction deleted locally', 'info');
  }

  // ── Helpers ────────────────────────────────────────────────
  function fmtDate(d) {
    if (!d) return '';
    const [y,m,day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  return { init, deleteTransaction };
})();

window.addEventListener('DOMContentLoaded', App.init);
