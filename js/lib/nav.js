export const primaryNav = [
  { path: "dashboard", labelKey: "nav_dashboard", icon: "dashboard" },
  { path: "transactions", labelKey: "nav_transactions", icon: "transactions" },
  { path: "budget", labelKey: "nav_budget", icon: "pie" },
];

export const secondaryNav = [
  { path: "accounts", labelKey: "nav_accounts", icon: "wallet" },
  { path: "loans", labelKey: "nav_loans", icon: "handCoins" },
  { path: "bills", labelKey: "nav_bills", icon: "receipt" },
  { path: "vendors", labelKey: "nav_vendors", icon: "store" },
  { path: "workers", labelKey: "nav_workers", icon: "hardHat" },
  { path: "reports", labelKey: "nav_reports", icon: "bar" },
  { path: "audit", labelKey: "nav_audit", icon: "history", adminOnly: true },
  { path: "settings", labelKey: "nav_settings", icon: "settings" },
];

export const allNav = [...primaryNav, ...secondaryNav];
