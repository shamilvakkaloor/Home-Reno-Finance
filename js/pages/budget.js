import { onSnapshot, setDoc, serverTimestamp } from "../lib/fs.js";
import { categoriesCol, categoryBudgetsCol, transactionsCol, settingsDoc, categoryBudgetDoc } from "../lib/collections.js";
import { formatINR, escapeHtml } from "../lib/format.js";
import { t, getLocale } from "../lib/i18n.js";
import { emptyState, badge, toast } from "../lib/ui.js";
import { addCleanup } from "../lib/router.js";
import { isAdmin, currentActor } from "../lib/auth.js";

const DEFAULT_SETTINGS = { totalBudget: 0, budgetThresholds: { warning: 70, critical: 90 } };

let state = { categories: [], categoryBudgets: [], transactions: [], settings: DEFAULT_SETTINGS, editingTotal: false, editingCat: null };
let currentContainer = null;

export async function render(container) {
  currentContainer = container;
  state.editingTotal = false;
  state.editingCat = null;
  const unsubCat = onSnapshot(categoriesCol(), (snap) => { state.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubBud = onSnapshot(categoryBudgetsCol(), (snap) => { state.categoryBudgets = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubTx = onSnapshot(transactionsCol(), (snap) => { state.transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubSet = onSnapshot(settingsDoc(), (snap) => { state.settings = snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS; repaint(); });
  [unsubCat, unsubBud, unsubTx, unsubSet].forEach(addCleanup);
  paint(container);
}

function repaint() { if (currentContainer) paint(currentContainer); }

function statusFor(pct, thresholds) {
  if (pct > 100) return { label: "Over budget", tone: "rust" };
  if (pct >= thresholds.critical) return { label: "Critical", tone: "rust" };
  if (pct >= thresholds.warning) return { label: "Warning", tone: "amber" };
  return { label: "Healthy", tone: "green" };
}

function barColor(tone) {
  return tone === "rust" ? "var(--rust)" : tone === "amber" ? "var(--amber)" : "var(--green)";
}

function spentByCategory() {
  const map = {};
  for (const tx of state.transactions) {
    if (tx.status !== "active" || tx.type !== "expense" || !tx.categoryId) continue;
    map[tx.categoryId] = (map[tx.categoryId] || 0) + tx.amount;
  }
  return map;
}

function paint(container) {
  const admin = isAdmin();
  const spent = spentByCategory();
  const totalSpent = Object.values(spent).reduce((s, v) => s + v, 0);
  const totalPct = state.settings.totalBudget > 0 ? (totalSpent / state.settings.totalBudget) * 100 : 0;
  const totalStatus = statusFor(totalPct, state.settings.budgetThresholds);
  const locale = getLocale();
  const activeCats = state.categories.filter((c) => c.isActive);

  container.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">${t("card_total_budget")}</span>${badge(totalStatus.label, totalStatus.tone)}</div>
      <div class="card-body" id="total-budget-body">
        ${state.editingTotal && admin ? `
          <div class="flex items-end gap-2">
            <div class="field" style="flex:1;margin-bottom:0;"><label for="total-input">Total budget (₹)</label><input class="input" id="total-input" type="number" value="${state.settings.totalBudget}" /></div>
            <button type="button" class="btn btn-primary" id="save-total">${t("action_save")}</button>
            <button type="button" class="btn btn-outline" id="cancel-total">${t("action_cancel")}</button>
          </div>
        ` : `
          <div class="flex items-center justify-between">
            <div>
              <p class="font-ledger" style="font-size:22px;font-weight:600;">${formatINR(state.settings.totalBudget)}</p>
              <p class="text-xs text-concrete mt-1">${formatINR(totalSpent)} spent · ${formatINR(Math.max(state.settings.totalBudget - totalSpent, 0))} remaining</p>
            </div>
            ${admin ? `<button type="button" class="btn btn-outline btn-sm" id="edit-total">${t("action_edit")}</button>` : ""}
          </div>
        `}
        <div class="progress mt-3"><div class="progress-bar" style="width:${Math.min(totalPct, 100)}%;background:${barColor(totalStatus.tone)};"></div></div>
      </div>
    </div>

    <h2 class="font-display mt-4" style="font-size:14px;font-weight:600;">Category budgets</h2>
    <div class="flex-col gap-2 mt-2" id="cat-budgets">
      ${activeCats.length === 0 ? emptyState(t("empty_generic_body")) : activeCats.map((cat) => catRow(cat, spent)).join("")}
    </div>
  `;

  if (state.editingTotal && admin) {
    container.querySelector("#save-total").addEventListener("click", async () => {
      const value = parseFloat(container.querySelector("#total-input").value);
      if (Number.isNaN(value) || value < 0) return;
      await setDoc(settingsDoc(), { ...state.settings, totalBudget: value }, { merge: true });
      state.editingTotal = false;
      toast("success", "Budget updated");
    });
    container.querySelector("#cancel-total").addEventListener("click", () => { state.editingTotal = false; repaint(); });
  } else if (admin) {
    container.querySelector("#edit-total")?.addEventListener("click", () => { state.editingTotal = true; repaint(); });
  }

  container.querySelectorAll("[data-edit-cat]").forEach((btn) =>
    btn.addEventListener("click", () => { state.editingCat = btn.getAttribute("data-edit-cat"); repaint(); })
  );
  container.querySelectorAll("[data-cancel-cat]").forEach((btn) =>
    btn.addEventListener("click", () => { state.editingCat = null; repaint(); })
  );
  container.querySelectorAll("[data-save-cat]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const categoryId = btn.getAttribute("data-save-cat");
      const input = container.querySelector(`#cat-input-${categoryId}`);
      const value = parseFloat(input.value);
      const actor = currentActor();
      if (Number.isNaN(value) || value < 0 || !actor) return;
      await setDoc(categoryBudgetDoc(categoryId), { categoryId, budgetAmount: value, updatedBy: actor.uid, updatedAt: serverTimestamp() }, { merge: true });
      state.editingCat = null;
      toast("success", "Category budget saved");
    })
  );

  function catRow(cat, spentMap) {
    const budget = state.categoryBudgets.find((b) => b.categoryId === cat.id);
    const s = spentMap[cat.id] || 0;
    const pct = budget && budget.budgetAmount > 0 ? (s / budget.budgetAmount) * 100 : 0;
    const status = statusFor(pct, state.settings.budgetThresholds);
    const name = locale === "ml" && cat.nameMl ? cat.nameMl : cat.name;

    if (state.editingCat === cat.id && admin) {
      return `
        <div class="card"><div class="card-body tight">
          <div class="flex items-end gap-2">
            <div class="field" style="flex:1;margin-bottom:0;"><label for="cat-input-${cat.id}">${escapeHtml(name)} budget (₹)</label><input class="input" id="cat-input-${cat.id}" type="number" value="${budget?.budgetAmount ?? 0}" /></div>
            <button type="button" class="btn btn-primary btn-sm" data-save-cat="${cat.id}">${t("action_save")}</button>
            <button type="button" class="btn btn-outline btn-sm" data-cancel-cat="${cat.id}">${t("action_cancel")}</button>
          </div>
        </div></div>`;
    }
    return `
      <div class="card"><div class="card-body tight">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">${escapeHtml(name)}</p>
          <div class="flex items-center gap-2">
            <span class="font-ledger text-sm text-concrete">${formatINR(s)}${budget ? " / " + formatINR(budget.budgetAmount) : ""}</span>
            ${budget ? badge(status.label, status.tone) : ""}
            ${admin ? `<button type="button" class="btn-icon" style="width:auto;height:auto;padding:2px 6px;font-size:12px;" data-edit-cat="${cat.id}">${t("action_edit")}</button>` : ""}
          </div>
        </div>
        ${budget ? `<div class="progress progress-thin mt-2"><div class="progress-bar" style="width:${Math.min(pct, 100)}%;background:${barColor(status.tone)};"></div></div>` : ""}
      </div></div>`;
  }
}
