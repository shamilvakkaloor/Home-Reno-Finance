import { onSnapshot, orderBy, query } from "../lib/fs.js";
import { accountsCol, transactionsCol, categoriesCol, settingsDoc } from "../lib/collections.js";
import { computeAccountBalances, totalHeld, totalReceived, totalExpenses } from "../lib/ledger.js";
import { formatINR, moneyHtml, escapeHtml } from "../lib/format.js";
import { t, getLocale } from "../lib/i18n.js";
import { statCard, heroCard } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { addCleanup } from "../lib/router.js";
import { openTransactionForm } from "../components/transactionForm.js";
import { periodFilterHtml, wirePeriodFilter, periodRange } from "../components/periodFilter.js";
import { doughnutChart, barChart, lineChart, TONE } from "../lib/charts.js";

const DEFAULT_SETTINGS = { totalBudget: 0, budgetThresholds: { warning: 70, critical: 90 } };

let state = {
  accounts: [],
  transactions: [],
  categories: [],
  settings: DEFAULT_SETTINGS,
  period: { period: "all_time" },
  loaded: { accounts: false, transactions: false },
};
let charts = [];
let currentContainer = null;

const QUICK_ACTIONS = [
  { key: "expense", labelKey: "action_add_expense", icon: "plus", tone: "rust" },
  { key: "money_received", labelKey: "action_money_received", icon: "down", tone: "green" },
  { key: "transfer", labelKey: "action_transfer_money", icon: "arrows", tone: "blueprint" },
  { key: "money_returned", labelKey: "action_return_money", icon: "undo", tone: "brass" },
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
  const unsubSettings = onSnapshot(settingsDoc(), (snap) => {
    state.settings = snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS;
    repaint();
  });
  [unsubAcc, unsubTx, unsubCat, unsubSettings].forEach(addCleanup);

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
  // Opening balances are undated initial funds, included only in an unbounded total.
  const received = totalReceived(filtered, !from && !to ? state.accounts : []);
  const expenses = totalExpenses(filtered);

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
  const laborTotal = byCategory.labor || 0;
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

  const periodLabel = t("filter_" + (state.period.period || "all_time")) || t("filter_all_time");
  const budgetTone = budgetPct > state.settings.budgetThresholds.critical ? "rust" : budgetPct > state.settings.budgetThresholds.warning ? "amber" : "green";

  container.innerHTML = `
    <div class="dashboard-intro">
      <h2>${locale === "ml" ? "നമ്മുടെ വീട്, ഓരോ ചുവടിലും." : "A home in the making."}</h2>
      <p>${locale === "ml" ? "വരവും ചെലവും ബജറ്റും ഒരിടത്ത്." : "Every contribution, every expense. Your renovation at a glance."}</p>
    </div>
    ${periodFilterHtml(state.period, "dash-pf")}

    <div class="dashboard-top">
    <div>
      ${heroCard(
        t("card_available"),
        moneyHtml(available),
        `${balances.length} account${balances.length === 1 ? "" : "s"}`
      )}
    </div>

    <div class="quick-actions mt-3">
      ${QUICK_ACTIONS.map((a) => `
        <button type="button" class="quick-action" data-qa="${a.key}">
          <span class="quick-action-icon tone-${a.tone}">${iconHtml(a.icon)}</span>
          <span>${t(a.labelKey)}</span>
        </button>`).join("")}
    </div>

    </div>

    <div class="mt-4">
      <div class="section-head">
        <span class="eyebrow">${locale === "ml" ? "സാമ്പത്തിക അവലോകനം" : "Financial overview"}</span>
        <span class="eyebrow-meta">${periodLabel}</span>
      </div>
      <div class="grid-4">
        ${statCard(t("card_total_budget"), moneyHtml(state.settings.totalBudget), "blueprint")}
        ${statCard(t("card_total_received"), moneyHtml(received), "green")}
        ${statCard(t("card_total_expenses"), moneyHtml(expenses), "rust")}
        ${statCard("Labour", moneyHtml(laborTotal), "brass")}
      </div>
    </div>

    <div class="grid-2 account-cards mt-4">
      ${balances.map((b) => `
        <div class="card account-balance-card">
          <div class="flex items-center gap-3">
            <span class="icon-circle tone-blueprint">${iconHtml("wallet")}</span>
            <h3 class="account-card-name">${escapeHtml(b.accountName)}</h3>
          </div>
          <div class="account-card-balance">${moneyHtml(b.currentBalance)}</div>
        </div>`).join("")}
    </div>

    ${state.settings.totalBudget > 0 ? `
      <div class="card mt-4"><div class="card-body">
        <div class="flex items-baseline justify-between">
          <span class="card-title">Budget used</span>
          <span class="badge badge-${budgetTone} font-ledger">${budgetPct.toFixed(1)}%</span>
        </div>
        <div class="mt-3 font-ledger text-sm" style="color:var(--ink-soft);">
          ${formatINR(totalSpentAll)} <span style="color:var(--concrete-light);">/ ${formatINR(state.settings.totalBudget)}</span>
        </div>
        <div class="progress mt-3"><div class="progress-bar${budgetPct > 100 ? " over" : ""}" style="width:${Math.min(budgetPct, 100)}%;background:${budgetPct > 100 ? "" : barColor};"></div></div>
        <div class="mt-2 flex justify-between font-ledger text-xs text-concrete">
          <span>${remaining >= 0 ? formatINR(remaining) + " remaining" : formatINR(Math.abs(remaining)) + " over budget"}</span>
          <span>${state.settings.budgetThresholds.warning}% → ${state.settings.budgetThresholds.critical}% thresholds</span>
        </div>
      </div></div>
    ` : ""}

    <div class="mt-5">
      <div class="section-head"><span class="eyebrow">Charts</span></div>
      <div class="grid-2">
        <div class="card"><div class="card-header">
            <span class="card-title">Expenses by category</span>
            <span class="card-sub">${catEntries.length} categories</span>
          </div>
          <div class="card-body">${catEntries.length ? '<div class="chart-box"><canvas id="chart-cat"></canvas></div>' : emptyChart()}</div></div>
        <div class="card"><div class="card-header"><span class="card-title">Money by account</span></div>
          <div class="card-body">${balances.length ? '<div class="chart-box"><canvas id="chart-acc"></canvas></div>' : emptyChart()}</div></div>
        <div class="card"><div class="card-header"><span class="card-title">Spending over time</span></div>
          <div class="card-body">${Object.keys(overTime).length ? '<div class="chart-box"><canvas id="chart-time"></canvas></div>' : emptyChart()}</div></div>
        <div class="card"><div class="card-header"><span class="card-title">Money received vs expenses</span></div>
          <div class="card-body">${Object.keys(recVsExp).length ? '<div class="chart-box"><canvas id="chart-rve"></canvas></div>' : emptyChart()}</div></div>
      </div>
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
  if (catEntries.length) charts.push(doughnutChart("chart-cat", catEntries));
  if (balances.length) {
    charts.push(barChart("chart-acc", balances.map((b) => b.accountName), [
      { label: "Balance", data: balances.map((b) => Math.max(b.currentBalance, 0)), color: TONE.blueprint },
    ]));
  }
  if (Object.keys(overTime).length) charts.push(lineChart("chart-time", Object.keys(overTime), Object.values(overTime)));
  if (Object.keys(recVsExp).length) {
    const labels = Object.keys(recVsExp);
    charts.push(barChart("chart-rve", labels, [
      { label: "Received", data: labels.map((k) => recVsExp[k].received), color: TONE.green },
      { label: "Spent", data: labels.map((k) => recVsExp[k].spent), color: TONE.rust },
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
