import { t } from "../lib/i18n.js";
import { escapeHtml } from "../lib/format.js";

const OPTIONS = [
  { key: "all_time", labelKey: "filter_all_time" },
  { key: "this_month", labelKey: "filter_this_month" },
  { key: "last_month", labelKey: "filter_last_month" },
  { key: "this_year", labelKey: "filter_this_year" },
  { key: "custom", labelKey: "filter_custom" },
];

export function periodFilterHtml(value, idPrefix = "pf") {
  const pills = OPTIONS.map(
    (o) => `<button type="button" class="pill ${value.period === o.key ? "active" : ""}" data-period="${o.key}">${escapeHtml(t(o.labelKey))}</button>`
  ).join("");
  const customRow =
    value.period === "custom"
      ? `<div class="flex gap-2 mt-2">
          <input type="date" class="input" id="${idPrefix}-from" value="${value.customFrom || ""}" aria-label="From date" />
          <input type="date" class="input" id="${idPrefix}-to" value="${value.customTo || ""}" aria-label="To date" />
        </div>`
      : "";
  return `<div id="${idPrefix}-wrap"><div class="pill-row" role="tablist">${pills}</div>${customRow}</div>`;
}

export function wirePeriodFilter(container, value, onChange, idPrefix = "pf") {
  const wrap = container.querySelector(`#${idPrefix}-wrap`);
  if (!wrap) return;
  wrap.querySelectorAll("[data-period]").forEach((btn) => {
    btn.addEventListener("click", () => onChange({ ...value, period: btn.getAttribute("data-period") }));
  });
  const from = wrap.querySelector(`#${idPrefix}-from`);
  const to = wrap.querySelector(`#${idPrefix}-to`);
  if (from) from.addEventListener("change", () => onChange({ ...value, customFrom: from.value }));
  if (to) to.addEventListener("change", () => onChange({ ...value, customTo: to.value }));
}

export function periodRange(value) {
  const now = new Date();
  switch (value.period) {
    case "this_month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case "last_month":
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    case "this_year":
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    case "custom":
      return {
        from: value.customFrom ? new Date(`${value.customFrom}T00:00:00`) : undefined,
        to: value.customTo ? new Date(`${value.customTo}T23:59:59`) : undefined,
      };
    default:
      return {};
  }
}
