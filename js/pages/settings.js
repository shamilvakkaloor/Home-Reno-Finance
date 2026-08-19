import { setDoc } from "../lib/fs.js";
import { settingsDoc } from "../lib/collections.js";
import { escapeHtml } from "../lib/format.js";
import { t } from "../lib/i18n.js";
import { toast } from "../lib/ui.js";
import { isAdmin, currentActor, authStore } from "../lib/auth.js";
import { addCleanup } from "../lib/router.js";
import { renderUsersPanel } from "../components/usersPanel.js";
import { renderTaxonomyPanel } from "../components/taxonomyPanel.js";
import { onSnapshot } from "../lib/fs.js";

const DEFAULT_SETTINGS = { projectName: "Home Reno Finance", totalBudget: 0, budgetThresholds: { warning: 70, critical: 90 } };
let settings = DEFAULT_SETTINGS;
let tab = "project";
let currentContainer = null;

export async function render(container) {
  currentContainer = container;
  tab = "project";
  const unsub = onSnapshot(settingsDoc(), (snap) => {
    settings = snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS;
    if (tab === "project") paint(container);
  });
  addCleanup(unsub);
  paint(container);
}

function paint(container) {
  const admin = isAdmin();
  const appUser = authStore.get().appUser;
  const tabs = [
    { key: "project", label: "Project" },
    ...(admin ? [{ key: "users", label: "Users & access" }] : []),
    ...(admin ? [{ key: "taxonomy", label: "Categories & sources" }] : []),
  ];

  container.innerHTML = `
    <div class="tab-row">${tabs.map((tb) => `<button type="button" class="pill ${tab === tb.key ? "active" : ""}" data-tab="${tb.key}">${escapeHtml(tb.label)}</button>`).join("")}</div>
    <div id="settings-tab-content" class="mt-3"></div>
  `;

  container.querySelectorAll("[data-tab]").forEach((btn) =>
    btn.addEventListener("click", () => { tab = btn.getAttribute("data-tab"); paint(container); })
  );

  const content = container.querySelector("#settings-tab-content");
  if (tab === "project") {
    content.innerHTML = `
      <div class="card"><div class="card-header"><span class="card-title">Project details</span></div>
        <div class="card-body">
          <div class="field"><label for="proj-name">Project name</label><input class="input" id="proj-name" value="${escapeHtml(settings.projectName)}" ${admin ? "" : "disabled"} /></div>
          <div class="field-row">
            <div class="field"><label for="proj-warn">Warning threshold (%)</label><input class="input" id="proj-warn" type="number" value="${settings.budgetThresholds.warning}" ${admin ? "" : "disabled"} /></div>
            <div class="field"><label for="proj-crit">Critical threshold (%)</label><input class="input" id="proj-crit" type="number" value="${settings.budgetThresholds.critical}" ${admin ? "" : "disabled"} /></div>
          </div>
          ${admin ? `<button type="button" class="btn btn-primary" id="proj-save">${t("action_save")}</button>` : ""}
          <hr class="divider" />
          <p class="text-xs text-concrete">Signed in as <span class="font-medium text-ink">${escapeHtml(appUser?.displayName || "")}</span> (${escapeHtml(appUser?.email || "")}) · Role: <span class="font-medium text-ink">${escapeHtml(appUser?.role || "")}</span></p>
        </div>
      </div>
    `;
    content.querySelector("#proj-save")?.addEventListener("click", async () => {
      try {
        await setDoc(settingsDoc(), {
          ...settings,
          projectName: content.querySelector("#proj-name").value.trim() || "Home Reno Finance",
          budgetThresholds: {
            warning: Number(content.querySelector("#proj-warn").value) || 70,
            critical: Number(content.querySelector("#proj-crit").value) || 90,
          },
        }, { merge: true });
        toast("success", "Settings saved");
      } catch (err) {
        console.error(err);
        toast("error", "Couldn't save settings.");
      }
    });
  } else if (tab === "users" && admin) {
    renderUsersPanel(content);
  } else if (tab === "taxonomy" && admin) {
    renderTaxonomyPanel(content);
  }
}
