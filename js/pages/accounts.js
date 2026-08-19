import { onSnapshot, orderBy, query, Timestamp } from "../lib/fs.js";
import { accountsCol, transactionsCol, accountDoc } from "../lib/collections.js";
import { computeAccountBalances, reconcile } from "../lib/ledger.js";
import { formatINR, escapeHtml } from "../lib/format.js";
import { t } from "../lib/i18n.js";
import { emptyState, skeletonList, badge, openDialog, toast } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { addCleanup } from "../lib/router.js";
import { isAdmin, currentActor } from "../lib/auth.js";
import { createWithAudit, updateWithAudit } from "../lib/crud.js";

let state = { accounts: [], transactions: [], loaded: false };
let currentContainer = null;

export async function render(container) {
  currentContainer = container;
  const unsubAcc = onSnapshot(accountsCol(), (snap) => { state.accounts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); state.loaded = true; repaint(); });
  const unsubTx = onSnapshot(query(transactionsCol(), orderBy("date", "desc")), (snap) => { state.transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  [unsubAcc, unsubTx].forEach(addCleanup);
  paint(container);
}

function repaint() { if (currentContainer) paint(currentContainer); }

function paint(container) {
  const active = state.transactions.filter((t) => t.status === "active");
  const balances = computeAccountBalances(state.accounts, active);
  const check = reconcile(state.accounts, active);
  const admin = isAdmin();

  container.innerHTML = `
    <div class="flex items-center justify-between">
      <p class="text-sm text-concrete">Balances are calculated live from the ledger — never edited directly.</p>
      <button type="button" class="btn btn-primary" id="acc-add">${iconHtml("plus")}${t("action_add")}</button>
    </div>
    <div class="mt-3">
      ${!state.loaded ? skeletonList() : state.accounts.length === 0 ? emptyState(t("empty_accounts_title"), t("empty_generic_body")) : `
        <div class="grid-3">
          ${balances.map((b) => {
            const acc = state.accounts.find((a) => a.id === b.accountId);
            return `
              <div class="card" style="${acc.isActive ? "" : "opacity:.55;"}"><div class="card-body">
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-2">
                    <span class="icon-circle tone-blueprint">${iconHtml("wallet")}</span>
                    <div>
                      <p class="font-medium">${escapeHtml(acc.name)}</p>
                      <div class="flex items-center gap-1">${badge(acc.type, "neutral")}${acc.isActive ? "" : badge("Inactive", "rust")}</div>
                    </div>
                  </div>
                  ${admin ? `
                    <div class="flex items-center gap-1">
                      <button type="button" class="btn-icon" data-edit-acc="${acc.id}" aria-label="Edit ${escapeHtml(acc.name)}" title="Edit">${iconHtml("pencil")}</button>
                      <button type="button" class="btn-icon" data-toggle-acc="${acc.id}" data-active="${acc.isActive}" aria-label="${acc.isActive ? "Deactivate" : "Activate"} ${escapeHtml(acc.name)}" title="${acc.isActive ? "Deactivate — hides it from new transactions but keeps its history" : "Reactivate"}">${iconHtml(acc.isActive ? "eye" : "eyeOff")}</button>
                    </div>
                  ` : ""}
                </div>
                <p class="font-ledger mt-3" style="font-size:22px;font-weight:600;">${formatINR(b.currentBalance)}</p>
                <p class="text-xs text-concrete mt-1">Opening ${formatINR(b.openingBalance)} · +${formatINR(b.inflow)} / -${formatINR(b.outflow)}</p>
              </div></div>`;
          }).join("")}
        </div>
      `}
    </div>
    ${admin && state.accounts.length > 0 ? `<p class="text-xs text-concrete mt-3">Reconciliation check: ${check.balanced ? "balanced ✓" : `off by ${formatINR(Math.abs(check.drift))}`}</p>` : ""}
    ${admin ? `<p class="text-xs text-concrete mt-1">Accounts can't be permanently deleted once created, to keep any linked transaction history reliable — deactivate one instead to retire it.</p>` : ""}
  `;

  container.querySelector("#acc-add").addEventListener("click", () => openAccountForm());
  container.querySelectorAll("[data-edit-acc]").forEach((el) =>
    el.addEventListener("click", () => openAccountForm(state.accounts.find((a) => a.id === el.getAttribute("data-edit-acc"))))
  );
  container.querySelectorAll("[data-toggle-acc]").forEach((el) =>
    el.addEventListener("click", async () => {
      const acc = state.accounts.find((a) => a.id === el.getAttribute("data-toggle-acc"));
      const actor = currentActor();
      if (!acc || !actor) return;
      try {
        await updateWithAudit(accountDoc(acc.id), "account", acc, { isActive: !acc.isActive }, actor);
      } catch (err) {
        console.error(err);
        toast("error", "Couldn't update this account.");
      }
    })
  );
}

function openAccountForm(account) {
  const isEdit = !!account;
  const bodyHtml = `
    <form id="acc-form">
      <div class="field"><label for="acc-name">Name</label><input class="input" id="acc-name" value="${escapeHtml(account?.name || "")}" placeholder="e.g. Me — Bank" required /></div>
      <div class="field"><label for="acc-type">Type</label>
        <select class="input" id="acc-type">
          <option value="bank" ${account?.type === "bank" ? "selected" : ""}>Bank</option>
          <option value="cash" ${account?.type === "cash" ? "selected" : ""}>Cash</option>
          <option value="wallet" ${account?.type === "wallet" ? "selected" : ""}>Wallet</option>
          <option value="other" ${account?.type === "other" ? "selected" : ""}>Other</option>
        </select>
      </div>
      <div class="field"><label for="acc-opening">Opening balance (₹)</label><input class="input" id="acc-opening" type="number" step="0.01" value="${account?.openingBalance ?? 0}" /></div>
      <p class="field-error hidden" id="acc-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="acc-submit">${t("action_save")}</button>
      </div>
    </form>`;

  const handle = openDialog({
    title: isEdit ? t("action_edit") : t("nav_accounts"),
    size: "sm",
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#acc-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const values = {
          name: body.querySelector("#acc-name").value.trim(),
          type: body.querySelector("#acc-type").value,
          openingBalance: parseFloat(body.querySelector("#acc-opening").value) || 0,
        };
        if (!values.name) return;
        const btn = body.querySelector("#acc-submit");
        btn.disabled = true;
        try {
          if (isEdit) {
            await updateWithAudit(accountDoc(account.id), "account", account, values, actor);
          } else {
            await createWithAudit(accountsCol(), "account", { ...values, currency: "INR", isActive: true }, actor);
          }
          toast("success", "Account saved");
          close();
        } catch (err) {
          console.error(err);
          body.querySelector("#acc-error").textContent = "Couldn't save the account.";
          body.querySelector("#acc-error").classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
  return handle;
}
