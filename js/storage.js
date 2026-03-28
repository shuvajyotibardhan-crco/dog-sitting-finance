// LocalStorage persistence layer
const Storage = (() => {
  const KEY = 'finance_tracker_v1';

  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveAll(transactions) {
    localStorage.setItem(KEY, JSON.stringify(transactions));
  }

  function add(transaction) {
    const all = getAll();
    all.push(transaction);
    saveAll(all);
    return transaction;
  }

  function remove(id) {
    saveAll(getAll().filter(t => t.id !== id));
  }

  // Mark a transaction as synced to Google Sheets
  function markSynced(id) {
    const all = getAll();
    const t = all.find(t => t.id === id);
    if (t) { t.synced = true; saveAll(all); }
  }

  // Add a transaction only if its ID isn't already stored (used for pull sync)
  function upsert(transaction) {
    const all = getAll();
    if (!all.find(t => t.id === transaction.id)) {
      all.push(transaction);
      saveAll(all);
    }
  }

  function getPending() {
    return getAll().filter(t => !t.synced);
  }

  return { getAll, add, remove, markSynced, upsert, getPending };
})();
