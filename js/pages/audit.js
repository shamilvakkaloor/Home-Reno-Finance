import { onSnapshot, orderBy, query } from "../lib/fs.js";
import { auditLogCol } from "../lib/collections.js";
import { formatDate, escapeHtml } from "../lib/format.js";
import { t, getLocale } from "../lib/i18n.js";
import { emptyState, skeletonList, badge } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { addCleanup } from "../lib/router.js";
import { isAdmin } from "../lib/auth.js";

let state = { logs: [], loaded: false, entityFilter: "all" };
let currentContainer = null;

const ACTION_META = {
  create: { icon: "plus", tone: "green" },
  update: { icon: "pencil", tone: "amber" },
  delete: { icon: "trash", tone: "rust" },
  restore: { icon: "rotateCcw", tone: "blueprint" },
};

export async function render(container) {
  currentContainer = container;
  if (!isAdmin()) {
    container.innerHTML = emptyState("Admins only", "Audit history is visible to admins.");
    return;
  }
  state.entityFilter = "all";
  const unsub = onSnapshot(query(auditLogCol(), orderBy("performedAt", "desc")), (snap) => {
    state.logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.loaded = true;
    repaint();
  });
  addCleanup(unsub);
  paint(container);
}

function repaint() { if (currentContainer) paint(currentContainer); }

function paint(container) {
  const entityTypes = [...new Set(state.logs.map((l) => l.entityType))];
  const filtered = state.entityFilter === "all" ? state.logs : state.logs.filter((l) => l.entityType === state.entityFilter);

  container.innerHTML = `
    <select class="input" id="audit-filter" style="width:auto;min-width:160px;">
      <option value="all">All entities</option>
      ${entityTypes.map((e) => `<option value="${e}" ${state.entityFilter === e ? "selected" : ""}>${escapeHtml(e)}</option>`).join("")}
    </select>
    <div class="flex-col gap-2 mt-3">
      ${!state.loaded ? skeletonList() : filtered.length === 0 ? emptyState("No audit entries yet") : filtered.map(logRow).join("")}
    </div>
  `;
  container.querySelector("#audit-filter").addEventListener("change", (e) => { state.entityFilter = e.target.value; paint(container); });
}

function logRow(log) {
  const meta = ACTION_META[log.action] || ACTION_META.update;
  return `
    <div class="card"><div class="card-body tight flex items-center gap-3">
      <span class="icon-circle tone-${meta.tone}">${iconHtml(meta.icon)}</span>
      <div style="min-width:0;flex:1;">
        <p class="text-sm"><span class="font-medium">${escapeHtml(log.performedByName || "Someone")}</span> ${log.action}d a ${escapeHtml(log.entityType)}</p>
        <p class="text-xs text-concrete">${formatDate(log.performedAt, getLocale())}</p>
      </div>
      ${badge(log.action, meta.tone)}
    </div></div>`;
}
