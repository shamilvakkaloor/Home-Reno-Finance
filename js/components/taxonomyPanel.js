import { doc, Timestamp, writeBatch, onSnapshot } from "../lib/fs.js";
import { categoriesCol, sourcesCol, categoryDoc, sourceDoc, phasesCol, phaseDoc, getDb } from "../lib/collections.js";
import { escapeHtml } from "../lib/format.js";
import { toast, openDialog } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { currentActor } from "../lib/auth.js";
import { createWithAudit, updateWithAudit, hardDeleteWithAudit } from "../lib/crud.js";
import { addCleanup } from "../lib/router.js";

let categories = [];
let sources = [];
let phases = [];
let mountedContainer = null;

const DEFAULT_CATEGORIES = [
  { name: "Cement & Concrete", nameMl: "സിമന്റ് & കോൺക്രീറ്റ്" },
  { name: "Steel & Iron", nameMl: "സ്റ്റീൽ & ഇരുമ്പ്" },
  { name: "Bricks & Blocks", nameMl: "ഇഷ്ടികകൾ & ബ്ലോക്കുകൾ" },
  { name: "Sand & Aggregates", nameMl: "മണൽ & അഗ്രഗേറ്റ്സ്" },
  { name: "Electrical", nameMl: "ഇലക്ട്രിക്കൽ" },
  { name: "Plumbing", nameMl: "പ്ലംബിംഗ്" },
  { name: "Tiles & Flooring", nameMl: "ടൈലുകൾ & ഫ്ലോറിംഗ്" },
  { name: "Paint & Finishing", nameMl: "പെയിന്റ് & ഫിനിഷിംഗ്" },
  { name: "Carpentry & Woodwork", nameMl: "ആശാരി പണി" },
  { name: "Labour Wages", nameMl: "കൂലി" },
  { name: "Transport", nameMl: "ഗതാഗതം" },
  { name: "Permits & Fees", nameMl: "അനുമതികൾ & ഫീസ്" },
  { name: "Miscellaneous", nameMl: "മറ്റുള്ളവ" },
];
const DEFAULT_SOURCES = [
  { name: "Personal savings", nameMl: "സ്വന്തം സമ്പാദ്യം" },
  { name: "Family contribution", nameMl: "കുടുംബ സംഭാവന" },
  { name: "Salary", nameMl: "ശമ്പളം" },
];
const DEFAULT_PHASES = [
  { name: "Foundation", nameMl: "അടിത്തറ" },
  { name: "Structure / Framing", nameMl: "ഘടന" },
  { name: "Roofing", nameMl: "മേൽക്കൂര" },
  { name: "Electrical & Plumbing", nameMl: "ഇലക്ട്രിക്കൽ & പ്ലംബിംഗ്" },
  { name: "Plastering & Finishing", nameMl: "പ്ലാസ്റ്ററിംഗ് & ഫിനിഷിംഗ്" },
  { name: "Interiors", nameMl: "ഇന്റീരിയർ" },
];

async function seedDefaults(actorUid) {
  const db = getDb();
  const batch = writeBatch(db);
  DEFAULT_CATEGORIES.forEach((c, i) => {
    batch.set(doc(db, "categories", `seed-cat-${i}`), { ...c, order: i, isActive: true, createdAt: Timestamp.now(), createdBy: actorUid }, { merge: true });
  });
  DEFAULT_SOURCES.forEach((s, i) => {
    batch.set(doc(db, "moneySources", `seed-src-${i}`), { ...s, isActive: true, createdAt: Timestamp.now(), createdBy: actorUid }, { merge: true });
  });
  DEFAULT_PHASES.forEach((p, i) => {
    batch.set(doc(db, "phases", `seed-phase-${i}`), { ...p, order: i, isActive: true, createdAt: Timestamp.now(), createdBy: actorUid }, { merge: true });
  });
  await batch.commit();
  return { categories: DEFAULT_CATEGORIES.length, sources: DEFAULT_SOURCES.length, phases: DEFAULT_PHASES.length };
}

export function renderTaxonomyPanel(container) {
  mountedContainer = container;
  const unsubCat = onSnapshot(categoriesCol(), (snap) => { categories = snap.docs.map((d) => ({ id: d.id, ...d.data() })); paint(); });
  const unsubSrc = onSnapshot(sourcesCol(), (snap) => { sources = snap.docs.map((d) => ({ id: d.id, ...d.data() })); paint(); });
  const unsubPhase = onSnapshot(phasesCol(), (snap) => { phases = snap.docs.map((d) => ({ id: d.id, ...d.data() })); paint(); });
  [unsubCat, unsubSrc, unsubPhase].forEach(addCleanup);
  paint();
}

