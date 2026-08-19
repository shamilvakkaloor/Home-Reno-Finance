import { onSnapshot, addDoc, Timestamp } from "../lib/fs.js";
import { loansCol, accountsCol, transactionsCol, loanDoc } from "../lib/collections.js";
import { formatDate, formatINR, toDateInputValue, dateInputToTimestamp, escapeHtml } from "../lib/format.js";
import { t, getLocale } from "../lib/i18n.js";
import { emptyState, skeletonList, badge, openDialog, toast } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { addCleanup } from "../lib/router.js";
import { currentActor } from "../lib/auth.js";
import { writeAudit, updateWithAudit } from "../lib/crud.js";

let state = { loans: [], accounts: [], loaded: false };
let currentContainer = null;

export async function render(container) {
  currentContainer = container;
  const unsubLoans = onSnapshot(loansCol(), (snap) => { state.loans = snap.docs.map((d) => ({ id: d.id, ...d.data() })); state.loaded = true; repaint(); });
  const unsubAcc = onSnapshot(accountsCol(), (snap) => { state.accounts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  [unsubLoans, unsubAcc].forEach(addCleanup);
  paint(container);
}

function repaint() { if (currentContainer) paint(currentContainer); }

function loanCard(loan) {
  const pct = loan.originalAmount > 0 ? (loan.repaidAmount / loan.originalAmount) * 100 : 0;
  return `
    <div class="card" data-loan-card="${loan.id}"><div class="card-body">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="icon-circle tone-amber">${iconHtml("handCoins")}</span>
          <div>
            <p class="font-medium">${escapeHtml(loan.lenderName)}</p>
            <p class="text-xs text-concrete">${formatDate(loan.receivedDate, getLocale())}</p>
          </div>
        </div>
        ${badge(loan.status === "fully_repaid" ? "Fully repaid" : "Active", loan.status === "fully_repaid" ? "green" : "amber")}
      </div>
      <div class="flex items-center justify-between text-sm mt-3">
        <span class="text-concrete">Repaid ${formatINR(loan.repaidAmount)} of ${formatINR(loan.originalAmount)}</span>
        <span class="font-ledger font-medium">${formatINR(loan.outstandingAmount)} left</span>
      </div>
      <div class="progress progress-thin mt-2"><div class="progress-bar" style="width:${Math.min(pct, 100)}%;background:var(--green);"></div></div>
      ${loan.status === "active" ? `<button type="button" class="btn btn-outline btn-sm mt-3" data-repay="${loan.id}">${t("action_loan_repayment")}</button>` : ""}
    </div></div>`;
}

function paint(container) {
  container.innerHTML = `
    <div class="flex items-center justify-end"><button type="button" class="btn btn-primary" id="loan-add">${iconHtml("plus")}${t("action_add_loan")}</button></div>
    <div class="mt-3 flex-col gap-3">
      ${!state.loaded ? skeletonList() : state.loans.length === 0 ? emptyState(t("empty_generic_body")) : state.loans.map(loanCard).join('<div style="height:12px;"></div>')}
    </div>
  `;
  container.querySelector("#loan-add").addEventListener("click", openLoanForm);
  container.querySelectorAll("[data-repay]").forEach((el) =>
    el.addEventListener("click", () => openRepayForm(state.loans.find((l) => l.id === el.getAttribute("data-repay"))))
  );
}

function openLoanForm() {
  const bodyHtml = `
    <form id="loan-form">
      <div class="field"><label for="loan-lender">Lender name</label><input class="input" id="loan-lender" required /></div>
      <div class="field-row">
        <div class="field"><label for="loan-amount">${t("field_amount")} (₹)</label><input class="input" id="loan-amount" type="number" step="0.01" min="0.01" required /></div>
        <div class="field"><label for="loan-date">${t("field_date")}</label><input class="input" id="loan-date" type="date" value="${toDateInputValue(new Date())}" required /></div>
      </div>
      <div class="field"><label for="loan-account">${t("field_account")}</label>
        <select class="input" id="loan-account" required><option value="">—</option>${state.accounts.filter((a) => a.isActive).map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}</select>
      </div>
      <div class="field"><label for="loan-notes">${t("field_notes")}</label><textarea class="input" id="loan-notes" rows="2"></textarea></div>
      <p class="field-error hidden" id="loan-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="loan-submit">${t("action_save")}</button>
      </div>
    </form>`;

  openDialog({
    title: t("action_add_loan"),
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#loan-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const lenderName = body.querySelector("#loan-lender").value.trim();
        const amount = parseFloat(body.querySelector("#loan-amount").value);
        const dateVal = body.querySelector("#loan-date").value;
        const accountId = body.querySelector("#loan-account").value;
        const notes = body.querySelector("#loan-notes").value.trim() || null;
        const errEl = body.querySelector("#loan-error");
        if (!lenderName || !amount || amount <= 0 || !accountId) {
          errEl.textContent = "Fill in lender, amount, and account.";
          errEl.classList.remove("hidden");
          return;
        }
        const btn = body.querySelector("#loan-submit");
        btn.disabled = true;
        try {
          const loanPayload = {
            lenderName, originalAmount: amount, receivedDate: dateInputToTimestamp(dateVal),
            receivedAccountId: accountId, repaidAmount: 0, outstandingAmount: amount, status: "active",
            notes, createdBy: actor.uid, createdAt: Timestamp.now(),
          };
          const loanRef = await addDoc(loansCol(), loanPayload);
          await writeAudit("loan", loanRef.id, "create", actor, undefined, loanPayload);

          const txPayload = {
            type: "loan_received", date: dateInputToTimestamp(dateVal), amount, currency: "INR",
            description: `Loan from ${lenderName}`, accountId, loanId: loanRef.id, status: "active", version: 1,
            createdBy: actor.uid, createdAt: Timestamp.now(),
          };
          const txRef = await addDoc(transactionsCol(), txPayload);
          await writeAudit("transaction", txRef.id, "create", actor, undefined, txPayload);

          toast("success", "Loan recorded");
          close();
        } catch (err) {
          console.error(err);
          errEl.textContent = "Couldn't save the loan.";
          errEl.classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
}

function openRepayForm(loan) {
  const bodyHtml = `
    <form id="repay-form">
      <p class="text-xs text-concrete">Outstanding for ${escapeHtml(loan.lenderName)}: <span class="font-ledger font-medium text-ink">${formatINR(loan.outstandingAmount)}</span></p>
      <div class="field mt-2"><label for="repay-amount">${t("field_amount")} (₹)</label><input class="input" id="repay-amount" type="number" step="0.01" min="0.01" required /></div>
      <div class="field"><label for="repay-date">${t("field_date")}</label><input class="input" id="repay-date" type="date" value="${toDateInputValue(new Date())}" /></div>
      <div class="field"><label for="repay-account">${t("field_account")}</label>
        <select class="input" id="repay-account" required><option value="">—</option>${state.accounts.filter((a) => a.isActive).map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}</select>
      </div>
      <p class="field-error hidden" id="repay-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="repay-submit">${t("action_save")}</button>
      </div>
    </form>`;

  openDialog({
    title: t("action_loan_repayment"),
    size: "sm",
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#repay-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const amount = parseFloat(body.querySelector("#repay-amount").value);
        const dateVal = body.querySelector("#repay-date").value;
        const accountId = body.querySelector("#repay-account").value;
        const errEl = body.querySelector("#repay-error");
        if (!amount || amount <= 0 || amount > loan.outstandingAmount || !accountId) {
          errEl.textContent = amount > loan.outstandingAmount ? `Cannot exceed outstanding balance of ${formatINR(loan.outstandingAmount)}` : "Fill in amount and account.";
          errEl.classList.remove("hidden");
          return;
        }
        const btn = body.querySelector("#repay-submit");
        btn.disabled = true;
        try {
          const txPayload = {
            type: "loan_repayment", date: dateInputToTimestamp(dateVal), amount, currency: "INR",
            description: `Repayment to ${loan.lenderName}`, accountId, loanId: loan.id, status: "active", version: 1,
            createdBy: actor.uid, createdAt: Timestamp.now(),
          };
          const txRef = await addDoc(transactionsCol(), txPayload);
          await writeAudit("transaction", txRef.id, "create", actor, undefined, txPayload);

          const newRepaid = loan.repaidAmount + amount;
          const newOutstanding = Math.max(loan.originalAmount - newRepaid, 0);
          await updateWithAudit(loanDoc(loan.id), "loan", loan, {
            repaidAmount: newRepaid, outstandingAmount: newOutstanding, status: newOutstanding <= 0 ? "fully_repaid" : "active",
          }, actor);

          toast("success", "Repayment recorded");
          close();
        } catch (err) {
          console.error(err);
          errEl.textContent = "Couldn't save the repayment.";
          errEl.classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
}
