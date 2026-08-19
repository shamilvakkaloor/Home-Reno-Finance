import { initAuth, authStore, signInWithGoogle, logout, isFirebaseConfigured, isAdmin } from "./lib/auth.js";
import { t, getLocale, setLocale, onLocaleChange } from "./lib/i18n.js";
import { iconHtml } from "./lib/icons.js";
import { openDialog, bindSingleton } from "./lib/ui.js";
import { registerRoute, registerNotFound, renderRoute, currentPath, navigate, onRouteChange } from "./lib/router.js";
import { primaryNav, secondaryNav, allNav } from "./lib/nav.js";
import { escapeHtml } from "./lib/format.js";

import * as DashboardPage from "./pages/dashboard.js";
import * as TransactionsPage from "./pages/transactions.js";
import * as AccountsPage from "./pages/accounts.js";
import * as LoansPage from "./pages/loans.js";
import * as BillsPage from "./pages/bills.js";
import * as VendorsPage from "./pages/vendors.js";
import * as WorkersPage from "./pages/workers.js";
import * as BudgetPage from "./pages/budget.js";
import * as ReportsPage from "./pages/reports.js";
import * as SettingsPage from "./pages/settings.js";
import * as AuditPage from "./pages/audit.js";

registerRoute("dashboard", DashboardPage.render);
registerRoute("transactions", TransactionsPage.render);
registerRoute("accounts", AccountsPage.render);
registerRoute("loans", LoansPage.render);
registerRoute("bills", BillsPage.render);
registerRoute("vendors", VendorsPage.render);
registerRoute("workers", WorkersPage.render);
registerRoute("budget", BudgetPage.render);
registerRoute("reports", ReportsPage.render);
registerRoute("settings", SettingsPage.render);
registerRoute("audit", AuditPage.render);
registerNotFound(DashboardPage.render);

const app = document.getElementById("app");
let shellBuilt = false;
let onlineHandlerBound = false;

function centerScreen(bodyHtml) {
  app.innerHTML = `<div class="center-screen"><div class="center-card">${bodyHtml}</div></div>`;
}

function renderLoading() {
  centerScreen(`
    <svg width="48" height="48" viewBox="0 0 40 40" fill="none" class="blueprint-mark" style="margin:0 auto 12px;">
      <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="1"/>
      <path d="M20 4v32M4 20h32" stroke="currentColor" stroke-width="1"/>
    </svg>
    <p class="text-sm text-concrete">${t("loading")}</p>
  `);
}