function listSection({ title, items, newInputId, newMlInputId, addBtnId, placeholder, hasMl, entityType }) {
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">${title}</span></div>
      <div class="card-body">
        <div class="flex gap-2">
          <input class="input" id="${newInputId}" placeholder="${placeholder}" />
          ${hasMl ? `<input class="input" id="${newMlInputId}" placeholder="Malayalam (optional)" />` : ""}
          <button type="button" class="btn-icon" style="background:var(--blueprint);color:#fff;" id="${addBtnId}" aria-label="Add">${iconHtml("plus")}</button>
        </div>
        <div class="mt-3">
          ${items.map((item) => `
            <div class="flex items-center justify-between text-sm" style="padding:6px 0;border-top:1px solid var(--hairline);">
              <span style="${item.isActive ? "" : "color:var(--concrete-light);text-decoration:line-through;"}">${escapeHtml(item.name)}${item.nameMl ? ` <span lang="ml">(${escapeHtml(item.nameMl)})</span>` : ""}</span>
              <div class="flex items-center gap-1">
                <button type="button" class="btn-icon" data-toggle="${entityType}:${item.id}" data-active="${item.isActive}" aria-label="${item.isActive ? "Deactivate" : "Activate"} ${escapeHtml(item.name)}" title="${item.isActive ? "Deactivate (hide from pickers)" : "Activate"}">${iconHtml(item.isActive ? "eye" : "eyeOff")}</button>
                <button type="button" class="btn-icon" data-edit="${entityType}:${item.id}" aria-label="Edit ${escapeHtml(item.name)}" title="Edit">${iconHtml("pencil")}</button>
                <button type="button" class="btn-icon" data-delete="${entityType}:${item.id}" aria-label="Delete ${escapeHtml(item.name)}" title="Delete permanently" style="color:var(--rust);">${iconHtml("trash")}</button>
              </div>
            </div>`).join("")}
        </div>
      </div>
    </div>`;
}

const ENTITY_META = {
  category: { list: () => categories, docFn: categoryDoc, col: categoriesCol, hasMl: true, label: "category" },
  moneySource: { list: () => sources, docFn: sourceDoc, col: sourcesCol, hasMl: false, label: "money source" },
  phase: { list: () => phases, docFn: phaseDoc, col: phasesCol, hasMl: true, label: "phase" },
};

function paint() {
  if (!mountedContainer) return;
  const showSeed = categories.length === 0 && sources.length === 0 && phases.length === 0;
  mountedContainer.innerHTML = `
    ${showSeed ? `<button type="button" class="btn" style="background:var(--brass-light);color:var(--brass);" id="seed-btn">Add starter categories, sources &amp; phases</button>` : ""}
    <div class="grid-2 mt-3">
      ${listSection({ title: "Expense categories", items: categories, newInputId: "new-cat", newMlInputId: "new-cat-ml", addBtnId: "add-cat", placeholder: "Category (English)", hasMl: true, entityType: "category" })}
      ${listSection({ title: "Money sources", items: sources, newInputId: "new-src", addBtnId: "add-src", placeholder: "Source name", hasMl: false, entityType: "moneySource" })}
    </div>
    <div class="mt-3">
      ${listSection({ title: "Construction phases", items: phases, newInputId: "new-phase", newMlInputId: "new-phase-ml", addBtnId: "add-phase", placeholder: "Phase (e.g. Foundation)", hasMl: true, entityType: "phase" })}
    </div>
    <p class="text-xs text-concrete mt-2">Phases show up when logging an expense, a bill payment, or a worker payment, so you can see labor + material cost broken down by construction stage in Reports.</p>
  `;

  mountedContainer.querySelector("#seed-btn")?.addEventListener("click", async () => {
    const a = currentActor();
    if (!a) return;
    try {
      const res = await seedDefaults(a.uid);
      toast("success", `Added ${res.categories} categories, ${res.sources} sources, and ${res.phases} phases.`);
    } catch (err) {
      console.error(err);
      toast("error", "Couldn't seed starter data.");
    }
  });

  mountedContainer.querySelector("#add-cat").addEventListener("click", () => addItem("category", "new-cat", "new-cat-ml"));
  mountedContainer.querySelector("#add-src").addEventListener("click", () => addItem("moneySource", "new-src", null));
  mountedContainer.querySelector("#add-phase").addEventListener("click", () => addItem("phase", "new-phase", "new-phase-ml"));

  mountedContainer.querySelectorAll("[data-toggle]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const [entityType, id] = btn.getAttribute("data-toggle").split(":");
      toggleItem(entityType, id);
    })
  );
  mountedContainer.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const [entityType, id] = btn.getAttribute("data-edit").split(":");
      const item = ENTITY_META[entityType].list().find((x) => x.id === id);
      if (item) openEditDialog(entityType, item);
    })
  );
  mountedContainer.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const [entityType, id] = btn.getAttribute("data-delete").split(":");
      const item = ENTITY_META[entityType].list().find((x) => x.id === id);
      if (item) confirmDelete(entityType, item);
    })
  );
}

async function addItem(entityType, nameInputId, mlInputId) {
  const meta = ENTITY_META[entityType];
  const name = mountedContainer.querySelector(`#${nameInputId}`).value.trim();
  const nameMl = mlInputId ? mountedContainer.querySelector(`#${mlInputId}`).value.trim() : "";
  const a = currentActor();
  if (!name || !a) return;
  try {
    const payload = { name, isActive: true };
    if (meta.hasMl) payload.nameMl = nameMl || null;
    if (entityType === "category" || entityType === "phase") payload.order = meta.list().length;
    await createWithAudit(meta.col(), entityType, payload, a);
    mountedContainer.querySelector(`#${nameInputId}`).value = "";
    if (mlInputId) mountedContainer.querySelector(`#${mlInputId}`).value = "";
  } catch (err) {
    console.error(err);
    toast("error", `Couldn't add the ${meta.label}.`);
  }
}

