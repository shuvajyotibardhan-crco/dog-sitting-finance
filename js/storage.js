// LocalStorage layer — separate stores for expenses and income
const Storage = (() => {
  const EXP_KEY = 'dogsit_expenses';
  const INC_KEY = 'dogsit_income';

  // ── Raw get / set ───────────────────────────────────────────
  function getExpenses() {
    try { return JSON.parse(localStorage.getItem(EXP_KEY)) || []; } catch { return []; }
  }
  function getIncome() {
    try { return JSON.parse(localStorage.getItem(INC_KEY)) || []; } catch { return []; }
  }
  function _saveExp(arr) { localStorage.setItem(EXP_KEY, JSON.stringify(arr)); }
  function _saveInc(arr) { localStorage.setItem(INC_KEY, JSON.stringify(arr)); }

  // ── Add ─────────────────────────────────────────────────────
  function addExpense(e)  { const a = getExpenses(); a.push(e); _saveExp(a); return e; }
  function addIncome(i)   { const a = getIncome();   a.push(i); _saveInc(a); return i; }

  // ── Remove ──────────────────────────────────────────────────
  function removeExpense(id) { _saveExp(getExpenses().filter(e => e.id !== id)); }
  function removeIncome(id)  { _saveInc(getIncome().filter(i => i.id !== id)); }

  // ── Update ──────────────────────────────────────────────────
  function updateExpense(id, updates) {
    const a = getExpenses(); const x = a.find(e => e.id === id);
    if (x) { Object.assign(x, updates); _saveExp(a); return x; }
    return null;
  }
  function updateIncome(id, updates) {
    const a = getIncome(); const x = a.find(i => i.id === id);
    if (x) { Object.assign(x, updates); _saveInc(a); return x; }
    return null;
  }

  // ── Mark synced ─────────────────────────────────────────────
  function markExpenseSynced(id) {
    const a = getExpenses(); const x = a.find(e => e.id === id);
    if (x) { x.synced = true; _saveExp(a); }
  }
  function markIncomeSynced(id) {
    const a = getIncome(); const x = a.find(i => i.id === id);
    if (x) { x.synced = true; _saveInc(a); }
  }

  // ── Dedup keys ─────────────────────────────────────────────
  // Used to avoid importing the same row twice when pulling from sheet.
  function expKey(e) {
    return `${e.date}|${(e.expense||'').toLowerCase()}|${e.amount}|${(e.store||'').toLowerCase()}`;
  }
  function incKey(i) {
    // Use raw dogName (before tips parsing) for the key
    const raw = i.incomeType === 'Tips' ? `${i.dogName}-tips` : i.dogName;
    return `${i.date}|${raw.toLowerCase()}|${i.income}|${(i.source||'').toLowerCase()}`;
  }

  // ── Upsert (used by pull sync) ──────────────────────────────
  function upsertExpense(e) {
    const a = getExpenses();
    const keys = new Set(a.map(expKey));
    if (!keys.has(expKey(e))) { a.push(e); _saveExp(a); return true; }
    return false;
  }
  function upsertIncome(i) {
    const a = getIncome();
    const keys = new Set(a.map(incKey));
    if (!keys.has(incKey(i))) { a.push(i); _saveInc(a); return true; }
    return false;
  }

  // ── Deletion sync: remove local rows absent from sheet ──────
  // Only removes synced rows — locally-added pending rows are never deleted.
  function removeExpensesNotInSheet(year, sheetKeySet) {
    const all = getExpenses();
    const kept = all.filter(e => {
      if (!e.date.startsWith(String(year))) return true; // different year — keep
      if (!e.synced) return true;                         // pending local add — keep
      return sheetKeySet.has(expKey(e));
    });
    const removed = all.length - kept.length;
    if (removed > 0) _saveExp(kept);
    return removed;
  }

  function removeIncomeNotInSheet(year, sheetKeySet) {
    const all = getIncome();
    const kept = all.filter(i => {
      if (!i.date.startsWith(String(year))) return true;
      if (!i.synced) return true;
      return sheetKeySet.has(incKey(i));
    });
    const removed = all.length - kept.length;
    if (removed > 0) _saveInc(kept);
    return removed;
  }

  // ── Pending (not yet synced) ────────────────────────────────
  function getPendingExpenses() { return getExpenses().filter(e => !e.synced); }
  function getPendingIncome()   { return getIncome().filter(i => !i.synced); }

  // Call from browser console to wipe and re-sync: Storage.clearIncome()
  function clearIncome()   { localStorage.removeItem(INC_KEY); }
  function clearExpenses() { localStorage.removeItem(EXP_KEY); }

  return {
    getExpenses, getIncome,
    addExpense, addIncome,
    updateExpense, updateIncome,
    removeExpense, removeIncome,
    markExpenseSynced, markIncomeSynced,
    upsertExpense, upsertIncome,
    expKey, incKey,
    removeExpensesNotInSheet, removeIncomeNotInSheet,
    getPendingExpenses, getPendingIncome,
    clearIncome, clearExpenses,
  };
})();
