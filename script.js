const STORAGE_KEY = 'fintracker-state-v1';

const initialState = {
  budget: 0,
  expenses: [],
};

const state = loadState();

const budgetInput = document.getElementById('budget');
const saveBudgetBtn = document.getElementById('saveBudgetBtn');
const expenseForm = document.getElementById('expenseForm');
const expenseList = document.getElementById('expenseList');
const clearExpensesBtn = document.getElementById('clearExpensesBtn');
const budgetAmount = document.getElementById('budgetAmount');
const spentAmount = document.getElementById('spentAmount');
const remainingAmount = document.getElementById('remainingAmount');
const progressBar = document.getElementById('progressBar');
const budgetMessage = document.getElementById('budgetMessage');
const categoryBreakdown = document.getElementById('categoryBreakdown');
const topCategory = document.getElementById('topCategory');
const biggestExpense = document.getElementById('biggestExpense');
const dailyAverage = document.getElementById('dailyAverage');

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...initialState };
    }

    const parsed = JSON.parse(stored);
    return {
      budget: Number(parsed.budget || 0),
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    };
  } catch (error) {
    console.error('Unable to load saved budget data', error);
    return { ...initialState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentMonthExpenses() {
  const monthKey = getCurrentMonthKey();
  return state.expenses.filter((expense) => expense.month === monthKey);
}

function renderExpenses(items) {
  if (!items.length) {
    expenseList.innerHTML = '<div class="empty-state">No expenses logged for this month yet.</div>';
    return;
  }

  const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));

  expenseList.innerHTML = sorted
    .map(
      (expense) => `
        <article class="expense-item">
          <div class="expense-meta">
            <span class="expense-title">${expense.title}</span>
            <span class="expense-details">${expense.category} • ${new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div class="expense-meta">
            <span class="expense-amount">${formatCurrency(expense.amount)}</span>
            <button class="delete-btn" type="button" data-id="${expense.id}">Remove</button>
          </div>
        </article>
      `,
    )
    .join('');
}

function renderDashboard(monthExpenses, spent) {
  const totalsByCategory = monthExpenses.reduce((accumulator, expense) => {
    accumulator[expense.category] = (accumulator[expense.category] || 0) + expense.amount;
    return accumulator;
  }, {});

  const sortedCategories = Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1]);
  const topEntry = sortedCategories[0];
  const biggestEntry = [...monthExpenses].sort((a, b) => b.amount - a.amount)[0];
  const daysPassed = Math.max(new Date().getDate(), 1);
  const avgPerDay = spent / daysPassed;

  if (!sortedCategories.length) {
    categoryBreakdown.innerHTML = '<div class="empty-state">Add expenses to see category trends.</div>';
    topCategory.textContent = '—';
    biggestExpense.textContent = '—';
    dailyAverage.textContent = formatCurrency(0);
    return;
  }

  categoryBreakdown.innerHTML = sortedCategories
    .map(([category, value]) => {
      const percent = spent > 0 ? (value / spent) * 100 : 0;
      return `
        <div class="category-item">
          <div class="category-row">
            <span>${category}</span>
            <strong>${formatCurrency(value)}</strong>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${percent}%"></div>
          </div>
        </div>
      `;
    })
    .join('');

  topCategory.textContent = topEntry ? topEntry[0] : '—';
  biggestExpense.textContent = biggestEntry ? `${biggestEntry.title} • ${formatCurrency(biggestEntry.amount)}` : '—';
  dailyAverage.textContent = `${formatCurrency(avgPerDay)}/day`;
}

function renderSummary() {
  const monthExpenses = getCurrentMonthExpenses();
  const spent = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const remaining = state.budget - spent;
  const percent = state.budget > 0 ? Math.min((spent / state.budget) * 100, 100) : 0;

  budgetAmount.textContent = formatCurrency(state.budget);
  spentAmount.textContent = formatCurrency(spent);
  remainingAmount.textContent = formatCurrency(remaining);
  progressBar.style.width = `${percent}%`;
  renderDashboard(monthExpenses, spent);

  if (state.budget <= 0) {
    budgetMessage.textContent = 'Set a monthly budget to begin tracking.';
    return;
  }

  if (remaining >= 0) {
    budgetMessage.textContent = `You have ${formatCurrency(remaining)} left for the rest of the month.`;
  } else {
    budgetMessage.textContent = `You are ${formatCurrency(Math.abs(remaining))} over your monthly budget.`;
  }
}

function render() {
  budgetInput.value = state.budget || '';
  renderSummary();
  renderExpenses(getCurrentMonthExpenses());
}

saveBudgetBtn.addEventListener('click', () => {
  const nextBudget = Number(budgetInput.value);
  if (!Number.isFinite(nextBudget) || nextBudget < 0) {
    budgetInput.focus();
    return;
  }

  state.budget = nextBudget;
  saveState();
  render();
});

expenseForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const payload = Object.fromEntries(new FormData(expenseForm));
  const amount = Number(payload.amount);

  if (!payload.title.trim() || !Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const expense = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    title: payload.title.trim(),
    amount,
    category: payload.category,
    date: payload.date,
    month: getCurrentMonthKey(),
  };

  state.expenses.push(expense);
  saveState();
  expenseForm.reset();
  document.getElementById('date').value = new Date().toISOString().split('T')[0];
  render();
});

expenseList.addEventListener('click', (event) => {
  const button = event.target.closest('.delete-btn');
  if (!button) {
    return;
  }

  const id = button.getAttribute('data-id');
  state.expenses = state.expenses.filter((expense) => expense.id !== id);
  saveState();
  render();
});

clearExpensesBtn.addEventListener('click', () => {
  const confirmed = window.confirm('Remove all expenses for this month?');
  if (!confirmed) {
    return;
  }

  const monthKey = getCurrentMonthKey();
  state.expenses = state.expenses.filter((expense) => expense.month !== monthKey);
  saveState();
  render();
});

render();
