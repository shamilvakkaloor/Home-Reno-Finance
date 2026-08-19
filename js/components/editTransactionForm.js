import { getDoc, getDocs } from "../lib/fs.js";
import { transactionDoc, loanDoc, billDoc, accountsCol, phasesCol } from "../lib/collections.js";
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
 * - loan_received / loan_repayment -> a small dedicated dialog that also
 *   adjusts the linked Loan's totals by the amount delta.
 * - bill_payment -> same idea, adjusting the linked Bill's totals.
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
    case "loan_received":
      return openLoanReceivedEdit(tx);
    case "loan_repayment":
      return openLoanRepaymentEdit(tx);
    case "bill_payment":
      return openBillPaymentEdit(tx);
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

/* ---------------- Loan received ---------------- */
async function openLoanReceivedEdit(tx) {
  let loan;
  try {
    const snap = await getDoc(loanDoc(tx.loanId));
    if (!snap.exists()) throw new Error("Linked loan no longer exists");
    loan = { id: snap.id, ...snap.data() };
  } catch (err) {
    console.error(err);
    toast("error", "Couldn't load the linked loan. Check your permissions.");
    return;
  }
  const { accounts } = await loadAccountsAndPhases();

  const bodyHtml = `
    <form id="edit-loanrecv-form">
      <p class="text-xs text-concrete">Editing the amount here also adjusts "${escapeHtml(loan.lenderName)}"'s loan total and outstanding balance.</p>
      <div class="field mt-2"><label for="elr-lender">Lender name</label><input class="input" id="elr-lender" value="${escapeHtml(loan.lenderName)}" required /></div>
      <div class="field-row">
        <div class="field"><label for="elr-amount">${t("field_amount")} (₹)</label><input class="input" id="elr-amount" type="number" step="0.01" min="0.01" value="${tx.amount}" required /></div>
        <div class="field"><label for="elr-date">${t("field_date")}</label><input class="input" id="elr-date" type="date" value="${toDateInputValue(tx.date)}" /></div>
      </div>
      <div class="field"><label for="elr-account">${t("field_account")}</label><select class="input" id="elr-account">${accountOptionsHtml(accounts, tx.accountId)}</select></div>
      <p class="field-error hidden" id="elr-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="elr-submit">${t("action_save")}</button>
      </div>
    </form>`;

  openDialog({
    title: "Edit loan received",
    size: "sm",
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#edit-loanrecv-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const lenderName = body.querySelector("#elr-lender").value.trim();
        const amount = parseFloat(body.querySelector("#elr-amount").value);
        const dateVal = body.querySelector("#elr-date").value;
        const accountId = body.querySelector("#elr-account").value;
        const errEl = body.querySelector("#elr-error");
        if (!lenderName || !amount || amount <= 0 || !accountId) {
          errEl.textContent = "Fill in all fields with a valid amount.";
          errEl.classList.remove("hidden");
          return;
        }
        const btn = body.querySelector("#elr-submit");
        btn.disabled = true;
        try {
          const delta = amount - tx.amount;
          const newOriginal = loan.originalAmount + delta;
          const newOutstanding = loan.outstandingAmount + delta;
          if (newOriginal < 0 || newOutstanding < 0) {
            errEl.textContent = "That change would make the loan total negative.";
            errEl.classList.remove("hidden");
            btn.disabled = false;
            return;
          }
          await updateWithAudit(loanDoc(loan.id), "loan", loan, {
            lenderName, originalAmount: newOriginal, outstandingAmount: newOutstanding,
            receivedAccountId: accountId, receivedDate: dateInputToTimestamp(dateVal),
            status: newOutstanding <= 0 ? "fully_repaid" : "active",
          }, actor);
          await updateWithAudit(transactionDoc(tx.id), "transaction", tx, {
            amount, accountId, date: dateInputToTimestamp(dateVal),
            description: `Loan from ${lenderName}`, version: (tx.version || 1) + 1,
          }, actor);
          toast("success", "Loan entry updated");
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

/* ---------------- Loan repayment ---------------- */
async function openLoanRepaymentEdit(tx) {
  let loan;
  try {
    const snap = await getDoc(loanDoc(tx.loanId));
    if (!snap.exists()) throw new Error("Linked loan no longer exists");
    loan = { id: snap.id, ...snap.data() };
  } catch (err) {
    console.error(err);
    toast("error", "Couldn't load the linked loan. Check your permissions.");
    return;
  }
  const { accounts } = await loadAccountsAndPhases();

  const bodyHtml = `
    <form id="edit-loanrepay-form">
      <p class="text-xs text-concrete">Outstanding for ${escapeHtml(loan.lenderName)} right now: <span class="font-ledger font-medium text-ink">${formatINR(loan.outstandingAmount)}</span></p>
      <div class="field mt-2"><label for="elp-amount">${t("field_amount")} (₹)</label><input class="input" id="elp-amount" type="number" step="0.01" min="0.01" value="${tx.amount}" required /></div>
      <div class="field"><label for="elp-date">${t("field_date")}</label><input class="input" id="elp-date" type="date" value="${toDateInputValue(tx.date)}" /></div>
      <div class="field"><label for="elp-account">${t("field_account")}</label><select class="input" id="elp-account">${accountOptionsHtml(accounts, tx.accountId)}</select></div>
      <p class="field-error hidden" id="elp-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="elp-submit">${t("action_save")}</button>
      </div>
    </form>`;

  openDialog({
    title: "Edit loan repayment",
    size: "sm",
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#edit-loanrepay-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const amount = parseFloat(body.querySelector("#elp-amount").value);
        const dateVal = body.querySelector("#elp-date").value;
        const accountId = body.querySelector("#elp-account").value;
        const errEl = body.querySelector("#elp-error");
        if (!amount || amount <= 0 || !accountId) {
          errEl.textContent = "Fill in a valid amount and account.";
          errEl.classList.remove("hidden");
          return;
        }
        const delta = amount - tx.amount;
        const newRepaid = loan.repaidAmount + delta;
        const newOutstanding = loan.outstandingAmount - delta;
        if (newRepaid < 0 || newOutstanding < 0) {
          errEl.textContent = "That change doesn't fit within the loan's original amount.";
          errEl.classList.remove("hidden");
          return;
        }
        const btn = body.querySelector("#elp-submit");
        btn.disabled = true;
        try {
          await updateWithAudit(loanDoc(loan.id), "loan", loan, {
            repaidAmount: newRepaid, outstandingAmount: newOutstanding,
            status: newOutstanding <= 0 ? "fully_repaid" : "active",
          }, actor);
          await updateWithAudit(transactionDoc(tx.id), "transaction", tx, {
            amount, accountId, date: dateInputToTimestamp(dateVal), version: (tx.version || 1) + 1,
          }, actor);
          toast("success", "Repayment updated");
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

/* ---------------- Bill payment ---------------- */
async function openBillPaymentEdit(tx) {
  let bill;
  try {
    const snap = await getDoc(billDoc(tx.billId));
    if (!snap.exists()) throw new Error("Linked bill no longer exists");
    bill = { id: snap.id, ...snap.data() };
  } catch (err) {
    console.error(err);
    toast("error", "Couldn't load the linked bill. Check your permissions.");
    return;
  }
  const { accounts, phases } = await loadAccountsAndPhases();
  const locale = getLocale();
  const phaseLabel = (p) => (locale === "ml" && p.nameMl ? p.nameMl : p.name);

  const bodyHtml = `
    <form id="edit-billpay-form">
      <p class="text-xs text-concrete">Remaining on "${escapeHtml(bill.title)}" right now: <span class="font-ledger font-medium text-ink">${formatINR(bill.remainingAmount)}</span></p>
      <div class="field mt-2"><label for="ebp-amount">${t("field_amount")} (₹)</label><input class="input" id="ebp-amount" type="number" step="0.01" min="0.01" value="${tx.amount}" required /></div>
      <div class="field"><label for="ebp-date">${t("field_date")}</label><input class="input" id="ebp-date" type="date" value="${toDateInputValue(tx.date)}" /></div>
      <div class="field"><label for="ebp-account">${t("field_account")}</label><select class="input" id="ebp-account">${accountOptionsHtml(accounts, tx.accountId)}</select></div>
      <div class="field"><label for="ebp-phase">Construction phase</label>
        <select class="input" id="ebp-phase"><option value="">—</option>${phases.map((p) => `<option value="${p.id}" ${p.id === tx.phaseId ? "selected" : ""}>${escapeHtml(phaseLabel(p))}</option>`).join("")}</select>
      </div>
      <p class="field-error hidden" id="ebp-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="ebp-submit">${t("action_save")}</button>
      </div>
    </form>`;

  openDialog({
    title: "Edit bill payment",
    size: "sm",
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#edit-billpay-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const amount = parseFloat(body.querySelector("#ebp-amount").value);
        const dateVal = body.querySelector("#ebp-date").value;
        const accountId = body.querySelector("#ebp-account").value;
        const phaseId = body.querySelector("#ebp-phase").value || null;
        const errEl = body.querySelector("#ebp-error");
        if (!amount || amount <= 0 || !accountId) {
          errEl.textContent = "Fill in a valid amount and account.";
          errEl.classList.remove("hidden");
          return;
        }
        const delta = amount - tx.amount;
        const newPaid = bill.paidAmount + delta;
        const newRemaining = bill.remainingAmount - delta;
        if (newPaid < 0 || newRemaining < 0) {
          errEl.textContent = "That change doesn't fit within the bill's total amount.";
          errEl.classList.remove("hidden");
          return;
        }
        const btn = body.querySelector("#ebp-submit");
        btn.disabled = true;
        try {
          await updateWithAudit(billDoc(bill.id), "bill", bill, {
            paidAmount: newPaid, remainingAmount: newRemaining,
            status: newRemaining <= 0 ? "paid" : "partial",
          }, actor);
          await updateWithAudit(transactionDoc(tx.id), "transaction", tx, {
            amount, accountId, phaseId, date: dateInputToTimestamp(dateVal), version: (tx.version || 1) + 1,
          }, actor);
          toast("success", "Payment updated");
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
