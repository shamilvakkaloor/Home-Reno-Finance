import { Timestamp } from "./fs.js";

const inrFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatINR(amount) {
  return inrFormatter.format(amount || 0);
}

/**
 * Same figure as `formatINR`, but as HTML with the ₹ symbol and any leading
 * sign wrapped so CSS can set them one step smaller and lighter than the
 * digits. Display only — anything that ends up in a CSV or a text field
 * should keep using `formatINR`.
 */
export function moneyHtml(amount, sign = "") {
  const str = formatINR(amount);
  const i = str.indexOf("₹");
  const signHtml = sign ? `<span class="money-sign">${sign}</span>` : "";
  if (i === -1) return signHtml + escapeHtml(str);
  return `${signHtml}<span class="money-sym">₹</span>${escapeHtml(str.slice(i + 1))}`;
}

export function toJsDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === "function") return ts.toDate();
  return new Date(ts);
}

export function formatDate(ts, locale = "en") {
  const date = toJsDate(ts);
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale === "ml" ? "ml-IN" : "en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function toDateInputValue(ts) {
  const date = ts ? toJsDate(ts) : new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export function dateInputToTimestamp(value) {
  return Timestamp.fromDate(new Date(`${value}T12:00:00`));
}

export function startOfPeriod(period) {
  const now = new Date();
  if (period === "this_month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "last_month") return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  if (period === "this_year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

export function endOfPeriod(period) {
  const now = new Date();
  if (period === "this_month") return now;
  if (period === "last_month") return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  if (period === "this_year") return now;
  return null;
}

export function periodRange(value) {
  switch (value.period) {
    case "this_month":
      return { from: startOfPeriod("this_month"), to: endOfPeriod("this_month") };
    case "last_month":
      return { from: startOfPeriod("last_month"), to: endOfPeriod("last_month") };
    case "this_year":
      return { from: startOfPeriod("this_year"), to: endOfPeriod("this_year") };
    case "custom":
      return {
        from: value.customFrom ? new Date(`${value.customFrom}T00:00:00`) : undefined,
        to: value.customTo ? new Date(`${value.customTo}T23:59:59`) : undefined,
      };
    default:
      return {};
  }
}

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
