import { onSnapshot, orderBy, query } from "../lib/fs.js";
import { accountsCol, transactionsCol, categoriesCol, vendorsCol, transactionDoc } from "../lib/collections.js";
import { formatDate, formatINR, moneyHtml, escapeHtml } from "../lib/format.js";
import { t, getLocale } from "../lib/i18n.js";
import { emptyState, skeletonList, badge, toast, bindSingleton } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { addCleanup } from "../lib/router.js";
import { isAdmin, currentActor } from "../lib/auth.js";
import { softDeleteWithAudit, restoreWithAudit } from "../lib/crud.js";
import { openTransactionForm } from "../components/transactionForm.js";
import { openWorkerPaymentForm } from "../components/workerPaymentForm.js";
import { openEditTransactionForm } from "../components/editTransactionForm.js";
import { periodFilterHtml, wirePeriodFilter, periodRange } from "../components/periodFilter.js";
import { typeIcon, amountSign, amountTone } from "../lib/txMeta.js";

let state = {
  accounts: [], transactions: [], categories: [], vendors: [],
  loaded: false, search: "", typeFilter: "all", statusFilter: "active",
  period: { period: "all_time" },
};
let currentContainer = null;

const NEW_TX_TYPES = [
  { type: "expense", labelKey: "action_add_expense" },
  { type: "money_received", labelKey: "action_money_received" },
  { type: "transfer", labelKey: "action_transfer_money" },
  { type: "money_returned", labelKey: "action_return_money" },
  { type: "pay_worker", label: "Pay a worker" },
];

