import { onSnapshot, orderBy, query } from "../lib/fs.js";
import { accountsCol, transactionsCol, categoriesCol, loansCol, billsCol, settingsDoc } from "../lib/collections.js";
import { computeAccountBalances, totalHeld, totalReceived, totalExpenses } from "../lib/ledger.js";
import { formatINR } from "../lib/format.js";
import { t, getLocale } from "../lib/i18n.js";
import { statCard } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { addCleanup } from "../lib/router.js";
import { openTransactionForm } from "../components/transactionForm.js";
import { periodFilterHtml, wirePeriodFilter, periodRange } from "../components/periodFilter.js";

const DEFAULT_SETTINGS = { totalBudget: 0, budgetThresholds: { warning: 70, critical: 90 } };

let state = {
  accounts: [],
  transactions: [],
  categories: [],
  loans: [],
  bills: [],
  settings: DEFAULT_SETTINGS,
  period: { period: "all_time" },
  loaded: { accounts: false, transactions: false },
};
let charts = [];
let currentContainer = null;

const QUICK_ACTIONS = [
  { key: "expense", labelKey: "action_add_expense", icon: "plus" },
  { key: "money_received", labelKey: "action_money_received", icon: "wallet" },
  { key: "transfer", labelKey: "action_transfer_money", icon: "arrows" },
  { key: "money_returned", labelKey: "action_return_money", icon: "undo" },
];

export async function render(container) {
  currentContainer = container;
  state.period = { period: "all_time" };

  const unsubAcc = onSnapshot(accountsCol(), (snap) => {
    state.accounts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.loaded.accounts = true;
    repaint();
  });
  const unsubTx = onSnapshot(query(transactionsCol(), orderBy("date", "desc")), (snap) => {
    state.transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.loaded.transactions = true;
    repaint();
  });
  const unsubCat = onSnapshot(categoriesCol(), (snap) => {
    state.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    repaint();
  });
  const unsubLoans = onSnapshot(loansCol(), (snap) => {
    state.loans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    repaint();
  });
  const unsubBills = onSnapshot(billsCol(), (snap) => {
    state.bills = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    repaint();
  });
  const unsubSettings = onSnapshot(settingsDoc(), (snap) => {
    state.settings = snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS;
    repaint();
  });
  [unsubAcc, unsubTx, unsubCat, unsubLoans, unsubBills, unsubSettings].forEach(addCleanup);

  paint(container);
}

function repaint() {
  if (currentContainer) paint(currentContainer);
}

