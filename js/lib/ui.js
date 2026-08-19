import { iconHtml } from "./icons.js";
import { escapeHtml } from "./format.js";

/* ---------------- Toasts ---------------- */
let toastRoot = null;
function ensureToastRoot() {
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.className = "toast-stack";
    document.body.appendChild(toastRoot);
  }
  return toastRoot;
}

const toastIcon = { success: "check", error: "xcircle", info: "alert" };

export function toast(kind, message) {
  const root = ensureToastRoot();
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", "status");
  el.innerHTML = `${iconHtml(toastIcon[kind] || "alert")}<span>${escapeHtml(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ---------------- Dialog ---------------- */
let dialogStack = [];

export function openDialog({ title, size = "md", bodyHtml, onMount, onClose }) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  overlay.innerHTML = `
    <div class="dialog ${size === "sm" ? "sm" : size === "lg" ? "lg" : ""}" role="dialog" aria-modal="true">
      <div class="dialog-head">
        <h2 class="dialog-title">${escapeHtml(title)}</h2>
        <button type="button" class="btn-icon" data-dialog-close aria-label="Close dialog">${iconHtml("x")}</button>
      </div>
      <div data-dialog-body>${bodyHtml || ""}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    dialogStack = dialogStack.filter((d) => d !== handle);
    if (dialogStack.length === 0) document.body.style.overflow = "";
    if (onClose) onClose();
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector("[data-dialog-close]").addEventListener("click", close);
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  const handle = { close, el: overlay, body: overlay.querySelector("[data-dialog-body]") };
  dialogStack.push(handle);

  if (onMount) onMount(handle.body, close);
  return handle;
}

/* ---------------- Small builders ---------------- */
export function emptyState(title, body = "", actionHtml = "") {
  return `
    <div class="empty-state" role="status">
      <svg class="blueprint-mark" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="1"/>
        <path d="M20 4v32M4 20h32" stroke="currentColor" stroke-width="1"/>
        <circle cx="20" cy="20" r="4" stroke="currentColor" stroke-width="1.5"/>
      </svg>
      <h3 class="empty-title">${escapeHtml(title)}</h3>
      ${body ? `<p class="empty-body">${escapeHtml(body)}</p>` : ""}
      ${actionHtml}
    </div>`;
}

export function skeletonList(rows = 5) {
  let html = '<div aria-busy="true" aria-label="Loading">';
  for (let i = 0; i < rows; i++) {
    html += `
      <div class="flex items-center gap-3" style="padding:10px 0;">
        <div class="skeleton" style="width:36px;height:36px;border-radius:999px;"></div>
        <div class="flex-col gap-2" style="flex:1;">
          <div class="skeleton" style="height:12px;width:60%;"></div>
          <div class="skeleton" style="height:10px;width:30%;"></div>
        </div>
        <div class="skeleton" style="height:14px;width:56px;"></div>
      </div>`;
  }
  html += "</div>";
  return html;
}

export function badge(text, tone = "neutral") {
  return `<span class="badge badge-${tone}">${escapeHtml(text)}</span>`;
}

export function iconCircle(iconName, tone = "blueprint") {
  return `<span class="icon-circle tone-${tone}">${iconHtml(iconName)}</span>`;
}

export function statCard(label, value, iconName, tone = "ink", sub = "") {
  return `
    <div class="stat-card">
      <div class="flex items-center justify-between">
        <p class="stat-label">${escapeHtml(label)}</p>
        ${iconName ? `<span class="stat-icon tone-${tone}">${iconHtml(iconName)}</span>` : ""}
      </div>
      <p class="stat-value font-ledger">${value}</p>
      ${sub ? `<p class="stat-sub">${escapeHtml(sub)}</p>` : ""}
    </div>`;
}

/** Binds a listener on `target`, first removing any previously-bound listener
 *  registered under the same `key`. Use this for "click outside to close"
 *  handlers on document/window that would otherwise be re-registered (and
 *  stack up) every time a page repaints. */
const singletonHandlers = new Map();
export function bindSingleton(target, event, key, handler) {
  const existing = singletonHandlers.get(key);
  if (existing) target.removeEventListener(event, existing);
  target.addEventListener(event, handler);
  singletonHandlers.set(key, handler);
}

/** Binds a click handler on `container` for elements matching `selector`,
 *  using event delegation (works for content that's re-rendered often). */
export function on(container, selector, event, handler) {
  container.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && container.contains(target)) handler(e, target);
  });
}
