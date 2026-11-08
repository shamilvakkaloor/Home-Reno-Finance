import { onSnapshot } from "../lib/fs.js";
import { workersCol, transactionsCol, transactionDoc, workerDoc } from "../lib/collections.js";
import { formatINR, formatDate, escapeHtml } from "../lib/format.js";
import { t, getLocale } from "../lib/i18n.js";
import { emptyState, skeletonList, openDialog, toast } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { addCleanup } from "../lib/router.js";
import { currentActor, isAdmin } from "../lib/auth.js";
import { createWithAudit, updateWithAudit, hardDeleteWithAudit, softDeleteWithAudit, restoreWithAudit } from "../lib/crud.js";
import { openWorkerPaymentForm } from "../components/workerPaymentForm.js";

let state = { workers: [], transactions: [], loaded: false };
let currentContainer = null;
let refreshHistory = null;

export async function render(container) {
  currentContainer = container;
  const unsubW = onSnapshot(workersCol(), (snap) => { state.workers = snap.docs.map((d) => ({ id: d.id, ...d.data() })); state.loaded = true; repaint(); });
  const unsubTx = onSnapshot(transactionsCol(), (snap) => { state.transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  [unsubW, unsubTx].forEach(addCleanup);
  addCleanup(() => { currentContainer = null; refreshHistory = null; });
  paint(container);
}

function repaint() { if (currentContainer) paint(currentContainer); refreshHistory?.(); }

function statsFor(workerId) {
  const payments = state.transactions.filter((tx) => tx.type === "expense" && tx.status === "active" && tx.workerId === workerId);
  return { paid: payments.reduce((sum, tx) => sum + tx.amount, 0), count: payments.length };
}

function workerCard(w, admin) {
  const s = statsFor(w.id);
  return `
    <div class="card"><div class="card-body">
      <div class="flex items-center gap-3">
        <span class="icon-circle tone-brass">${iconHtml("hardHat")}</span>
        <div class="worker-group-title"><h2 class="card-title">${escapeHtml(w.name)}</h2>${w.role ? `<p class="text-xs text-concrete">${escapeHtml(w.role)}</p>` : ""}</div>
      </div>
      <div class="worker-paid"><span class="text-xs text-concrete">Total paid · ${s.count} payment${s.count === 1 ? "" : "s"}</span><div class="account-card-balance">${formatINR(s.paid)}</div></div>
      <div class="worker-actions">
        <button type="button" class="btn btn-primary btn-sm" data-pay="${w.id}">${iconHtml("rupee")}Pay group</button>
        <button type="button" class="btn btn-outline btn-sm" data-history="${w.id}">${iconHtml("history")}View payments</button>
        ${admin ? `<button type="button" class="btn btn-outline btn-sm" data-edit-wk="${w.id}">${iconHtml("pencil")}Edit group</button><button type="button" class="btn-icon" data-delete-wk="${w.id}" aria-label="Delete ${escapeHtml(w.name)}" title="Delete group">${iconHtml("trash")}</button>` : ""}
      </div>
    </div></div>`;
}

function paint(container) {
  const admin = isAdmin();
  container.innerHTML = `
    <div class="flex items-center justify-end"><button type="button" class="btn btn-primary" id="wk-add">${iconHtml("plus")}Add group</button></div>
    <p class="text-sm text-concrete">Pay a team in one entry. Enter the total amount; worker count and description are optional.</p>
    <div class="grid-2 mt-3">
      ${!state.loaded ? skeletonList() : state.workers.length === 0 ? emptyState(t("empty_generic_body")) : state.workers.map((w) => workerCard(w, admin)).join("")}
    </div>
  `;
  container.querySelector("#wk-add").addEventListener("click", () => openWorkerForm());
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
      const ok = window.confirm(`Delete "${worker.name}" permanently? This can't be undone. Past payments stay in the records; you won't be able to make new payments to this group.`);
      if (!ok) return;
      const actor = currentActor();
      if (!actor) return;
      hardDeleteWithAudit(workerDoc(worker.id), "worker", worker, actor)
        .then(() => toast("success", "Group deleted"))
        .catch((err) => { console.error(err); toast("error", "Couldn't delete. Check your permissions."); });
    })
  );
}

function openWorkerForm(worker) {
  const isEdit = !!worker;
  const bodyHtml = `
    <form id="wk-form">
      <div class="field"><label for="wk-name">Group name</label><input class="input" id="wk-name" value="${escapeHtml(worker?.name || "")}" required /></div>
      <div class="field"><label for="wk-role">Work type (optional)</label><input class="input" id="wk-role" value="${escapeHtml(worker?.role || "")}" placeholder="e.g. Concrete, Masonry, Electrical" /></div>
      <div class="field"><label for="wk-notes">${t("field_notes")}</label><textarea class="input" id="wk-notes" rows="2">${escapeHtml(worker?.notes || "")}</textarea></div>
      <p class="field-error hidden" id="wk-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="wk-submit">${t("action_save")}</button>
      </div>
    </form>`;
  openDialog({
    title: isEdit ? "Edit group" : t("nav_workers"), size: "sm", bodyHtml,
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
          toast("success", isEdit ? "Group updated" : "Group added");
          close();
        } catch (err) {
          console.error(err);
          body.querySelector("#wk-error").textContent = "Couldn't save the group.";
          body.querySelector("#wk-error").classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
}

function openHistoryDialog(worker) {
  if (!worker) return;

  function rows() {
    const payRows = state.transactions
      .filter((tx) => tx.type === "expense" && tx.workerId === worker.id)
      .sort((a, b) => (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0));
    return { payRows };
  }

  function renderBody() {
    const { payRows } = rows();
    const admin = isAdmin();
    return `
      <div class="mt-4">
        <h3 class="font-display" style="font-size:13px;font-weight:600;">Payments made</h3>
        <div class="mt-2 flex-col gap-1">
          ${payRows.length === 0 ? `<p class="text-xs text-concrete">${t("empty_generic_body")}</p>` : payRows.map((tx) => `
            <div class="worker-payment-row" style="${tx.status === "deleted" ? "opacity:.5;" : ""}">
              <div class="worker-payment-details"><span class="text-xs text-concrete">${formatDate(tx.date, getLocale())}${tx.workerCount != null ? ` · ${tx.workerCount} worker${tx.workerCount === 1 ? "" : "s"}` : ""}${tx.status === "deleted" ? " · deleted" : ""}</span><p>${escapeHtml(tx.description || "Group payment")}</p></div>
              <div class="flex items-center gap-2">
                <span class="font-ledger">${formatINR(tx.amount)}</span>
                ${admin
                  ? (tx.status === "active"
                      ? `<button type="button" class="btn btn-outline btn-sm" data-edit-pay="${tx.id}" aria-label="Edit this payment" title="Edit payment">${iconHtml("pencil")}Edit</button><button type="button" class="btn-icon" data-del-pay="${tx.id}" aria-label="Delete this payment" title="Delete" style="color:var(--rust);">${iconHtml("trash")}</button>`
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
    title: `Payments — ${worker.name}`,
    size: "lg",
    onClose() { refreshHistory = null; },
    bodyHtml: renderBody(),
    onMount(body) {
      wireHistoryEvents(body);
    },
  });

  refreshHistory = () => { handle.body.innerHTML = renderBody(); wireHistoryEvents(handle.body); };

  function wireHistoryEvents(body) {
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