function renderLogin() {
  const configured = isFirebaseConfigured();
  centerScreen(`
    <svg width="64" height="64" viewBox="0 0 40 40" fill="none" class="blueprint-mark" style="margin:0 auto 20px;">
      <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="1"/>
      <path d="M20 4v32M4 20h32" stroke="currentColor" stroke-width="1"/>
      <circle cx="20" cy="20" r="4" stroke="currentColor" stroke-width="1.5"/>
    </svg>
    <h1 class="font-display" style="font-size:22px;font-weight:600;">${t("login_title")}</h1>
    <p class="text-sm text-concrete mt-2">${t("login_subtitle")}</p>
    ${!configured ? `<div class="mt-3" style="border:1px solid rgba(184,128,31,.3);background:var(--amber-light);color:var(--amber);border-radius:10px;padding:10px;font-size:12px;text-align:left;">Firebase isn't configured yet. Add your project credentials to <code>config.js</code> (see SETUP.md).</div>` : ""}
    <div id="login-error" class="field-error hidden mt-2"></div>
    <button id="signin-btn" class="btn btn-primary w-full mt-4" style="justify-content:center;" ${!configured ? "disabled" : ""}>${t("action_sign_in")}</button>
  `);
  const btn = document.getElementById("signin-btn");
  btn.addEventListener("click", async () => {
    const errEl = document.getElementById("login-error");
    errEl.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = t("loading");
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
      errEl.textContent = "Sign-in failed. Please try again.";
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = t("action_sign_in");
    }
  });
}

function renderAccessDenied() {
  const email = authStore.get().firebaseUser?.email || "";
  centerScreen(`
    <svg width="64" height="64" viewBox="0 0 40 40" fill="none" class="blueprint-mark" style="margin:0 auto 20px;">
      <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="1"/>
      <path d="M20 4v32M4 20h32" stroke="currentColor" stroke-width="1"/>
    </svg>
    <h1 class="font-display" style="font-size:19px;font-weight:600;">${t("access_denied_title")}</h1>
    <p class="text-sm text-concrete mt-2">${t("access_denied_body")}</p>
    ${email ? `<p class="font-ledger text-xs text-concrete mt-3">${escapeHtml(email)}</p>` : ""}
    <button id="signout-btn" class="btn btn-outline w-full mt-4" style="justify-content:center;">${t("action_sign_out")}</button>
  `);
  document.getElementById("signout-btn").addEventListener("click", () => logout());
}

function navLinkHtml(item, active) {
  return `<a href="#/${item.path}" class="nav-link ${active ? "active" : ""}" data-nav="${item.path}">${iconHtml(item.icon)}<span>${t(item.labelKey)}</span></a>`;
}

function buildShell() {
  const admin = isAdmin();
  const sidebarLinks = allNav.filter((i) => !i.adminOnly || admin).map((i) => navLinkHtml(i, false)).join("");
  const bottomLinks = primaryNav.map(
    (i) => `<a href="#/${i.path}" class="bottom-nav-item" data-bottom-nav="${i.path}">${iconHtml(i.icon)}<span>${t(i.labelKey)}</span></a>`
  ).join("");

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-logo">H</span>
          <span class="font-display" style="font-size:16px;font-weight:600;">${t("appName")}</span>
        </div>
        <nav aria-label="Primary">${sidebarLinks}</nav>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="topbar-offline hidden" id="offline-banner">${t("offline_banner")}</div>
          <div class="topbar-row">
            <h1 class="font-display" id="page-title" style="font-size:18px;font-weight:600;"></h1>
            <div class="flex items-center gap-2">
              <span id="wifi-off-icon" class="hidden" style="color:var(--amber);display:flex;">${iconHtml("wifiOff")}</span>
              <button id="lang-toggle" class="btn btn-outline btn-sm">${iconHtml("languages")}${getLocale() === "en" ? "മലയാളം" : "English"}</button>
              <div style="position:relative;">
                <button id="user-menu-btn" class="btn-icon" style="background:var(--blueprint-light);color:var(--blueprint-dark);font-family:var(--font-display);font-weight:600;" aria-haspopup="true">
                  ${(authStore.get().appUser?.displayName || "?")[0]?.toUpperCase() || "?"}
                </button>
                <div id="user-menu" class="hidden card" style="position:absolute;right:0;top:44px;width:200px;padding:6px;z-index:20;">
                  <div class="text-xs text-concrete" style="padding:6px 10px;">${escapeHtml(authStore.get().appUser?.email || "")}</div>
                  <button id="signout-menu-btn" class="btn btn-ghost w-full" style="justify-content:flex-start;color:var(--rust);">${iconHtml("logout")}${t("action_sign_out")}</button>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main class="content" id="page-content"></main>
      </div>
      <nav class="bottom-nav" aria-label="Primary">
        ${bottomLinks}
        <button id="more-nav-btn" class="bottom-nav-item">${iconHtml("menu")}<span>${t("nav_more")}</span></button>
      </nav>
    </div>
  `;

  document.getElementById("lang-toggle").addEventListener("click", () => setLocale(getLocale() === "en" ? "ml" : "en"));
  const userMenuBtn = document.getElementById("user-menu-btn");
  const userMenu = document.getElementById("user-menu");
  userMenuBtn.addEventListener("click", () => userMenu.classList.toggle("hidden"));
  bindSingleton(document, "click", "shell-user-menu-outside", (e) => {
    if (!userMenu.contains(e.target) && e.target !== userMenuBtn) userMenu.classList.add("hidden");
  });
  document.getElementById("signout-menu-btn").addEventListener("click", () => logout());

  document.getElementById("more-nav-btn").addEventListener("click", () => {
    const items = secondaryNav.filter((i) => !i.adminOnly || admin);
    const grid = items
      .map(
        (i) => `<a href="#/${i.path}" class="nav-link" style="flex-direction:column;text-align:center;gap:6px;border:1px solid var(--hairline);" data-more-nav="${i.path}">${iconHtml(i.icon)}<span style="font-size:11px;">${t(i.labelKey)}</span></a>`
      )
      .join("");
    const handle = openDialog({
      title: t("nav_more"),
      size: "sm",
      bodyHtml: `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${grid}</div>`,
    });
    handle.body.querySelectorAll("[data-more-nav]").forEach((a) => a.addEventListener("click", () => handle.close()));
  });

  if (!onlineHandlerBound) {
    onlineHandlerBound = true;
    const update = () => {
      const online = navigator.onLine;
      document.getElementById("offline-banner")?.classList.toggle("hidden", online);
      document.getElementById("wifi-off-icon")?.classList.toggle("hidden", online);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    setTimeout(update, 0);
  }
}

async function renderPage() {
  const path = currentPath();
  const item = allNav.find((i) => i.path === path);
  const titleEl = document.getElementById("page-title");
  if (titleEl) titleEl.textContent = item ? t(item.labelKey) : t("appName");

  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-nav") === path);
  });
  document.querySelectorAll("[data-bottom-nav]").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-bottom-nav") === path);
  });

  const container = document.getElementById("page-content");
  if (!container) return;
  container.innerHTML = `<p class="text-sm text-concrete">${t("loading")}</p>`;
  try {
    await renderRoute(container);
  } catch (err) {
    console.error("Page render failed", err);
    container.innerHTML = `<p class="text-sm" style="color:var(--rust);">Something went wrong loading this page. Check the console for details.</p>`;
  }
}

function renderApp() {
  const { status } = authStore.get();
  if (status === "loading") {
    shellBuilt = false;
    renderLoading();
  } else if (status === "signed_out") {
    shellBuilt = false;
    renderLogin();
  } else if (status === "unauthorized") {
    shellBuilt = false;
    renderAccessDenied();
  } else {
    buildShell();
    shellBuilt = true;
    renderPage();
  }
}

authStore.subscribe(renderApp);
onLocaleChange(() => {
  if (shellBuilt) {
    buildShell();
    renderPage();
  } else {
    renderApp();
  }
});
onRouteChange(() => {
  if (shellBuilt) renderPage();
});

initAuth();
renderApp();
