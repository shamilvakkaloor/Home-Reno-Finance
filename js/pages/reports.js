import { onSnapshot, getDocs } from "../lib/fs.js";
import {
  accountsCol, transactionsCol, categoriesCol, vendorsCol, loansCol, billsCol,
  workersCol, sourcesCol, categoryBudgetsCol, phasesCol, settingsDoc,
} from "../lib/collections.js";
import { computeAccountBalances, reconcile } from "../lib/ledger.js";
import { formatINR } from "../lib/format.js";
import { t, getLocale } from "../lib/i18n.js";
import { addCleanup } from "../lib/router.js";
import { periodFilterHtml, wirePeriodFilter, periodRange } from "../components/periodFilter.js";
import { iconHtml } from "../lib/icons.js";

const DEFAULT_SETTINGS = { totalBudget: 0, budgetThresholds: { warning: 70, critical: 90 } };
let state = { accounts: [], transactions: [], categories: [], vendors: [], phases: [], settings: DEFAULT_SETTINGS, period: { period: "this_month" } };
let charts = [];
let currentContainer = null;

export async function render(container) {
  currentContainer = container;
  state.period = { period: "this_month" };
  const unsubAcc = onSnapshot(accountsCol(), (snap) => { state.accounts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubTx = onSnapshot(transactionsCol(), (snap) => { state.transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubCat = onSnapshot(categoriesCol(), (snap) => { state.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubVen = onSnapshot(vendorsCol(), (snap) => { state.vendors = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubPhase = onSnapshot(phasesCol(), (snap) => { state.phases = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubSet = onSnapshot(settingsDoc(), (snap) => { state.settings = snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS; repaint(); });
  [unsubAcc, unsubTx, unsubCat, unsubVen, unsubPhase, unsubSet].forEach(addCleanup);
  paint(container);
}

function repaint() { if (currentContainer) paint(currentContainer); }

async function downloadJson() {
  const [accSnap, txSnap, catSnap, srcSnap, venSnap, loanSnap, billSnap, wkSnap, budSnap] = await Promise.all([
    getDocs(accountsCol()), getDocs(transactionsCol()), getDocs(categoriesCol()), getDocs(sourcesCol()),
    getDocs(vendorsCol()), getDocs(loansCol()), getDocs(billsCol()), getDocs(workersCol()), getDocs(categoryBudgetsCol()),
  ]);
  const map = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const backup = {
    exportedAt: new Date().toISOString(), settings: state.settings,
    accounts: map(accSnap), transactions: map(txSnap), categories: map(catSnap), moneySources: map(srcSnap),
    vendors: map(venSnap), loans: map(loanSnap), bills: map(billSnap), workers: map(wkSnap), categoryBudgets: map(budSnap),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `home-reno-finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(byCategory) {
  const rows = [["Category", "Amount"], ...byCategory.map((c) => [c.name, c.value])];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `category-summary-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function destroyCharts() { charts.forEach((c) => c && c.destroy()); charts = []; }

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

  const byCategory = {};
  for (const tx of filtered) {
    if (tx.type !== "expense" || !tx.categoryId) continue;
    byCategory[tx.categoryId] = (byCategory[tx.categoryId] || 0) + tx.amount;
  }
  const catEntries = Object.entries(byCategory)
    .map(([id, value]) => { const c = state.categories.find((x) => x.id === id); return { name: c ? (locale === "ml" && c.nameMl ? c.nameMl : c.name) : "Other", value }; })
    .sort((a, b) => b.value - a.value);

  const byVendor = {};
  for (const tx of filtered) {
    if (!tx.vendorId) continue;
    byVendor[tx.vendorId] = (byVendor[tx.vendorId] || 0) + tx.amount;
  }
  const venEntries = Object.entries(byVendor)
    .map(([id, value]) => ({ name: state.vendors.find((v) => v.id === id)?.name || "Unknown", value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Cost by construction phase — every expense and bill payment that's been
  // tagged with a phase, split into labor (worker payments) vs. materials
  // (everything else) so the labor-cost-per-phase question is answerable.
  const byPhase = {};
  for (const tx of filtered) {
    if ((tx.type !== "expense" && tx.type !== "bill_payment") || !tx.phaseId) continue;
    if (!byPhase[tx.phaseId]) byPhase[tx.phaseId] = { labor: 0, materials: 0 };
    if (tx.workerId) byPhase[tx.phaseId].labor += tx.amount;
    else byPhase[tx.phaseId].materials += tx.amount;
  }
  const phaseEntries = Object.entries(byPhase)
    .map(([id, v]) => {
      const p = state.phases.find((x) => x.id === id);
      const name = p ? (locale === "ml" && p.nameMl ? p.nameMl : p.name) : "Unknown phase";
      return { name, labor: v.labor, materials: v.materials, total: v.labor + v.materials };
    })
    .sort((a, b) => b.total - a.total);
  const untaggedPhaseSpend = filtered
    .filter((tx) => (tx.type === "expense" || tx.type === "bill_payment") && !tx.phaseId)
    .reduce((s, tx) => s + tx.amount, 0);

  const balances = computeAccountBalances(state.accounts, active);
  const check = reconcile(state.accounts, active);

  container.innerHTML = `
    <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:8px;">
      <div style="flex:1;min-width:220px;">${periodFilterHtml(state.period, "rep-pf")}</div>
      <div class="flex gap-2">
        <button type="button" class="btn btn-outline btn-sm" id="rep-csv">${iconHtml("download")}CSV</button>
        <button type="button" class="btn btn-outline btn-sm" id="rep-json">${iconHtml("backup")}Full backup (JSON)</button>
      </div>
    </div>

    <div class="grid-2 mt-4">
      <div class="card"><div class="card-header"><span class="card-title">Expenses by category</span></div>
        <div class="card-body">${catEntries.length ? '<div class="chart-box"><canvas id="rep-chart-cat"></canvas></div>' : `<div class="text-xs text-concrete" style="text-align:center;padding:40px 0;">${t("empty_generic_body")}</div>`}</div></div>
      <div class="card"><div class="card-header"><span class="card-title">Top vendors by spend</span></div>
        <div class="card-body">${venEntries.length ? '<div class="chart-box"><canvas id="rep-chart-ven"></canvas></div>' : `<div class="text-xs text-concrete" style="text-align:center;padding:40px 0;">${t("empty_generic_body")}</div>`}</div></div>
    </div>

    <div class="card mt-4">
      <div class="card-header"><span class="card-title">Cost by construction phase</span></div>
      <div class="card-body">
        ${phaseEntries.length ? `
          <div class="chart-box" style="height:${Math.max(phaseEntries.length * 46, 180)}px;"><canvas id="rep-chart-phase"></canvas></div>
          <div class="mt-3">
            ${phaseEntries.map((p) => `
              <div class="flex items-center justify-between text-sm" style="padding:5px 0;border-top:1px solid var(--hairline);">
                <span>${p.name}</span>
                <span class="font-ledger text-concrete">Labor ${formatINR(p.labor)} · Materials ${formatINR(p.materials)} · <span class="font-medium text-ink">${formatINR(p.total)}</span></span>
              </div>`).join("")}
          </div>
        ` : `<div class="text-xs text-concrete" style="text-align:center;padding:40px 0;">${t("empty_generic_body")}</div>`}
        ${untaggedPhaseSpend > 0 ? `<p class="text-xs text-concrete mt-2">${formatINR(untaggedPhaseSpend)} in expenses this period have no phase tagged yet — edit them from Transactions to assign one.</p>` : ""}
      </div>
    </div>

    <div class="card mt-4">
      <div class="card-header"><span class="card-title">Account reconciliation</span></div>
      <div class="card-body text-sm">
        ${balances.map((b) => `<div class="flex justify-between" style="padding:4px 0;"><span class="text-concrete">${b.accountName}</span><span class="font-ledger">${formatINR(b.currentBalance)}</span></div>`).join("")}
        <hr class="divider" />
        <div class="flex justify-between font-medium"><span>Total held</span><span class="font-ledger">${formatINR(check.held)}</span></div>
        <p class="text-xs text-concrete mt-2">${check.balanced ? "Ledger reconciles ✓" : `Drift detected: ${formatINR(Math.abs(check.drift))} — review recent edits.`}</p>
      </div>
    </div>
  `;

  wirePeriodFilter(container, state.period, (v) => { state.period = v; paint(container); }, "rep-pf");
  container.querySelector("#rep-csv").addEventListener("click", () => downloadCsv(catEntries));
  container.querySelector("#rep-json").addEventListener("click", downloadJson);

  destroyCharts();
  const palette = ["#2B5F8C", "#A87B3F", "#2F6B4F", "#A6432E", "#B8801F", "#1F4666", "#6B6F76", "#5C8AAE"];
  const catEl = document.getElementById("rep-chart-cat");
  if (catEl && catEntries.length) {
    charts.push(new Chart(catEl, { type: "doughnut", data: { labels: catEntries.map((e) => e.name), datasets: [{ data: catEntries.map((e) => e.value), backgroundColor: palette }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { font: { size: 11 }, boxWidth: 10 } } } } }));
  }
  const venEl = document.getElementById("rep-chart-ven");
  if (venEl && venEntries.length) {
    charts.push(new Chart(venEl, {
      type: "bar",
      data: { labels: venEntries.map((e) => e.name), datasets: [{ data: venEntries.map((e) => e.value), backgroundColor: "#2b5f8c", borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { ticks: { callback: (v) => "₹" + v.toLocaleString("en-IN"), font: { size: 11 } } } } },
    }));
  }
  const phaseEl = document.getElementById("rep-chart-phase");
  if (phaseEl && phaseEntries.length) {
    charts.push(new Chart(phaseEl, {
      type: "bar",
      data: {
        labels: phaseEntries.map((p) => p.name),
        datasets: [
          { label: "Labor", data: phaseEntries.map((p) => p.labor), backgroundColor: "#a87b3f", borderRadius: 4 },
          { label: "Materials", data: phaseEntries.map((p) => p.materials), backgroundColor: "#2b5f8c", borderRadius: 4 },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "bottom", labels: { font: { size: 11 }, boxWidth: 10 } } },
        scales: {
          x: { stacked: true, ticks: { callback: (v) => "₹" + v.toLocaleString("en-IN"), font: { size: 11 } } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    }));
  }
}
