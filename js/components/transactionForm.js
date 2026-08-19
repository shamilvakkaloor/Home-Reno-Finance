import { getDocs, Timestamp } from "../lib/fs.js";
import { accountsCol, categoriesCol, sourcesCol, vendorsCol, usersCol, phasesCol, transactionsCol, transactionDoc } from "../lib/collections.js";
import { createWithAudit, updateWithAudit } from "../lib/crud.js";
import { currentActor } from "../lib/auth.js";
import { t, getLocale } from "../lib/i18n.js";
import { toDateInputValue, dateInputToTimestamp, escapeHtml } from "../lib/format.js";
import { openDialog, toast } from "../lib/ui.js";

const TITLE_KEY = {
  money_received: "action_money_received",
  transfer: "action_transfer_money",
  expense: "action_add_expense",
  money_returned: "action_return_money",
};

async function fetchOptions() {
  const [accSnap, catSnap, srcSnap, venSnap, userSnap, phaseSnap] = await Promise.all([
    getDocs(accountsCol()),
    getDocs(categoriesCol()),
    getDocs(sourcesCol()),
    getDocs(vendorsCol()),
    getDocs(usersCol()),
    getDocs(phasesCol()),
  ]);
  const map = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return {
    accounts: map(accSnap).filter((a) => a.isActive),
    categories: map(catSnap).filter((c) => c.isActive),
    sources: map(srcSnap).filter((s) => s.isActive),
    vendors: map(venSnap).filter((v) => v.isActive),
    users: map(userSnap),
    phases: map(phaseSnap).filter((p) => p.isActive),
  };
}

function optionsHtml(list, labelFn, selectedId) {
  return (
    `<option value="">—</option>` +
    list.map((x) => `<option value="${x.id}" ${x.id === selectedId ? "selected" : ""}>${escapeHtml(labelFn(x))}</option>`).join("")
  );
}

/**
 * Opens the create/edit dialog for the four "simple" transaction types
 * (money received, transfer, expense, money returned). Pass `existingTx`
 * to edit an existing transaction in place instead of creating a new one —
 * every field on this form is editable, matching the "every penny should be
 * editable" requirement.
 */
