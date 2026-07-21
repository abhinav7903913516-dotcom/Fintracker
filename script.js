const STORAGE_KEY = 'fintracker-state-v1';
const REMOTE_ID_KEY = 'fintracker-remote-id';
const API_KEY = '11515bc748c84d6a9115da3b64554209';
const API_BASE = `https://crudcrud.com/api/${API_KEY}/fintracker`;

const initialState = {
  budget: 0,
  expenses: [],
};

let state = { ...initialState };
let remoteStateId = localStorage.getItem(REMOTE_ID_KEY);
let editingExpenseId = null;
let selectedMonthKey = getCurrentMonthKey();

const budgetInput = document.getElementById('budget');
const saveBudgetBtn = document.getElementById('saveBudgetBtn');
const expenseForm = document.getElementById('expenseForm');
const saveExpenseBtn = document.getElementById('saveExpenseBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
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
const monthlyHistoryList = document.getElementById('monthlyHistoryList');
const viewMonthSelect = document.getElementById('viewMonthSelect');
const expensePieChart = document.getElementById('expensePieChart');

function loadLocalState() {
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

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeExpense(expense) {
  return {
    id: expense?.id || `${Date.now()}-${Math.random()}`,
    title: expense?.title || 'Untitled expense',
    amount: Number(expense?.amount || 0),
    category: expense?.category || 'Other',
    date: expense?.date || new Date().toISOString().split('T')[0],
    month: expense?.month || getCurrentMonthKey(),
    payer: expense?.payer || expense?.owner || 'AK',
    owner: expense?.payer || expense?.owner || 'AK',
  };
}

function mergeState(remoteState, localState) {
  const mergedExpenses = [];
  const seenExpenseIds = new Set();

  [...(remoteState?.expenses || []), ...(localState?.expenses || [])].forEach((expense) => {
    const normalizedExpense = normalizeExpense(expense);
    if (!normalizedExpense.id || seenExpenseIds.has(normalizedExpense.id)) {
      return;
    }

    seenExpenseIds.add(normalizedExpense.id);
    mergedExpenses.push(normalizedExpense);
  });

  return {
    budget: Math.max(Number(remoteState?.budget || 0), Number(localState?.budget || 0)),
    expenses: mergedExpenses,
  };
}

function normalizeRemoteItem(item) {
  return {
    budget: Number(item?.budget || 0),
    expenses: Array.isArray(item?.expenses) ? item.expenses.map(normalizeExpense) : [],
  };
}

async function fetchRemoteState() {
  const response = await fetch(API_BASE);
  if (!response.ok) {
    throw new Error(`Remote fetch failed: ${response.status}`);
  }

  const items = await response.json();
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  let mergedRemoteState = { budget: 0, expenses: [] };
  let selectedItem = null;

  if (remoteStateId) {
    selectedItem = items.find((entry) => entry._id === remoteStateId);
  }

  if (!selectedItem) {
    selectedItem = items[0];
  }

  items.forEach((item) => {
    mergedRemoteState = mergeState(mergedRemoteState, normalizeRemoteItem(item));
  });

  if (selectedItem && selectedItem._id) {
    remoteStateId = selectedItem._id;
    localStorage.setItem(REMOTE_ID_KEY, remoteStateId);
  }

  return mergedRemoteState;
}

async function createRemoteState(snapshot = state) {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      budget: snapshot.budget,
      expenses: snapshot.expenses,
    }),
  });

  if (!response.ok) {
    throw new Error(`Remote create failed: ${response.status}`);
  }

  const created = await response.json();
  if (created._id) {
    remoteStateId = created._id;
    localStorage.setItem(REMOTE_ID_KEY, remoteStateId);
  }
}

