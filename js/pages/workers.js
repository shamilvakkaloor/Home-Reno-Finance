import { onSnapshot } from "../lib/fs.js";
import { workersCol, workRecordsCol, workRecordDoc, transactionsCol, transactionDoc, accountsCol, categoriesCol, workerDoc } from "../lib/collections.js";
import { formatINR, formatDate, toDateInputValue, dateInputToTimestamp, escapeHtml } from "../lib/format.js";
import { t, getLocale } from "../lib/i18n.js";
import { emptyState, skeletonList, openDialog, toast } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { addCleanup } from "../lib/router.js";
import { currentActor, isAdmin } from "../lib/auth.js";
import { createWithAudit, updateWithAudit, hardDeleteWithAudit, softDeleteWithAudit, restoreWithAudit } from "../lib/crud.js";
import { openWorkerPaymentForm } from "../components/workerPaymentForm.js";

let state = { workers: [], records: [], transactions: [], accounts: [], categories: [], loaded: false };
let currentContainer = null;

export async function render(container) {
  currentContainer = container;
  const unsubW = onSnapshot(workersCol(), (snap) => { state.workers = snap.docs.map((d) => ({ id: d.id, ...d.data() })); state.loaded = true; repaint(); });
  const unsubR = onSnapshot(workRecordsCol(), (snap) => { state.records = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubTx = onSnapshot(transactionsCol(), (snap) => { state.transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubAcc = onSnapshot(accountsCol(), (snap) => { state.accounts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubCat = onSnapshot(categoriesCol(), (snap) => { state.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  [unsubW, unsubR, unsubTx, unsubAcc, unsubCat].forEach(addCleanup);
  paint(container);
}

function repaint() { if (currentContainer) paint(currentContainer); }

function statsFor(workerId) {
  let payable = 0, paid = 0;
  for (const r of state.records) if (r.workerId === workerId) payable += r.amount;
  for (const tx of state.transactions) if (tx.status === "active" && tx.workerId === workerId) paid += tx.amount;
  return { payable, paid, outstanding: payable - paid };
}

function workerCard(w, admin) {
  const s = statsFor(w.id);
  return `
    <div class="card"><div class="card-body">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="icon-circle tone-brass">${iconHtml("hardHat")}</span>
          <div><p class="font-medium">${escapeHtml(w.name)}</p>${w.role ? `<p class="text-xs text-concrete">${escapeHtml(w.role)}</p>` : ""}</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-ledger font-medium text-sm">${formatINR(s.outstanding)} due</span>
          ${admin ? `
            <button type="button" class="btn-icon" data-edit-wk="${w.id}" aria-label="Edit ${escapeHtml(w.name)}" title="Edit">${iconHtml("pencil")}</button>
            <button type="button" class="btn-icon" data-delete-wk="${w.id}" aria-label="Delete ${escapeHtml(w.name)}" title="Delete" style="color:var(--rust);">${iconHtml("trash")}</button>
          ` : ""}
        </div>
      </div>
      <div class="flex gap-2 mt-3" style="flex-wrap:wrap;">
        <button type="button" class="btn btn-outline btn-sm" data-log="${w.id}">${iconHtml("calendarPlus")}Log work</button>
        <button type="button" class="btn btn-outline btn-sm" data-pay="${w.id}">${iconHtml("rupee")}Pay</button>
        <button type="button" class="btn btn-outline btn-sm" data-history="${w.id}">${iconHtml("history")}History</button>
      </div>
    </div></div>`;
}

function paint(container) {
  const admin = isAdmin();
  container.innerHTML = `
    <div class="flex items-center justify-end"><button type="button" class="btn btn-primary" id="wk-add">${iconHtml("plus")}${t("action_add")}</button></div>
    <div class="flex-col gap-3 mt-3">
      ${!state.loaded ? skeletonList() : state.workers.length === 0 ? emptyState(t("empty_generic_body")) : state.workers.map((w) => workerCard(w, admin)).join('<div style="height:12px;"></div>')}
    </div>
  `;
  container.querySelector("#wk-add").addEventListener("click", () => openWorkerForm());
  container.querySelectorAll("[data-log]").forEach((btn) =>
    btn.addEventListener("click", () => openLogForm(state.workers.find((w) => w.id === btn.getAttribute("data-log"))))
  );
  container.querySelectorAll("[data-pay]").forEach((btn) =>
    btn.addEventListener("click", () => openWorkerPaymentForm(state.workers.find((w) => w.id === btn.getAttribute("data-pay"))))
  );
  container.querySelectorAll("[data-history]").forEach((btn) =>
    btn.addEventListener("click", () => openHistoryDialog(state.workers.find((w) => w.id === btn.getAttribute("data-history"))))
  );
  container.querySelectorAll("[data-edit-wk]").forEach((btn) =>
    btn.addEventListener("click", () => openWorkerForm(state.workers.find((w) => w.id === btn.getAttribute("data-edit-wk"))))
  );
  container.querySelectorAll("[data-delete-wk]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const worker = state.workers.find((w) => w.id === btn.getAttribute("data-delete-wk"));
      if (!worker) return;
      const ok = window.confirm(`Delete "${worker.name}" permanently? This can't be undone. Their logged work days and past payments stay in the records; you just won't be able to log new ones for them.`);
      if (!ok) return;
      const actor = currentActor();
      if (!actor) return;
      hardDeleteWithAudit(workerDoc(worker.id), "worker", worker, actor)
        .then(() => toast("success", "Worker deleted"))
        .catch((err) => { console.error(err); toast("error", "Couldn't delete. Check your permissions."); });
    })
  );
}

function openWorkerForm(worker) {
  const isEdit = !!worker;
  const bodyHtml = `
    <form id="wk-form">
      <div class="field"><label for="wk-name">Name</label><input class="input" id="wk-name" value="${escapeHtml(worker?.name || "")}" required /></div>
      <div class="field"><label for="wk-role">Role</label><input class="input" id="wk-role" value="${escapeHtml(worker?.role || "")}" placeholder="e.g. Mason, Electrician" /></div>
      <div class="field-row">
        <div class="field"><label for="wk-rate">Daily rate (₹)</label><input class="input" id="wk-rate" type="number" value="${worker?.dailyRate ?? ""}" /></div>
        <div class="field"><label for="wk-agreed">Agreed amount (₹)</label><input class="input" id="wk-agreed" type="number" value="${worker?.agreedAmount ?? ""}" /></div>
      </div>
      <div class="field"><label for="wk-notes">${t("field_notes")}</label><textarea class="input" id="wk-notes" rows="2">${escapeHtml(worker?.notes || "")}</textarea></div>
      <p class="field-error hidden" id="wk-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="wk-submit">${t("action_save")}</button>
      </div>
    </form>`;
  openDialog({
    title: isEdit ? "Edit worker" : t("nav_workers"), size: "sm", bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#wk-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const name = body.querySelector("#wk-name").value.trim();
        if (!name) return;
        const values = {
          name, role: body.querySelector("#wk-role").value.trim() || null,
          dailyRate: parseFloat(body.querySelector("#wk-rate").value) || null,
          agreedAmount: parseFloat(body.querySelector("#wk-agreed").value) || null,
          notes: body.querySelector("#wk-notes").value.trim() || null,
        };
        const btn = body.querySelector("#wk-submit");
        btn.disabled = true;
        try {
          if (isEdit) {
            await updateWithAudit(workerDoc(worker.id), "worker", worker, values, actor);
          } else {
            await createWithAudit(workersCol(), "worker", { ...values, isActive: true }, actor);
          }
          toast("success", isEdit ? "Worker updated" : "Worker added");
          close();
        } catch (err) {
          console.error(err);
          body.querySelector("#wk-error").textContent = "Couldn't save the worker.";
          body.querySelector("#wk-error").classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
}

function openLogForm(worker) {
  const bodyHtml = `
    <form id="log-form">
      <div class="field"><label for="log-date">${t("field_date")}</label><input class="input" id="log-date" type="date" value="${toDateInputValue(new Date())}" /></div>
      <div class="field-row">
        <div class="field"><label for="log-days">Days</label><input class="input" id="log-days" type="number" step="0.5" value="1" required /></div>
        <div class="field"><label for="log-rate">Rate/day (₹)</label><input class="input" id="log-rate" type="number" value="${worker.dailyRate || 0}" required /></div>
      </div>
      <p class="text-xs text-concrete" id="log-amount">Amount: ₹0</p>
      <p class="field-error hidden" id="log-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="log-submit">${t("action_save")}</button>
      </div>
    </form>`;
  openDialog({
    title: `Log work — ${worker.name}`, size: "sm", bodyHtml,
    onMount(body, close) {
      const daysEl = body.querySelector("#log-days");
      const rateEl = body.querySelector("#log-rate");
      const amountEl = body.querySelector("#log-amount");
      const updateAmount = () => { amountEl.textContent = `Amount: ${formatINR((parseFloat(daysEl.value) || 0) * (parseFloat(rateEl.value) || 0))}`; };
      daysEl.addEventListener("input", updateAmount);
      rateEl.addEventListener("input", updateAmount);
      updateAmount();
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#log-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const days = parseFloat(daysEl.value);
        const rate = parseFloat(rateEl.value);
        if (!days || days <= 0 || !rate || rate <= 0) {
          body.querySelector("#log-error").textContent = "Enter valid days and rate.";
          body.querySelector("#log-error").classList.remove("hidden");
          return;
        }
        const btn = body.querySelector("#log-submit");
        btn.disabled = true;
        try {
          await createWithAudit(workRecordsCol(), "workerWorkRecord", {
            workerId: worker.id, date: dateInputToTimestamp(body.querySelector("#log-date").value),
            days, rate, amount: days * rate,
          }, actor);
          toast("success", "Work day logged");
          close();
        } catch (err) {
          console.error(err);
          body.querySelector("#log-error").textContent = "Couldn't save the record.";
          body.querySelector("#log-error").classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
}


function openHistoryDialog(worker) {
  if (!worker) return;

  function rows() {
    const logRows = state.records
      .filter((r) => r.workerId === worker.id)
      .sort((a, b) => (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0));
    const payRows = state.transactions
      .filter((tx) => tx.workerId === worker.id)
      .sort((a, b) => (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0));
    return { logRows, payRows };
  }

  function renderBody() {
    const { logRows, payRows } = rows();
    const admin = isAdmin();
    return `
      <div>
        <h3 class="font-display" style="font-size:13px;font-weight:600;">Work days logged</h3>
        <div class="mt-2 flex-col gap-1">
          ${logRows.length === 0 ? `<p class="text-xs text-concrete">${t("empty_generic_body")}</p>` : logRows.map((r) => `
            <div class="flex items-center justify-between text-sm" style="padding:6px 0;border-top:1px solid var(--hairline);">
              <span class="text-concrete">${formatDate(r.date, getLocale())} · ${r.days} day(s) @ ${formatINR(r.rate)}</span>
              <div class="flex items-center gap-2">
                <span class="font-ledger">${formatINR(r.amount)}</span>
                ${admin ? `<button type="button" class="btn-icon" data-del-log="${r.id}" aria-label="Delete this work-day entry" title="Delete" style="color:var(--rust);">${iconHtml("trash")}</button>` : ""}
              </div>
            </div>`).join("")}
        </div>
      </div>
      <div class="mt-4">
        <h3 class="font-display" style="font-size:13px;font-weight:600;">Payments made</h3>
        <div class="mt-2 flex-col gap-1">
          ${payRows.length === 0 ? `<p class="text-xs text-concrete">${t("empty_generic_body")}</p>` : payRows.map((tx) => `
            <div class="flex items-center justify-between text-sm" style="padding:6px 0;border-top:1px solid var(--hairline);${tx.status === "deleted" ? "opacity:.5;" : ""}">
              <span class="text-concrete">${formatDate(tx.date, getLocale())}${tx.status === "deleted" ? " · deleted" : ""}</span>
              <div class="flex items-center gap-2">
                <span class="font-ledger">${formatINR(tx.amount)}</span>
                ${admin
                  ? (tx.status === "active"
                      ? `<button type="button" class="btn-icon" data-edit-pay="${tx.id}" aria-label="Edit this payment" title="Edit">${iconHtml("pencil")}</button><button type="button" class="btn-icon" data-del-pay="${tx.id}" aria-label="Delete this payment" title="Delete" style="color:var(--rust);">${iconHtml("trash")}</button>`
                      : `<button type="button" class="btn-icon" data-restore-pay="${tx.id}" aria-label="Restore this payment" title="Restore">${iconHtml("undo")}</button>`)
                  : ""}
              </div>
            </div>`).join("")}
        </div>
        ${admin ? `<p class="text-xs text-concrete mt-2">Deleting a payment here is the same as deleting it from the Transactions tab — it's soft-deleted and can be restored from Audit history if needed.</p>` : ""}
      </div>
    `;
  }

  const handle = openDialog({
    title: `History — ${worker.name}`,
    bodyHtml: renderBody(),
    onMount(body) {
      wireHistoryEvents(body);
    },
  });

  function wireHistoryEvents(body) {
    body.querySelectorAll("[data-del-log]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const actor = currentActor();
        if (!actor) return;
        const record = state.records.find((r) => r.id === btn.getAttribute("data-del-log"));
        if (!record) return;
        if (!window.confirm("Delete this logged work day? This can't be undone and will reduce this worker's payable total.")) return;
        try {
          await hardDeleteWithAudit(workRecordDoc(record.id), "workerWorkRecord", record, actor);
          toast("success", "Work-day entry deleted");
          body.innerHTML = renderBody();
          wireHistoryEvents(body);
        } catch (err) {
          console.error(err);
          toast("error", "Couldn't delete. Check your permissions.");
        }
      })
    );
    body.querySelectorAll("[data-edit-pay]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const { payRows } = rows();
        const paymentTx = payRows.find((r) => r.id === btn.getAttribute("data-edit-pay"));
        if (paymentTx) openWorkerPaymentForm(worker, paymentTx);
      })
    );
    body.querySelectorAll("[data-del-pay]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const actor = currentActor();
        if (!actor) return;
        if (!window.confirm("Delete this payment? It moves to Audit history and can be restored from there if needed.")) return;
        try {
          await softDeleteWithAudit(transactionDoc(btn.getAttribute("data-del-pay")), "transaction", actor);
          toast("success", "Payment deleted");
          body.innerHTML = renderBody();
          wireHistoryEvents(body);
        } catch (err) {
          console.error(err);
          toast("error", "Couldn't delete. Check your permissions.");
        }
      })
    );
    body.querySelectorAll("[data-restore-pay]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const actor = currentActor();
        if (!actor) return;
        try {
          await restoreWithAudit(transactionDoc(btn.getAttribute("data-restore-pay")), "transaction", actor);
          toast("success", "Payment restored");
          body.innerHTML = renderBody();
          wireHistoryEvents(body);
        } catch (err) {
          console.error(err);
          toast("error", "Couldn't restore. Check your permissions.");
        }
      })
    );
  }
}
