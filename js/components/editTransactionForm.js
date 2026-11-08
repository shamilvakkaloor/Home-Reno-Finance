import { getDocs } from "../lib/fs.js";
import { transactionDoc, accountsCol, phasesCol } from "../lib/collections.js";
import { t, getLocale } from "../lib/i18n.js";
import { formatINR, toDateInputValue, dateInputToTimestamp, escapeHtml } from "../lib/format.js";
import { openDialog, toast } from "../lib/ui.js";
import { currentActor } from "../lib/auth.js";
import { updateWithAudit } from "../lib/crud.js";
import { openTransactionForm } from "./transactionForm.js";
import { openWorkerPaymentForm } from "./workerPaymentForm.js";

/**
 * Opens the right edit dialog for ANY transaction, regardless of type.
 * - money_received / transfer / expense / money_returned -> the shared
 *   transaction form, in edit mode (worker-tagged expenses route to the
 *   worker payment form instead, so the worker picker stays sensible).
 * - adjustment -> a plain field-edit dialog with no linked document.
 */
export async function openEditTransactionForm(tx) {
  switch (tx.type) {
    case "money_received":
    case "transfer":
    case "money_returned":
      return openTransactionForm(tx.type, undefined, tx);
    case "expense":
      return tx.workerId ? openWorkerPaymentForm(undefined, tx) : openTransactionForm("expense", undefined, tx);
    case "adjustment":
      return openAdjustmentEdit(tx);
    default:
      toast("error", `Editing "${tx.type}" transactions isn't supported yet.`);
  }
}

async function loadAccountsAndPhases() {
  const [accSnap, phaseSnap] = await Promise.all([getDocs(accountsCol()), getDocs(phasesCol())]);
  return {
    accounts: accSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.isActive),
    phases: phaseSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.isActive),
  };
}

function accountOptionsHtml(accounts, selectedId) {
  return `<option value="">—</option>` + accounts.map((a) => `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
}

/* ---------------- Adjustment ---------------- */
async function openAdjustmentEdit(tx) {
  const { accounts } = await loadAccountsAndPhases();
  const bodyHtml = `
    <form id="edit-adj-form">
      <div class="field"><label for="eadj-amount">${t("field_amount")} (₹) — positive increases the account, negative decreases it</label><input class="input" id="eadj-amount" type="number" step="0.01" value="${tx.amount}" required /></div>
      <div class="field"><label for="eadj-date">${t("field_date")}</label><input class="input" id="eadj-date" type="date" value="${toDateInputValue(tx.date)}" /></div>
      <div class="field"><label for="eadj-account">${t("field_account")}</label><select class="input" id="eadj-account">${accountOptionsHtml(accounts, tx.accountId)}</select></div>
      <div class="field"><label for="eadj-desc">${t("field_description")}</label><input class="input" id="eadj-desc" value="${escapeHtml(tx.description || "")}" /></div>
      <p class="field-error hidden" id="eadj-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="eadj-submit">${t("action_save")}</button>
      </div>
    </form>`;
  openDialog({
    title: "Edit adjustment",
    size: "sm",
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#edit-adj-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const amount = parseFloat(body.querySelector("#eadj-amount").value);
        const accountId = body.querySelector("#eadj-account").value;
        const errEl = body.querySelector("#eadj-error");
        if (Number.isNaN(amount) || !accountId) {
          errEl.textContent = "Fill in a valid amount and account.";
          errEl.classList.remove("hidden");
          return;
        }
        const btn = body.querySelector("#eadj-submit");
        btn.disabled = true;
        try {
          await updateWithAudit(transactionDoc(tx.id), "transaction", tx, {
            amount, accountId,
            date: dateInputToTimestamp(body.querySelector("#eadj-date").value),
            description: body.querySelector("#eadj-desc").value.trim() || null,
            version: (tx.version || 1) + 1,
          }, actor);
          toast("success", "Adjustment updated");
          close();
        } catch (err) {
          console.error(err);
          errEl.textContent = "Couldn't save changes. Check your permissions.";
          errEl.classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
}