function paint(container) {
  const locale = getLocale();
  const active = state.transactions.filter((tx) => tx.status === "active");
  const { from, to } = periodRange(state.period);
  const filtered = !from && !to ? active : active.filter((tx) => {
    const d = tx.date?.toDate ? tx.date.toDate() : new Date(tx.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  const balances = computeAccountBalances(state.accounts, active);
  const available = totalHeld(balances);
  const received = totalReceived(filtered);
  const expenses = totalExpenses(filtered);
  const outstandingLoans = state.loans.filter((l) => l.status === "active").reduce((s, l) => s + l.outstandingAmount, 0);
  const pendingBills = state.bills.filter((b) => b.status === "unpaid" || b.status === "partial").reduce((s, b) => s + b.remainingAmount, 0);

  const byCategory = {};
  for (const tx of filtered) {
    if (tx.type !== "expense") continue;
    if (tx.workerId) {
      byCategory.labor = (byCategory.labor || 0) + tx.amount;
      continue;
    }
    if (!tx.categoryId) continue;
    byCategory[tx.categoryId] = (byCategory[tx.categoryId] || 0) + tx.amount;
  }
  const catEntries = Object.entries(byCategory)
    .map(([id, value]) => {
      if (id === "labor") return { name: "Labor", value };
      const cat = state.categories.find((c) => c.id === id);
      return { name: cat ? (locale === "ml" && cat.nameMl ? cat.nameMl : cat.name) : "Other", value };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const overTime = {};
  for (const tx of filtered) {
    if (tx.type !== "expense") continue;
    const d = tx.date?.toDate ? tx.date.toDate() : new Date(tx.date);
    const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    overTime[key] = (overTime[key] || 0) + tx.amount;
  }

  const recVsExp = {};
  for (const tx of filtered) {
    const d = tx.date?.toDate ? tx.date.toDate() : new Date(tx.date);
    const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    if (!recVsExp[key]) recVsExp[key] = { received: 0, spent: 0 };
    if (tx.type === "money_received" || tx.type === "loan_received") recVsExp[key].received += tx.amount;
    if (tx.type === "expense" || tx.type === "bill_payment") recVsExp[key].spent += tx.amount;
  }

  const totalSpentAll = totalExpenses(active);
  const budgetPct = state.settings.totalBudget > 0 ? (totalSpentAll / state.settings.totalBudget) * 100 : 0;
  const remaining = state.settings.totalBudget - totalSpentAll;
  const barColor = budgetPct > state.settings.budgetThresholds.critical ? "var(--rust)" : budgetPct > state.settings.budgetThresholds.warning ? "var(--amber)" : "var(--green)";

  container.innerHTML = `
    ${periodFilterHtml(state.period, "dash-pf")}

    <div class="quick-actions mt-3">
      ${QUICK_ACTIONS.map((a) => `<button type="button" class="quick-action" data-qa="${a.key}">${iconHtml(a.icon)}<span>${t(a.labelKey)}</span></button>`).join("")}
    </div>

    <div class="grid-4 mt-4">
      ${statCard(t("card_total_budget"), formatINR(state.settings.totalBudget), "piggy", "blueprint")}
      ${statCard(t("card_total_received"), formatINR(received), "trendUp", "green")}
      ${statCard(t("card_total_expenses"), formatINR(expenses), "trendDown", "rust")}
      ${statCard(t("card_available"), formatINR(available), "wallet", "ink")}
    </div>

    <div class="grid-4 mt-3">
      ${balances.map((b) => statCard(b.accountName, formatINR(b.currentBalance), "wallet", "blueprint")).join("")}
      ${statCard(t("card_outstanding_loans"), formatINR(outstandingLoans), "handCoins", "amber")}
      ${statCard(t("card_pending_bills"), formatINR(pendingBills), "receipt", "amber")}
    </div>

    ${state.settings.totalBudget > 0 ? `
      <div class="card mt-4"><div class="card-body">
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium">${t("nav_budget")}</span>
          <span class="font-ledger text-concrete">${formatINR(totalSpentAll)} / ${formatINR(state.settings.totalBudget)}</span>
        </div>
        <div class="progress mt-2"><div class="progress-bar" style="width:${Math.min(budgetPct, 100)}%;background:${barColor};"></div></div>
        <p class="text-xs text-concrete mt-2">${remaining >= 0 ? formatINR(remaining) + " remaining" : formatINR(Math.abs(remaining)) + " over budget"}</p>
      </div></div>
    ` : ""}

    <div class="grid-2 mt-4">
      <div class="card"><div class="card-header"><span class="card-title">Expenses by category</span></div>
        <div class="card-body">${catEntries.length ? '<div class="chart-box"><canvas id="chart-cat"></canvas></div>' : emptyChart()}</div></div>
      <div class="card"><div class="card-header"><span class="card-title">Money by account</span></div>
        <div class="card-body">${balances.length ? '<div class="chart-box"><canvas id="chart-acc"></canvas></div>' : emptyChart()}</div></div>
      <div class="card"><div class="card-header"><span class="card-title">Spending over time</span></div>
        <div class="card-body">${Object.keys(overTime).length ? '<div class="chart-box"><canvas id="chart-time"></canvas></div>' : emptyChart()}</div></div>
      <div class="card"><div class="card-header"><span class="card-title">Money received vs expenses</span></div>
        <div class="card-body">${Object.keys(recVsExp).length ? '<div class="chart-box"><canvas id="chart-rve"></canvas></div>' : emptyChart()}</div></div>
    </div>
  `;

  wirePeriodFilter(container, state.period, (v) => {
    state.period = v;
    paint(container);
  }, "dash-pf");

  container.querySelectorAll("[data-qa]").forEach((el) =>
    el.addEventListener("click", () => openTransactionForm(el.getAttribute("data-qa")))
  );

  destroyCharts();
  if (catEntries.length) charts.push(pieChart("chart-cat", catEntries));
  if (balances.length) charts.push(barChart("chart-acc", balances.map((b) => b.accountName), [{ label: "Balance", data: balances.map((b) => Math.max(b.currentBalance, 0)), color: "#2b5f8c" }]));
  if (Object.keys(overTime).length) charts.push(lineChart("chart-time", Object.keys(overTime), Object.values(overTime)));
  if (Object.keys(recVsExp).length) {
    const labels = Object.keys(recVsExp);
    charts.push(barChart("chart-rve", labels, [
      { label: "Received", data: labels.map((k) => recVsExp[k].received), color: "#2f6b4f" },
      { label: "Spent", data: labels.map((k) => recVsExp[k].spent), color: "#a6432e" },
    ]));
  }
}

function emptyChart() {
  return `<div class="text-xs text-concrete" style="text-align:center;padding:40px 0;">${t("empty_generic_body")}</div>`;
}

function destroyCharts() {
  charts.forEach((c) => c && c.destroy());
  charts = [];
}

function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false, labels: { font: { size: 11 } } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: { ticks: { font: { size: 11 }, callback: (v) => "₹" + v.toLocaleString("en-IN") } },
    },
  };
}

function pieChart(canvasId, entries) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  const palette = ["#2B5F8C", "#A87B3F", "#2F6B4F", "#A6432E", "#B8801F", "#1F4666", "#6B6F76", "#5C8AAE"];
  return new Chart(el, {
    type: "doughnut",
    data: { labels: entries.map((e) => e.name), datasets: [{ data: entries.map((e) => e.value), backgroundColor: palette }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { font: { size: 11 }, boxWidth: 10 } } } },
  });
}

function barChart(canvasId, labels, series) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  const opts = baseOptions();
  if (series.length > 1) opts.plugins.legend.display = true;
  return new Chart(el, {
    type: "bar",
    data: { labels, datasets: series.map((s) => ({ label: s.label, data: s.data, backgroundColor: s.color, borderRadius: 4 })) },
    options: opts,
  });
}

function lineChart(canvasId, labels, data) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  return new Chart(el, {
    type: "line",
    data: { labels, datasets: [{ label: "Spending", data, borderColor: "#a87b3f", backgroundColor: "#a87b3f", tension: 0.3, pointRadius: 3 }] },
    options: baseOptions(),
  });
}
