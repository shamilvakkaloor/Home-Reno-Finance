import { addDoc, getDocs, Timestamp } from "../lib/fs.js";
import { transactionsCol, transactionDoc, accountsCol, categoriesCol, phasesCol, workersCol } from "../lib/collections.js";
import { t, getLocale } from "../lib/i18n.js";
import { toDateInputValue, dateInputToTimestamp, escapeHtml } from "../lib/format.js";
import { openDialog, toast } from "../lib/ui.js";
import { currentActor } from "../lib/auth.js";
import { writeAudit, updateWithAudit } from "../lib/crud.js";

/**
 * Opens the "pay a worker" dialog. Creates (or edits) a `type: "expense"`
 * transaction with `workerId` set, so it shows up in the normal
 * Transactions ledger like any other expense, while the Workers page
 * tallies payable-vs-paid off the same field.
 *
 * @param {object} [presetWorker] - pass a worker object to skip the picker
 *   (used from the Workers page). Omit to show a worker dropdown (used from
 *   the Transactions "New transaction" menu).
 * @param {object} [existingTx] - pass an existing worker-payment transaction
 *   to edit it in place instead of creating a new one.
 */
export async function openWorkerPaymentForm(presetWorker, existingTx) {
  const isEdit = !!existingTx;
  let workers = presetWorker ? [presetWorker] : [];
  if (!presetWorker) {
    try {
      const snap = await getDocs(workersCol());
      workers = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((w) => w.isActive || w.id === existingTx?.workerId);
    } catch (err) {
      console.error("Failed to load workers", err);
      toast("error", "Couldn't load workers. Check your connection or permissions.");
      return;
    }
    if (workers.length === 0) {
      toast("error", "No workers yet — add one from the Workers page first.");
      return;
    }
  }

  let accounts = [];
  let categories = [];
  let phases = [];
  try {
    const [accSnap, catSnap, phaseSnap] = await Promise.all([getDocs(accountsCol()), getDocs(categoriesCol()), getDocs(phasesCol())]);
    accounts = accSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.isActive);
    categories = catSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    phases = phaseSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.isActive);
  } catch (err) {
    console.error("Failed to load accounts/categories/phases", err);
    toast("error", "Couldn't load accounts/categories. Check your connection or permissions.");
    return;
  }

  const locale = getLocale();
  const phaseLabel = (p) => (locale === "ml" && p.nameMl ? p.nameMl : p.name);
  const worker = presetWorker || workers.find((w) => w.id === existingTx?.workerId);

  const bodyHtml = `
    <form id="wpay-form">
      ${
        presetWorker || isEdit
          ? `<input type="hidden" id="wpay-worker" value="${worker?.id || ""}" /><p class="text-sm font-medium">${escapeHtml(worker?.name || "Worker")}</p>`
          : `<div class="field"><label for="wpay-worker">Worker</label>
              <select class="input" id="wpay-worker" required>
                <option value="">—</option>
                ${workers.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("")}
              </select>
            </div>`
      }
      <div class="field"><label for="wpay-amount">${t("field_amount")} (₹)</label><input class="input" id="wpay-amount" type="number" step="0.01" min="0.01" value="${isEdit ? existingTx.amount : ""}" required /></div>
      <div class="field"><label for="wpay-date">${t("field_date")}</label><input class="input" id="wpay-date" type="date" value="${isEdit ? toDateInputValue(existingTx.date) : toDateInputValue(new Date())}" /></div>
      <div class="field"><label for="wpay-account">${t("field_account")}</label>
        <select class="input" id="wpay-account" required><option value="">—</option>${accounts.map((a) => `<option value="${a.id}" ${a.id === existingTx?.accountId ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}</select>
      </div>
      <div class="field"><label for="wpay-phase">Construction phase</label>
        <select class="input" id="wpay-phase"><option value="">—</option>${phases.map((p) => `<option value="${p.id}" ${p.id === existingTx?.phaseId ? "selected" : ""}>${escapeHtml(phaseLabel(p))}</option>`).join("")}</select>
      </div>
      <p class="field-error hidden" id="wpay-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="wpay-submit">${t("action_save")}</button>
      </div>
    </form>`;

  openDialog({
    title: isEdit ? `Edit payment — ${worker?.name || ""}` : presetWorker ? `Pay ${presetWorker.name}` : "Pay a worker",
    size: "sm",
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#wpay-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;

        const workerId = body.querySelector("#wpay-worker").value;
        const selectedWorker = workers.find((w) => w.id === workerId) || presetWorker;
        const amount = parseFloat(body.querySelector("#wpay-amount").value);
        const accountId = body.querySelector("#wpay-account").value;
        const phaseId = body.querySelector("#wpay-phase").value || null;
        const errEl = body.querySelector("#wpay-error");

        if (!selectedWorker || !amount || amount <= 0 || !accountId) {
          errEl.textContent = "Fill in worker, amount, and account.";
          errEl.classList.remove("hidden");
          return;
        }

        const btn = body.querySelector("#wpay-submit");
        btn.disabled = true;
        try {
          const laborCategory = categories.find((c) => c.name.toLowerCase().includes("labour"));
          const dateTs = dateInputToTimestamp(body.querySelector("#wpay-date").value);

          if (isEdit) {
            const fields = {
              date: dateTs,
              amount,
              accountId,
              phaseId,
              description: `Payment to ${selectedWorker.name}`,
              version: (existingTx.version || 1) + 1,
            };
            await updateWithAudit(transactionDoc(existingTx.id), "transaction", existingTx, fields, actor);
            toast("success", "Payment updated");
          } else {
            const payload = {
              type: "expense",
              date: dateTs,
              amount,
              currency: "INR",
              description: `Payment to ${selectedWorker.name}`,
              accountId,
              workerId: selectedWorker.id,
              categoryId: laborCategory?.id || null,
              phaseId,
              paidByUserId: actor.uid,
              status: "active",
              version: 1,
              createdBy: actor.uid,
              createdAt: Timestamp.now(),
            };
            const ref = await addDoc(transactionsCol(), payload);
            await writeAudit("transaction", ref.id, "create", actor, undefined, payload);
            toast("success", "Payment recorded");
          }
          close();
        } catch (err) {
          console.error(err);
          errEl.textContent = "Couldn't save the payment.";
          errEl.classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
}
