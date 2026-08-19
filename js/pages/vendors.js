import { onSnapshot, Timestamp } from "../lib/fs.js";
import { vendorsCol, transactionsCol, billsCol, vendorDoc } from "../lib/collections.js";
import { formatINR, escapeHtml } from "../lib/format.js";
import { t } from "../lib/i18n.js";
import { emptyState, skeletonList, badge, openDialog, toast } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { addCleanup } from "../lib/router.js";
import { currentActor, isAdmin } from "../lib/auth.js";
import { createWithAudit, updateWithAudit, hardDeleteWithAudit } from "../lib/crud.js";

let state = { vendors: [], transactions: [], bills: [], loaded: false };
let currentContainer = null;

export async function render(container) {
  currentContainer = container;
  const unsubVen = onSnapshot(vendorsCol(), (snap) => { state.vendors = snap.docs.map((d) => ({ id: d.id, ...d.data() })); state.loaded = true; repaint(); });
  const unsubTx = onSnapshot(transactionsCol(), (snap) => { state.transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  const unsubBills = onSnapshot(billsCol(), (snap) => { state.bills = snap.docs.map((d) => ({ id: d.id, ...d.data() })); repaint(); });
  [unsubVen, unsubTx, unsubBills].forEach(addCleanup);
  paint(container);
}

function repaint() { if (currentContainer) paint(currentContainer); }

function statsFor(vendorId) {
  let total = 0, count = 0, pending = 0;
  for (const tx of state.transactions) {
    if (tx.status !== "active" || tx.vendorId !== vendorId) continue;
    total += tx.amount; count += 1;
  }
  for (const bill of state.bills) {
    if (bill.vendorId !== vendorId || bill.status === "paid" || bill.status === "cancelled") continue;
    pending += bill.remainingAmount;
  }
  return { total, count, pending };
}

function vendorCard(v, admin) {
  const s = statsFor(v.id);
  return `
    <div class="card"><div class="card-body">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2">
          <span class="icon-circle tone-brass">${iconHtml("store")}</span>
          <div><p class="font-medium">${escapeHtml(v.name)}</p>${badge(v.type, "neutral")}</div>
        </div>
        <div class="flex items-center gap-1">
          ${v.phone ? `<a href="tel:${escapeHtml(v.phone)}" class="text-xs" style="color:var(--blueprint);display:flex;align-items:center;gap:4px;margin-right:4px;">${iconHtml("phone")}${escapeHtml(v.phone)}</a>` : ""}
          ${admin ? `
            <button type="button" class="btn-icon" data-edit-ven="${v.id}" aria-label="Edit ${escapeHtml(v.name)}" title="Edit">${iconHtml("pencil")}</button>
            <button type="button" class="btn-icon" data-delete-ven="${v.id}" aria-label="Delete ${escapeHtml(v.name)}" title="Delete" style="color:var(--rust);">${iconHtml("trash")}</button>
          ` : ""}
        </div>
      </div>
      <div class="flex justify-between text-sm mt-3"><span class="text-concrete">${s.count} transactions</span><span class="font-ledger font-medium">${formatINR(s.total)}</span></div>
      ${s.pending > 0 ? `<p class="font-ledger text-xs mt-1" style="color:var(--amber);">${formatINR(s.pending)} pending</p>` : ""}
    </div></div>`;
}

function paint(container) {
  const admin = isAdmin();
  container.innerHTML = `
    <div class="flex items-center justify-end"><button type="button" class="btn btn-primary" id="ven-add">${iconHtml("plus")}${t("action_add")}</button></div>
    <div class="grid-2 mt-3">
      ${!state.loaded ? skeletonList() : state.vendors.length === 0 ? emptyState(t("empty_generic_body")) : state.vendors.map((v) => vendorCard(v, admin)).join("")}
    </div>
  `;
  container.querySelector("#ven-add").addEventListener("click", () => openVendorForm());

  container.querySelectorAll("[data-edit-ven]").forEach((btn) =>
    btn.addEventListener("click", () => openVendorForm(state.vendors.find((v) => v.id === btn.getAttribute("data-edit-ven"))))
  );
  container.querySelectorAll("[data-delete-ven]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const vendor = state.vendors.find((v) => v.id === btn.getAttribute("data-delete-ven"));
      if (!vendor) return;
      const ok = window.confirm(`Delete "${vendor.name}" permanently? This can't be undone. Existing transactions/bills that reference it are unaffected.`);
      if (!ok) return;
      const actor = currentActor();
      if (!actor) return;
      hardDeleteWithAudit(vendorDoc(vendor.id), "vendor", vendor, actor)
        .then(() => toast("success", "Vendor deleted"))
        .catch((err) => { console.error(err); toast("error", "Couldn't delete. Check your permissions."); });
    })
  );
}

function openVendorForm(vendor) {
  const isEdit = !!vendor;
  const bodyHtml = `
    <form id="ven-form">
      <div class="field"><label for="ven-name">Name</label><input class="input" id="ven-name" value="${escapeHtml(vendor?.name || "")}" required /></div>
      <div class="field"><label for="ven-type">Type</label>
        <select class="input" id="ven-type">
          <option value="shop" ${vendor?.type === "shop" ? "selected" : ""}>Shop</option>
          <option value="contractor" ${vendor?.type === "contractor" ? "selected" : ""}>Contractor</option>
          <option value="worker" ${vendor?.type === "worker" ? "selected" : ""}>Worker</option>
          <option value="individual" ${vendor?.type === "individual" ? "selected" : ""}>Individual</option>
          <option value="other" ${vendor?.type === "other" ? "selected" : ""}>Other</option>
        </select>
      </div>
      <div class="field"><label for="ven-phone">Phone</label><input class="input" id="ven-phone" value="${escapeHtml(vendor?.phone || "")}" /></div>
      <div class="field"><label for="ven-address">Address</label><input class="input" id="ven-address" value="${escapeHtml(vendor?.address || "")}" /></div>
      <div class="field"><label for="ven-notes">${t("field_notes")}</label><textarea class="input" id="ven-notes" rows="2">${escapeHtml(vendor?.notes || "")}</textarea></div>
      <p class="field-error hidden" id="ven-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>${t("action_cancel")}</button>
        <button type="submit" class="btn btn-primary" id="ven-submit">${t("action_save")}</button>
      </div>
    </form>`;
  openDialog({
    title: isEdit ? "Edit vendor" : t("nav_vendors"), size: "sm", bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#ven-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const actor = currentActor();
        if (!actor) return;
        const name = body.querySelector("#ven-name").value.trim();
        if (!name) return;
        const values = {
          name, type: body.querySelector("#ven-type").value,
          phone: body.querySelector("#ven-phone").value.trim() || null,
          address: body.querySelector("#ven-address").value.trim() || null,
          notes: body.querySelector("#ven-notes").value.trim() || null,
        };
        const btn = body.querySelector("#ven-submit");
        btn.disabled = true;
        try {
          if (isEdit) {
            await updateWithAudit(vendorDoc(vendor.id), "vendor", vendor, values, actor);
          } else {
            await createWithAudit(vendorsCol(), "vendor", { ...values, isActive: true }, actor);
          }
          toast("success", isEdit ? "Vendor updated" : "Vendor added");
          close();
        } catch (err) {
          console.error(err);
          body.querySelector("#ven-error").textContent = "Couldn't save the vendor.";
          body.querySelector("#ven-error").classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
}
