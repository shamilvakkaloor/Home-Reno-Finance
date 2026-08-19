import { onSnapshot, addDoc, Timestamp } from "../lib/fs.js";
import { billsCol, vendorsCol, categoriesCol, accountsCol, phasesCol, transactionsCol, billDoc } from "../lib/collections.js";
import { formatDate, formatINR, toDateInputValue, dateInputToTimestamp, escapeHtml } from "../lib/format.js";
import { t, getLocale } from "../lib/i18n.js";
import { emptyState, skeletonList, badge, openDialog, toast } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { addCleanup } from "../lib/router.js";
import { currentActor } from "../lib/auth.js";
import { writeAudit, updateWithAudit } from "../lib/crud.js";

let state = { bills: [], vendors: [], categories: [], accounts: [], phases: [], loaded: false };
let currentContainer = null;

const STATUS_TONE = { unpaid: "rust", partial: "amber", paid: "green", cancelled: "neutral" };

export async function render(container) {
  currentContainer = container;
  const unsubBills = onSnapshot(billsCol(), (snap) => { state.bills = snap.docs.map((d) => ({ id: d.id, ...d.data() })); state.loaded = true; repaint(); });
  const unsubVen = onSnapshot(vendorsCol(), (snap) => { state.vendors = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubCat = onSnapshot(categoriesCol(), (snap) => { state.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubAcc = onSnapshot(accountsCol(), (snap) => { state.accounts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubPhase = onSnapshot(phasesCol(), (snap) => { state.phases = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  [unsubBills, unsubVen, unsubCat, unsubAcc, unsubPhase].forEach(addCleanup);
  paint(container);
}

function repaint() { if (currentContainer) paint(currentContainer); }

function billCard(bill) {
  const vendor = state.vendors.find((v) => v.id === bill.vendorId);
  const pct = bill.totalAmount > 0 ? (bill.paidAmount / bill.totalAmount) * 100 : 0;
  return `
    <div class="card"><div class="card-body">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="icon-circle tone-blueprint">${iconHtml("receipt")}</span>
          <div>
            <p class="font-medium">${escapeHtml(bill.title)}</p>
            <p class="text-xs text-concrete">${vendor ? escapeHtml(vendor.name) : "—"}${bill.dueDate ? " · Due " + formatDate(bill.dueDate, getLocale()) : ""}</p>
          </div>
        </div>
        ${badge(t("status_" + bill.status), STATUS_TONE[bill.status])}
      </div>
      <div class="flex items-center justify-between text-sm mt-3">
        <span class="text-concrete">Paid ${formatINR(bill.paidAmount)} of ${formatINR(bill.totalAmount)}</span>
        <span class="font-ledger font-medium">${formatINR(bill.remainingAmount)} left</span>
      </div>
      <div class="progress progress-thin mt-2"><div class="progress-bar" style="width:${Math.min(pct, 100)}%;background:var(--green);"></div></div>
      ${bill.status === "unpaid" || bill.status === "partial" ? `<button type="button" class="btn btn-outline btn-sm mt-3" data-pay="${bill.id}">Record payment</button>` : ""}
    </div></div>`;
}

function paint(container) {
  container.innerHTML = `
    <div class="flex items-center justify-end"><button type="button" class="btn btn-primary" id="bill-add">${iconHtml("plus")}${t("action_add_bill")}</button></div>
    <div class="mt-3 flex-col gap-3">
      ${!state.loaded ? skeletonList() : state.bills.length === 0 ? emptyState(t("empty_generic_body")) : state.bills.map(billCard).join('<div style="height:12px;"></div>')}
    </div>
  `;
  container.querySelector("#bill-add").addEventListener("click", openBillForm);
  container.querySelectorAll("[data-pay]").forEach((el) =>
    el.addEventListener("click", () => openPayForm(state.bills.find((b) => b.id === el.getAttribute("data-pay"))))
  );
}

function openBillForm() {
  const bodyHtml = `
    <form id="bill-form">
      <div class="field"><label for="bill-title">Title</label><input class="input" id="bill-title" placeholder="e.g. Electrical fittings — Phase 2" required /></div>
      <div class="field-row">
        <div class="field"><label for="bill-amount">Total amount (₹)</label><input class="input" id="bill-amount" type="number" step="0.01" min="0.01" required /></div>
        <div class="field"><label for="bill-due">Due date</label><input class="input" id="bill-due" type="date" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="bill-vendor">${t("field_vendor")}</label><select class="input" id="bill-vendor"><option value="">—</option>${state.vendors.filter((v) => v.isActive).map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="bill-category">${t("field_category")}</label><select class="input" id="bill-category"><option value="">—</option>${state.categories.filter((c) => c.isActive).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label for="bill-notes">${t("field_notes")}</label><textarea class="input" id="bill-notes" rows="2"></textarea></div>
      <p class="field-error hidden" id="bill-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="bill-submit">${t("action_save")}</button>
      </div>
    </form>`;

  openDialog({
    title: t("action_add_bill"),
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#bill-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const title = body.querySelector("#bill-title").value.trim();
        const amount = parseFloat(body.querySelector("#bill-amount").value);
        const errEl = body.querySelector("#bill-error");
        if (!title || !amount || amount <= 0) {
          errEl.textContent = "Fill in a title and a valid amount.";
          errEl.classList.remove("hidden");
          return;
        }
        const dueVal = body.querySelector("#bill-due").value;
        const btn = body.querySelector("#bill-submit");
        btn.disabled = true;
        try {
          const payload = {
            title, vendorId: body.querySelector("#bill-vendor").value || null, categoryId: body.querySelector("#bill-category").value || null,
            totalAmount: amount, paidAmount: 0, remainingAmount: amount,
            dueDate: dueVal ? dateInputToTimestamp(dueVal) : null, status: "unpaid",
            notes: body.querySelector("#bill-notes").value.trim() || null,
            createdBy: actor.uid, createdAt: Timestamp.now(),
          };
          const ref = await addDoc(billsCol(), payload);
          await writeAudit("bill", ref.id, "create", actor, undefined, payload);
          toast("success", "Bill added");
          close();
        } catch (err) {
          console.error(err);
          errEl.textContent = "Couldn't save the bill.";
          errEl.classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
}

function openPayForm(bill) {
  const bodyHtml = `
    <form id="pay-form">
      <p class="text-xs text-concrete">Remaining for ${escapeHtml(bill.title)}: <span class="font-ledger font-medium text-ink">${formatINR(bill.remainingAmount)}</span></p>
      <div class="field mt-2"><label for="pay-amount">${t("field_amount")} (₹)</label><input class="input" id="pay-amount" type="number" step="0.01" min="0.01" required /></div>
      <div class="field"><label for="pay-date">${t("field_date")}</label><input class="input" id="pay-date" type="date" value="${toDateInputValue(new Date())}" /></div>
      <div class="field"><label for="pay-account">${t("field_account")}</label>
        <select class="input" id="pay-account" required><option value="">—</option>${state.accounts.filter((a) => a.isActive).map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}</select>
      </div>
      <div class="field"><label for="pay-phase">Construction phase</label>
        <select class="input" id="pay-phase"><option value="">—</option>${state.phases.filter((p) => p.isActive).map((p) => `<option value="${p.id}">${escapeHtml(getLocale() === "ml" && p.nameMl ? p.nameMl : p.name)}</option>`).join("")}</select>
      </div>
      <p class="field-error hidden" id="pay-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="pay-submit">${t("action_save")}</button>
      </div>
    </form>`;

  openDialog({
    title: "Record payment",
    size: "sm",
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#pay-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const amount = parseFloat(body.querySelector("#pay-amount").value);
        const dateVal = body.querySelector("#pay-date").value;
        const accountId = body.querySelector("#pay-account").value;
        const errEl = body.querySelector("#pay-error");
        if (!amount || amount <= 0 || amount > bill.remainingAmount || !accountId) {
          errEl.textContent = amount > bill.remainingAmount ? `Cannot exceed remaining balance of ${formatINR(bill.remainingAmount)}` : "Fill in amount and account.";
          errEl.classList.remove("hidden");
          return;
        }
        const btn = body.querySelector("#pay-submit");
        btn.disabled = true;
        try {
          const txPayload = {
            type: "bill_payment", date: dateInputToTimestamp(dateVal), amount, currency: "INR",
            description: `Payment for ${bill.title}`, accountId, billId: bill.id,
            categoryId: bill.categoryId || null, vendorId: bill.vendorId || null,
            phaseId: body.querySelector("#pay-phase").value || null,
            status: "active", version: 1, createdBy: actor.uid, createdAt: Timestamp.now(),
          };
          const txRef = await addDoc(transactionsCol(), txPayload);
          await writeAudit("transaction", txRef.id, "create", actor, undefined, txPayload);

          const newPaid = bill.paidAmount + amount;
          const newRemaining = Math.max(bill.totalAmount - newPaid, 0);
          await updateWithAudit(billDoc(bill.id), "bill", bill, {
            paidAmount: newPaid, remainingAmount: newRemaining, status: newRemaining <= 0 ? "paid" : "partial",
          }, actor);

          toast("success", "Payment recorded");
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