export async function render(container) {
  currentContainer = container;
  Object.assign(state, { search: "", typeFilter: "all", statusFilter: "active", period: { period: "all_time" } });

  const unsubAcc = onSnapshot(accountsCol(), (snap) => { state.accounts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubTx = onSnapshot(query(transactionsCol(), orderBy("date", "desc")), (snap) => { state.transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() })); state.loaded = true; repaint(); });
  const unsubCat = onSnapshot(categoriesCol(), (snap) => { state.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubVen = onSnapshot(vendorsCol(), (snap) => { state.vendors = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  [unsubAcc, unsubTx, unsubCat, unsubVen].forEach(addCleanup);

  paint(container);
}

function repaint() { if (currentContainer) paint(currentContainer); }

function filteredList() {
  const { from, to } = periodRange(state.period);
  const q = state.search.trim().toLowerCase();
  return state.transactions.filter((tx) => {
    if (state.statusFilter !== "all" && tx.status !== state.statusFilter) return false;
    if (state.typeFilter !== "all" && tx.type !== state.typeFilter) return false;
    const d = tx.date?.toDate ? tx.date.toDate() : new Date(tx.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (q) {
      const vendor = state.vendors.find((v) => v.id === tx.vendorId)?.name || "";
      const category = state.categories.find((c) => c.id === tx.categoryId)?.name || "";
      const hay = `${tx.description || ""} ${tx.notes || ""} ${vendor} ${category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function exportCsv(list) {
  const header = ["Date", "Type", "Amount", "Account", "Category", "Vendor", "Description", "Status"];
  const rows = list.map((tx) => {
    const account = state.accounts.find((a) => a.id === tx.accountId)?.name || "";
    const category = state.categories.find((c) => c.id === tx.categoryId)?.name || "";
    const vendor = state.vendors.find((v) => v.id === tx.vendorId)?.name || "";
    return [formatDate(tx.date, getLocale()), tx.type, tx.amount, account, category, vendor, (tx.description || "").replace(/,/g, ";"), tx.status];
  });
  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function rowHtml(tx) {
  const locale = getLocale();
  const tone = amountTone(tx.type);
  const sign = amountSign(tx.type);
  const account = state.accounts.find((a) => a.id === tx.accountId);
  const from = state.accounts.find((a) => a.id === tx.fromAccountId);
  const to = state.accounts.find((a) => a.id === tx.toAccountId);
  const category = state.categories.find((c) => c.id === tx.categoryId);
  const vendor = state.vendors.find((v) => v.id === tx.vendorId);

  const bits = [];
  if (account) bits.push(account.name);
  if (from && to) bits.push(`${from.name} → ${to.name}`);
  if (category) bits.push(locale === "ml" && category.nameMl ? category.nameMl : category.name);
  if (vendor) bits.push(vendor.name);

  const admin = isAdmin();
  const deleted = tx.status === "deleted";
  return `
    <div class="list-row ${deleted ? "deleted" : ""}" data-tx-id="${tx.id}">
      <span class="icon-circle tone-${deleted ? "neutral" : tone}">${iconHtml(typeIcon[tx.type] || "transactions")}</span>
      <div class="list-row-main">
        <div class="list-row-title truncate">
          ${escapeHtml(tx.description || t("type_" + tx.type))}
          ${deleted ? badge(t("status_deleted"), "rust") : ""}
        </div>
        <div class="list-row-meta truncate">${formatDate(tx.date, locale)}${bits.length ? " · " + escapeHtml(bits.join(" · ")) : ""}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="list-row-amount amount-${tone}">${sign}${moneyHtml(tx.amount)}</span>
        ${admin && !deleted ? `<button type="button" class="btn-icon" data-edit-tx="${tx.id}" aria-label="Edit" title="Edit">${iconHtml("pencil")}</button>` : ""}
        ${admin && !deleted ? `<button type="button" class="btn-icon" data-delete="${tx.id}" aria-label="Delete">${iconHtml("trash")}</button>` : ""}
        ${admin && deleted ? `<button type="button" class="btn btn-outline btn-sm" data-restore="${tx.id}">${t("action_restore")}</button>` : ""}
      </div>
    </div>`;
}

function paint(container) {
  const list = filteredList();
  const total = list.reduce((s, tx) => s + (tx.status === "active" ? tx.amount : 0), 0);

  container.innerHTML = `
    <div class="flex items-center gap-2" style="flex-wrap:wrap;">
      <div class="search-wrap">
        ${iconHtml("search")}
        <input class="input" id="tx-search" placeholder="Search description, vendor, category…" value="${escapeHtml(state.search)}" />
      </div>
      <button type="button" class="btn btn-outline" id="tx-export">${iconHtml("download")}${t("action_export_csv")}</button>
      <div style="position:relative;">
        <button type="button" class="btn btn-primary" id="tx-new-btn">${iconHtml("plus")}${t("action_new_transaction")}</button>
        <div id="tx-new-menu" class="hidden menu" style="position:absolute;right:0;top:46px;width:210px;z-index:20;">
          ${NEW_TX_TYPES.map((o) => `<button type="button" class="menu-item" data-new-type="${o.type}">${o.labelKey ? t(o.labelKey) : escapeHtml(o.label)}</button>`).join("")}
        </div>
      </div>
    </div>

    <div class="mt-3">${periodFilterHtml(state.period, "tx-pf")}</div>

    <div class="flex gap-2 mt-3" style="flex-wrap:wrap;">
      <select class="input" id="tx-type-filter" style="width:auto;min-width:160px;">
        <option value="all">${t("field_type")}: All</option>
        <option value="money_received">${t("type_money_received")}</option>
        <option value="transfer">${t("type_transfer")}</option>
        <option value="expense">${t("type_expense")}</option>
        <option value="money_returned">${t("type_money_returned")}</option>
        <option value="loan_received">${t("type_loan_received")}</option>
        <option value="loan_repayment">${t("type_loan_repayment")}</option>
        <option value="bill_payment">${t("type_bill_payment")}</option>
      </select>
      <select class="input" id="tx-status-filter" style="width:auto;min-width:140px;">
        <option value="active">${t("status_active")}</option>
        <option value="deleted">${t("status_deleted")}</option>
        <option value="all">All statuses</option>
      </select>
    </div>

    <div class="section-head mt-4">
      <span class="eyebrow">${list.length} transactions</span>
      <span class="font-ledger text-sm font-medium" style="color:var(--concrete);">${formatINR(total)}</span>
    </div>

    <div class="ledger-sheet">
      ${!state.loaded ? `<div style="padding:12px 14px;">${skeletonList()}</div>` : list.length === 0 ? `<div style="padding:16px;">${emptyState(t("empty_transactions_title"), t("empty_transactions_body"))}</div>` : list.map(rowHtml).join("")}
    </div>
  `;

  container.querySelector("#tx-search").addEventListener("input", (e) => { state.search = e.target.value; paint(container); });
  container.querySelector("#tx-type-filter").value = state.typeFilter;
  container.querySelector("#tx-type-filter").addEventListener("change", (e) => { state.typeFilter = e.target.value; paint(container); });
  container.querySelector("#tx-status-filter").value = state.statusFilter;
  container.querySelector("#tx-status-filter").addEventListener("change", (e) => { state.statusFilter = e.target.value; paint(container); });
  container.querySelector("#tx-export").addEventListener("click", () => exportCsv(list));

  const newBtn = container.querySelector("#tx-new-btn");
  const newMenu = container.querySelector("#tx-new-menu");
  newBtn.addEventListener("click", () => newMenu.classList.toggle("hidden"));
  bindSingleton(document, "click", "tx-new-menu-outside", (e) => {
    if (!newMenu.contains(e.target) && e.target !== newBtn) newMenu.classList.add("hidden");
  });
  container.querySelectorAll("[data-new-type]").forEach((el) =>
    el.addEventListener("click", () => {
      newMenu.classList.add("hidden");
      const type = el.getAttribute("data-new-type");
      if (type === "pay_worker") {
        openWorkerPaymentForm();
      } else {
        openTransactionForm(type);
      }
    })
  );

  wirePeriodFilter(container, state.period, (v) => { state.period = v; paint(container); }, "tx-pf");

  container.querySelectorAll("[data-edit-tx]").forEach((el) =>
    el.addEventListener("click", () => {
      const tx = list.find((t) => t.id === el.getAttribute("data-edit-tx"));
      if (tx) openEditTransactionForm(tx);
    })
  );

  container.querySelectorAll("[data-delete]").forEach((el) =>
    el.addEventListener("click", async () => {
      const actor = currentActor();
      if (!actor) return;
      try {
        await softDeleteWithAudit(transactionDoc(el.getAttribute("data-delete")), "transaction", actor);
        toast("success", "Transaction deleted. Admins can restore it from Audit history.");
      } catch (err) {
        console.error(err);
        toast("error", "Couldn't delete this transaction.");
      }
    })
  );
  container.querySelectorAll("[data-restore]").forEach((el) =>
    el.addEventListener("click", async () => {
      const actor = currentActor();
      if (!actor) return;
      try {
        await restoreWithAudit(transactionDoc(el.getAttribute("data-restore")), "transaction", actor);
        toast("success", "Transaction restored.");
      } catch (err) {
        console.error(err);
        toast("error", "Couldn't restore this transaction.");
      }
    })
  );
}