export async function openTransactionForm(type, onSaved, existingTx) {
  let opts;
  try {
    opts = await fetchOptions();
  } catch (err) {
    console.error("Failed to load transaction form options", err);
    toast("error", "Couldn't load accounts/categories. Check your connection or permissions, then try again.");
    return null;
  }
  const isEdit = !!existingTx;
  const locale = getLocale();
  const catLabel = (c) => (locale === "ml" && c.nameMl ? c.nameMl : c.name);
  const phaseLabel = (p) => (locale === "ml" && p.nameMl ? p.nameMl : p.name);

  const dateVal = isEdit ? toDateInputValue(existingTx.date) : toDateInputValue(new Date());
  const amountVal = isEdit ? existingTx.amount : "";

  let bodyHtml = `
    <form id="tx-form">
      <div class="field-row">
        <div class="field"><label for="tx-date">${t("field_date")}</label><input class="input" type="date" id="tx-date" value="${dateVal}" required /></div>
        <div class="field"><label for="tx-amount">${t("field_amount")} (₹)</label><input class="input" type="number" step="0.01" min="0.01" id="tx-amount" value="${amountVal}" required /></div>
      </div>
  `;

  if (type === "money_received") {
    bodyHtml += `
      <div class="field"><label for="tx-account">${t("field_account")}</label><select class="input" id="tx-account">${optionsHtml(opts.accounts, (a) => a.name, existingTx?.accountId)}</select></div>
      <div class="field"><label for="tx-source">${t("field_source")}</label><select class="input" id="tx-source">${optionsHtml(opts.sources, (s) => s.name, existingTx?.sourceId)}</select></div>
    `;
  } else if (type === "transfer" || type === "money_returned") {
    bodyHtml += `
      <div class="field-row">
        <div class="field"><label for="tx-from">${t("field_from_account")}</label><select class="input" id="tx-from">${optionsHtml(opts.accounts, (a) => a.name, existingTx?.fromAccountId)}</select></div>
        <div class="field"><label for="tx-to">${t("field_to_account")}</label><select class="input" id="tx-to">${optionsHtml(opts.accounts, (a) => a.name, existingTx?.toAccountId)}</select></div>
      </div>
    `;
    if (type === "transfer") {
      const method = existingTx?.transferMethod || "upi";
      bodyHtml += `
        <div class="field"><label for="tx-method">${t("field_transfer_method")}</label>
          <select class="input" id="tx-method">
            <option value="upi" ${method === "upi" ? "selected" : ""}>UPI</option>
            <option value="bank_transfer" ${method === "bank_transfer" ? "selected" : ""}>Bank Transfer</option>
            <option value="cash" ${method === "cash" ? "selected" : ""}>Cash</option>
            <option value="atm_cash" ${method === "atm_cash" ? "selected" : ""}>ATM / Cash</option>
            <option value="other" ${method === "other" ? "selected" : ""}>Other</option>
          </select>
        </div>`;
    }
  } else if (type === "expense") {
    bodyHtml += `
      <div class="field-row">
        <div class="field"><label for="tx-account">${t("field_account")}</label><select class="input" id="tx-account">${optionsHtml(opts.accounts, (a) => a.name, existingTx?.accountId)}</select></div>
        <div class="field"><label for="tx-category">${t("field_category")}</label><select class="input" id="tx-category">${optionsHtml(opts.categories, catLabel, existingTx?.categoryId)}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="tx-vendor">${t("field_vendor")}</label><select class="input" id="tx-vendor">${optionsHtml(opts.vendors, (v) => v.name, existingTx?.vendorId)}</select></div>
        <div class="field"><label for="tx-phase">Construction phase</label><select class="input" id="tx-phase">${optionsHtml(opts.phases, phaseLabel, existingTx?.phaseId)}</select></div>
      </div>
      <div class="field"><label for="tx-paidby">${t("field_paid_by")}</label>
        <select class="input" id="tx-paidby">${opts.users.map((u) => `<option value="${u.uid}" ${u.uid === existingTx?.paidByUserId ? "selected" : ""}>${escapeHtml(u.displayName || u.email)}</option>`).join("")}</select>
      </div>
    `;
  }

  bodyHtml += `
      <div class="field"><label for="tx-desc">${t("field_description")}</label><input class="input" id="tx-desc" value="${escapeHtml(existingTx?.description || "")}" /></div>
      <div class="field"><label for="tx-notes">${t("field_notes")}</label><textarea class="input" id="tx-notes" rows="2">${escapeHtml(existingTx?.notes || "")}</textarea></div>
      <p class="field-error hidden" id="tx-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="tx-submit">${t("action_save")}</button>
      </div>
    </form>
  `;

  const handle = openDialog({
    title: isEdit ? `Edit — ${t(TITLE_KEY[type])}` : t(TITLE_KEY[type]),
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#tx-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const errEl = body.querySelector("#tx-error");
        errEl.classList.add("hidden");
        const actor = currentActor();
        if (!actor) return;

        const dateStr = body.querySelector("#tx-date").value;
        const amountVal2 = parseFloat(body.querySelector("#tx-amount").value);
        if (!dateStr || !amountVal2 || amountVal2 <= 0) {
          errEl.textContent = "Enter a valid date and an amount greater than 0.";
          errEl.classList.remove("hidden");
          return;
        }

        const fields = {
          date: dateInputToTimestamp(dateStr),
          amount: amountVal2,
          currency: "INR",
          description: body.querySelector("#tx-desc").value.trim() || null,
          notes: body.querySelector("#tx-notes").value.trim() || null,
        };

        if (type === "money_received") {
          fields.accountId = body.querySelector("#tx-account").value || null;
          fields.sourceId = body.querySelector("#tx-source").value || null;
        } else if (type === "expense") {
          fields.accountId = body.querySelector("#tx-account").value || null;
          fields.categoryId = body.querySelector("#tx-category").value || null;
          fields.vendorId = body.querySelector("#tx-vendor").value || null;
          fields.phaseId = body.querySelector("#tx-phase").value || null;
          fields.paidByUserId = body.querySelector("#tx-paidby").value || actor.uid;
        } else {
          fields.fromAccountId = body.querySelector("#tx-from").value || null;
          fields.toAccountId = body.querySelector("#tx-to").value || null;
          if (type === "transfer") fields.transferMethod = body.querySelector("#tx-method").value;
        }

        const btn = body.querySelector("#tx-submit");
        btn.disabled = true;
        btn.textContent = t("loading");
        try {
          if (isEdit) {
            fields.version = (existingTx.version || 1) + 1;
            await updateWithAudit(transactionDoc(existingTx.id), "transaction", existingTx, fields, actor);
            toast("success", "Transaction updated");
          } else {
            const payload = { type, status: "active", version: 1, ...fields };
            await createWithAudit(transactionsCol(), "transaction", payload, actor);
            toast("success", "Transaction saved");
          }
          close();
          if (onSaved) onSaved();
        } catch (err) {
          console.error(err);
          errEl.textContent = "Couldn't save the transaction. Please try again.";
          errEl.classList.remove("hidden");
          btn.disabled = false;
          btn.textContent = t("action_save");
        }
      });
    },
  });
  return handle;
}