async function updateRemoteState(snapshot = state) {
  if (!remoteStateId) {
    await createRemoteState(snapshot);
    return;
  }

  const response = await fetch(`${API_BASE}/${remoteStateId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      budget: snapshot.budget,
      expenses: snapshot.expenses,
    }),
  });

  if (!response.ok) {
    if (response.status === 404) {
      remoteStateId = null;
      localStorage.removeItem(REMOTE_ID_KEY);
      await createRemoteState(snapshot);
      return;
    }

    throw new Error(`Remote update failed: ${response.status}`);
  }
}

async function loadState() {
  try {
    const localSnapshot = loadLocalState();
    const remoteState = await fetchRemoteState();
    if (remoteState) {
      state = mergeState(remoteState, localSnapshot);
      saveLocalState();
      return;
    }
  } catch (error) {
    console.warn('Shared backend load failed, using local state instead.', error);
  }

  state = loadLocalState();
}

async function saveState() {
  saveLocalState();

  try {
    const remoteState = await fetchRemoteState();
    const mergedState = mergeState(remoteState, state);
    state = mergedState;
    saveLocalState();
    await updateRemoteState(state);
  } catch (error) {
    console.warn('Shared backend save failed, keeping local state only.', error);
  }
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

function getMonthKeyForDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return getCurrentMonthKey();
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getExpensesForMonth(monthKey) {
  return state.expenses.filter((expense) => (expense.month || getMonthKeyForDate(expense.date)) === monthKey);
}

function getCurrentMonthExpenses() {
  return getExpensesForMonth(selectedMonthKey);
}

function renderExpenses(items) {
  if (!items.length) {
    expenseList.innerHTML = '<div class="empty-state">No expenses logged for this selected month yet.</div>';
    return;
  }

  const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));

  expenseList.innerHTML = sorted
    .map(
      (expense) => `
        <article class="expense-item">
          <div class="expense-meta">
            <span class="expense-title">${expense.title}</span>
            <span class="expense-details">${expense.category} • ${expense.payer || expense.owner || 'AK'} • ${new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div class="expense-meta">
            <span class="expense-amount">${formatCurrency(expense.amount)}</span>
            <div class="expense-actions">
              <button class="edit-btn" type="button" data-id="${expense.id}">Edit</button>
              <button class="delete-btn" type="button" data-id="${expense.id}">Remove</button>
            </div>
          </div>
        </article>
      `,
    )
    .join('');
}

function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
}

function getMonthlyHistory() {
  const totalsByMonth = state.expenses.reduce((accumulator, expense) => {
    const monthKey = expense.month || getMonthKeyForDate(expense.date);
    accumulator[monthKey] = (accumulator[monthKey] || 0) + expense.amount;
    return accumulator;
  }, {});

  return Object.entries(totalsByMonth)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monthKey, total]) => ({
      monthKey,
      label: getMonthLabel(monthKey),
      total,
    }));
}

function renderMonthlyHistory() {
  const history = getMonthlyHistory();

  if (!history.length) {
    monthlyHistoryList.innerHTML = '<div class="empty-state">No monthly history yet.</div>';
    return;
  }

  monthlyHistoryList.innerHTML = history
    .map(({ monthKey, label, total }) => `
      <article class="history-item">
        <div>
          <strong>${label}</strong>
          <span>${monthKey === getCurrentMonthKey() ? 'Current month' : 'Recorded month'}</span>
        </div>
        <strong>${formatCurrency(total)}</strong>
      </article>
    `)
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
  const colors = ['#29b6f6', '#7c4dff', '#39d98a', '#ff6b6b', '#f5b942', '#ff8a65', '#90caf9'];

  if (!sortedCategories.length) {
    categoryBreakdown.innerHTML = '<div class="empty-state">Add expenses to see category trends.</div>';
    expensePieChart.style.background = 'rgba(255, 255, 255, 0.06)';
    topCategory.textContent = '—';
    biggestExpense.textContent = '—';
    dailyAverage.textContent = formatCurrency(0);
    return;
  }

  const totalValue = sortedCategories.reduce((sum, [, value]) => sum + value, 0);
  let startAngle = 0;
  const segmentStyles = sortedCategories.map(([category, value], index) => {
    const angle = totalValue > 0 ? (value / totalValue) * 360 : 0;
    const endAngle = startAngle + angle;
    const style = `${colors[index % colors.length]} ${startAngle}deg ${endAngle}deg`;
    startAngle = endAngle;
    return style;
  });

  expensePieChart.style.background = `conic-gradient(${segmentStyles.join(', ')})`;
  categoryBreakdown.innerHTML = sortedCategories
    .map(([category, value], index) => `
      <div class="category-item">
        <div class="category-label">
          <span class="category-dot" style="background:${colors[index % colors.length]}"></span>
          <span>${category}</span>
        </div>
        <strong>${formatCurrency(value)}</strong>
      </div>
    `)
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

function renderMonthSelector() {
  const months = Array.from(
    new Set([
      ...state.expenses.map((expense) => expense.month || getMonthKeyForDate(expense.date)),
      selectedMonthKey,
      getCurrentMonthKey(),
    ]),
  ).sort((a, b) => b.localeCompare(a));

  viewMonthSelect.innerHTML = months
    .map((monthKey) => `
      <option value="${monthKey}" ${monthKey === selectedMonthKey ? 'selected' : ''}>${getMonthLabel(monthKey)}</option>
    `)
    .join('');

  if (!months.includes(selectedMonthKey)) {
    selectedMonthKey = getCurrentMonthKey();
    viewMonthSelect.value = selectedMonthKey;
  }
}

function updateExpenseFormMode() {
  saveExpenseBtn.textContent = editingExpenseId ? 'Save changes' : 'Save expense';
  cancelEditBtn.style.display = editingExpenseId ? 'inline-flex' : 'none';
}

function resetExpenseForm() {
  editingExpenseId = null;
  expenseForm.reset();
  document.getElementById('date').value = new Date().toISOString().split('T')[0];
  document.getElementById('payer').value = 'AK';
  updateExpenseFormMode();
}

function populateExpenseForm(expense) {
  document.getElementById('title').value = expense.title;
  document.getElementById('amount').value = expense.amount;
  document.getElementById('category').value = expense.category || 'Other';
  document.getElementById('payer').value = expense.payer || expense.owner || 'AK';
  document.getElementById('date').value = expense.date || new Date().toISOString().split('T')[0];
  editingExpenseId = expense.id;
  updateExpenseFormMode();
  document.getElementById('title').focus();
}

function render() {
  budgetInput.value = state.budget || '';
  renderMonthSelector();
  renderSummary();
  renderExpenses(getCurrentMonthExpenses());
  renderMonthlyHistory();
}

saveBudgetBtn.addEventListener('click', async () => {
  const nextBudget = Number(budgetInput.value);
  if (!Number.isFinite(nextBudget) || nextBudget < 0) {
    budgetInput.focus();
    return;
  }

  state.budget = nextBudget;
  await saveState();
  render();
});

expenseForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = Object.fromEntries(new FormData(expenseForm));
  const amount = Number(payload.amount);

  if (!payload.title.trim() || !Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const nextMonth = getMonthKeyForDate(payload.date);
  selectedMonthKey = nextMonth;

  if (editingExpenseId) {
    const existingExpense = state.expenses.find((expense) => expense.id === editingExpenseId);
    if (existingExpense) {
      existingExpense.title = payload.title.trim();
      existingExpense.amount = amount;
      existingExpense.category = payload.category;
      existingExpense.payer = payload.payer || payload.owner || 'AK';
      existingExpense.owner = existingExpense.payer;
      existingExpense.date = payload.date;
      existingExpense.month = nextMonth;
    }
  } else {
    const expense = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title: payload.title.trim(),
      amount,
      category: payload.category,
      payer: payload.payer || payload.owner || 'AK',
      owner: payload.payer || payload.owner || 'AK',
      date: payload.date,
      month: nextMonth,
    };

    state.expenses.push(expense);
  }

  await saveState();
  resetExpenseForm();
  render();
});

cancelEditBtn.addEventListener('click', () => {
  resetExpenseForm();
});

expenseList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('.edit-btn');
  if (editButton) {
    const id = editButton.getAttribute('data-id');
    const expense = state.expenses.find((entry) => entry.id === id);
    if (expense) {
      populateExpenseForm(expense);
    }
    return;
  }

  const deleteButton = event.target.closest('.delete-btn');
  if (!deleteButton) {
    return;
  }

  const id = deleteButton.getAttribute('data-id');
  state.expenses = state.expenses.filter((expense) => expense.id !== id);
  await saveState();
  render();
});

viewMonthSelect.addEventListener('change', () => {
  selectedMonthKey = viewMonthSelect.value;
  render();
});

const dateInput = document.getElementById('date');
dateInput.addEventListener('change', () => {
  selectedMonthKey = getMonthKeyForDate(dateInput.value);
  render();
});

clearExpensesBtn.addEventListener('click', async () => {
  const confirmed = window.confirm('Remove all expenses for the selected month?');
  if (!confirmed) {
    return;
  }

  state.expenses = state.expenses.filter((expense) => (expense.month || getMonthKeyForDate(expense.date)) !== selectedMonthKey);
  await saveState();
  render();
});

async function init() {
  await loadState();
  resetExpenseForm();
  render();
}

init();
