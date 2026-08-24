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
  el.innerHTML = `<span>${escapeHtml(message)}</span>${iconHtml(toastIcon[kind] || "alert")}`;
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
      <div class="dialog-grabber" aria-hidden="true"></div>
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
      <svg class="blueprint-mark" width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <circle cx="20" cy="20" r="17" stroke="currentColor" stroke-width="1.2"/>
        <path d="M20 3v8M20 29v8M3 20h8M29 20h8" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      <h3 class="empty-title">${escapeHtml(title)}</h3>
      ${body ? `<p class="empty-body">${escapeHtml(body)}</p>` : ""}
      ${actionHtml}
    </div>`;
}

export function skeletonList(rows = 5) {
  const widths = [60, 48, 55, 42, 52];
  let html = '<div aria-busy="true" aria-label="Loading">';
  for (let i = 0; i < rows; i++) {
    html += `
      <div class="flex items-center gap-3" style="padding:8px 0;">
        <div class="skeleton" style="width:36px;height:36px;"></div>
        <div class="flex-col gap-2" style="flex:1;">
          <div class="skeleton" style="height:10px;width:${widths[i % widths.length]}%;"></div>
          <div class="skeleton skeleton-soft" style="height:8px;width:${widths[i % widths.length] - 18}%;"></div>
        </div>
        <div class="skeleton" style="height:12px;width:70px;"></div>
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

/** Maps a tone name to the dot colour used in the stat-card head. */
const toneVar = {
  green: "var(--green)", rust: "var(--rust)", amber: "var(--amber)",
  brass: "var(--brass)", blueprint: "var(--blueprint)", ink: "var(--blueprint)",
};

/**
 * A headline figure: a small coloured dot + mono label above a large tabular
 * amount. `value` is trusted HTML (pass `moneyHtml(...)`), everything else is
 * escaped. `tone` colours both the dot and the figure.
 */
export function statCard(label, value, tone = "ink", sub = "") {
  const toneClass = ["green", "rust", "brass", "amber"].includes(tone) ? ` stat-${tone}` : "";
  return `
    <div class="stat-card${toneClass}">
      <div class="stat-head">
        <span class="stat-dot" style="background:${toneVar[tone] || toneVar.ink};"></span>
        <span class="stat-label">${escapeHtml(label)}</span>
      </div>
      <p class="stat-value">${value}</p>
      ${sub ? `<p class="stat-sub">${escapeHtml(sub)}</p>` : ""}
    </div>`;
}

/**
 * The single saturated field on a screen — a navy slab carrying the one number
 * the page is really about. `value` is trusted HTML; `chip` is the small
 * translucent caption underneath.
 */
export function heroCard(label, value, chip = "") {
  return `
    <div class="hero-card">
      <div class="hero-label">${escapeHtml(label)}</div>
      <div class="hero-value">${value}</div>
      ${chip ? `<div class="hero-chip">${escapeHtml(chip)}</div>` : ""}
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
