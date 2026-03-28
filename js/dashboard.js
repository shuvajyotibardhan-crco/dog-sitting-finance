// Dashboard: summary cards + Chart.js charts
const Dashboard = (() => {
  let monthlyChart = null;
  let expenseChart = null;

  // Distinct colour palette for expense doughnut
  const PALETTE = [
    '#ef4444','#f97316','#f59e0b','#eab308','#84cc16',
    '#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899'
  ];

  function fmt(amount) {
    return `${CONFIG.CURRENCY}${Math.abs(amount).toLocaleString('en-GB', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    })}`;
  }

  function update(transactions) {
    updateCards(transactions);
    updateMonthlyChart(transactions);
    updateExpenseChart(transactions);
  }

  // ── Summary cards ──────────────────────────────────────────
  function updateCards(transactions) {
    const income  = transactions.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
    const balance = income - expense;

    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthNet = transactions
      .filter(t => t.date && t.date.startsWith(monthPrefix))
      .reduce((s,t) => t.type === 'income' ? s + t.amount : s - t.amount, 0);

    document.getElementById('total-income').textContent   = fmt(income);
    document.getElementById('total-expenses').textContent = fmt(expense);

    const balEl = document.getElementById('net-balance');
    balEl.textContent = (balance < 0 ? '-' : '') + fmt(balance);
    balEl.style.color = balance >= 0 ? 'var(--income)' : 'var(--expense)';

    const moEl = document.getElementById('this-month');
    moEl.textContent = (monthNet < 0 ? '-' : '+') + fmt(monthNet);
    moEl.style.color = monthNet >= 0 ? 'var(--income)' : 'var(--expense)';
  }

  // ── Income vs Expenses bar chart ───────────────────────────
  function updateMonthlyChart(transactions) {
    const buckets = {};
    transactions.forEach(t => {
      if (!t.date) return;
      const key = t.date.substring(0, 7); // YYYY-MM
      if (!buckets[key]) buckets[key] = { income: 0, expense: 0 };
      buckets[key][t.type === 'income' ? 'income' : 'expense'] += t.amount;
    });

    const months = Object.keys(buckets).sort();
    const labels = months.map(m => {
      const [y, mo] = m.split('-');
      return new Date(+y, +mo - 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    });

    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(
      document.getElementById('monthly-chart').getContext('2d'),
      {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Income',
              data: months.map(m => buckets[m].income),
              backgroundColor: '#10b98133',
              borderColor: '#10b981',
              borderWidth: 2,
              borderRadius: 4,
            },
            {
              label: 'Expenses',
              data: months.map(m => buckets[m].expense),
              backgroundColor: '#ef444433',
              borderColor: '#ef4444',
              borderWidth: 2,
              borderRadius: 4,
            },
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'top' } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: v => CONFIG.CURRENCY + v.toLocaleString('en-GB') }
            }
          }
        }
      }
    );
  }

  // ── Expense breakdown doughnut ─────────────────────────────
  function updateExpenseChart(transactions) {
    const cats = {};
    transactions
      .filter(t => t.type === 'expense')
      .forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.amount; });

    const labels = Object.keys(cats);
    const values = Object.values(cats);

    const wrapper = document.getElementById('expense-chart-wrapper');
    const empty   = document.getElementById('expense-empty');

    if (expenseChart) { expenseChart.destroy(); expenseChart = null; }

    if (labels.length === 0) {
      wrapper.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }

    wrapper.classList.remove('hidden');
    empty.classList.add('hidden');

    expenseChart = new Chart(
      document.getElementById('expense-chart').getContext('2d'),
      {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: PALETTE.slice(0, labels.length),
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${CONFIG.CURRENCY}${ctx.raw.toFixed(2)}`
              }
            }
          }
        }
      }
    );
  }

  return { update, fmt };
})();