async function toggleItem(entityType, id) {
  const meta = ENTITY_META[entityType];
  const item = meta.list().find((x) => x.id === id);
  const a = currentActor();
  if (!item || !a) return;
  await updateWithAudit(meta.docFn(id), entityType, item, { isActive: !item.isActive }, a);
}

function openEditDialog(entityType, item) {
  const meta = ENTITY_META[entityType];
  const bodyHtml = `
    <form id="edit-taxonomy-form">
      <div class="field"><label for="edit-name">Name (English)</label><input class="input" id="edit-name" value="${escapeHtml(item.name)}" required /></div>
      ${meta.hasMl ? `<div class="field"><label for="edit-name-ml">Malayalam (optional)</label><input class="input" id="edit-name-ml" value="${escapeHtml(item.nameMl || "")}" lang="ml" /></div>` : ""}
      <p class="field-error hidden" id="edit-taxonomy-error"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary" id="edit-taxonomy-submit">Save</button>
      </div>
    </form>`;
  openDialog({
    title: `Edit ${meta.label}`,
    size: "sm",
    bodyHtml,
    onMount(body, close) {
      body.querySelector("[data-cancel]").addEventListener("click", close);
      body.querySelector("#edit-taxonomy-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const a = currentActor();
        if (!a) return;
        const name = body.querySelector("#edit-name").value.trim();
        if (!name) return;
        const changes = { name };
        if (meta.hasMl) changes.nameMl = body.querySelector("#edit-name-ml").value.trim() || null;
        const btn = body.querySelector("#edit-taxonomy-submit");
        btn.disabled = true;
        try {
          await updateWithAudit(meta.docFn(item.id), entityType, item, changes, a);
          toast("success", "Saved");
          close();
        } catch (err) {
          console.error(err);
          body.querySelector("#edit-taxonomy-error").textContent = "Couldn't save changes.";
          body.querySelector("#edit-taxonomy-error").classList.remove("hidden");
          btn.disabled = false;
        }
      });
    },
  });
}

function confirmDelete(entityType, item) {
  const meta = ENTITY_META[entityType];
  const ok = window.confirm(`Delete "${item.name}" permanently? This can't be undone. Existing transactions that reference it are unaffected.`);
  if (!ok) return;
  const a = currentActor();
  if (!a) return;
  hardDeleteWithAudit(meta.docFn(item.id), entityType, item, a)
    .then(() => toast("success", "Deleted"))
    .catch((err) => {
      console.error(err);
      toast("error", "Couldn't delete. Check your permissions.");
    });
}
