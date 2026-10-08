/**
 * Ledger-first balance engine.
 * Current Balance = Opening Balance + all valid incoming movements
 *                                    - all valid outgoing movements
 * Deleted transactions (status "deleted") are excluded. Restoring one
 * brings it back automatically because this recomputes from the live set.
 */
export function computeAccountBalances(accounts, transactions) {
  const active = transactions.filter((t) => t.status === "active");
  const movement = {};
  const bump = (accountId, inflow, outflow) => {
    if (!accountId) return;
    if (!movement[accountId]) movement[accountId] = { inflow: 0, outflow: 0 };
    movement[accountId].inflow += inflow;
    movement[accountId].outflow += outflow;
  };

  for (const t of active) {
    switch (t.type) {
      case "money_received":
      case "loan_received":
        bump(t.accountId, t.amount, 0);
        break;
      case "expense":
      case "loan_repayment":
      case "bill_payment":
        bump(t.accountId, 0, t.amount);
        break;
      case "money_returned":
      case "transfer":
        bump(t.fromAccountId, 0, t.amount);
        bump(t.toAccountId, t.amount, 0);
        break;
      case "adjustment":
        if (t.amount >= 0) bump(t.accountId, t.amount, 0);
        else bump(t.accountId, 0, Math.abs(t.amount));
        break;
    }
  }

  return accounts.map((acc) => {
    const m = movement[acc.id] ?? { inflow: 0, outflow: 0 };
    return {
      accountId: acc.id,
      accountName: acc.name,
      openingBalance: acc.openingBalance,
      inflow: m.inflow,
      outflow: m.outflow,
      currentBalance: acc.openingBalance + m.inflow - m.outflow,
    };
  });
}

export function totalHeld(balances) {
  return balances.reduce((sum, b) => sum + b.currentBalance, 0);
}

export function totalReceived(transactions, accounts = []) {
  const initialFund = accounts.reduce((sum, account) => sum + (account.openingBalance ?? 0), 0);
  return transactions
    .filter((t) => t.status === "active" && (t.type === "money_received" || t.type === "loan_received"))
    .reduce((sum, t) => sum + t.amount, initialFund);
}

export function totalExpenses(transactions) {
  return transactions
    .filter((t) => t.status === "active" && (t.type === "expense" || t.type === "bill_payment"))
    .reduce((sum, t) => sum + t.amount, 0);
}

export function reconcile(accounts, transactions) {
  const balances = computeAccountBalances(accounts, transactions);
  const held = totalHeld(balances);
  const active = transactions.filter((t) => t.status === "active");
  const received = active
    .filter((t) => t.type === "money_received" || t.type === "loan_received")
    .reduce((s, t) => s + t.amount, 0);
  const spent = active
    .filter((t) => t.type === "expense" || t.type === "bill_payment")
    .reduce((s, t) => s + t.amount, 0);
  const loanRepaid = active
    .filter((t) => t.type === "loan_repayment")
    .reduce((s, t) => s + t.amount, 0);
  // Adjustments move money in/out of an account directly (see
  // computeAccountBalances above), so they must be folded into the expected
  // total too — otherwise every adjustment shows up as permanent "drift".
  const adjusted = active
    .filter((t) => t.type === "adjustment")
    .reduce((s, t) => s + t.amount, 0);
  const openingSum = accounts.reduce((s, a) => s + a.openingBalance, 0);
  const expected = openingSum + received - spent - loanRepaid + adjusted;
  const drift = Math.round((held - expected) * 100) / 100;
  return { held, expected, drift, balanced: Math.abs(drift) < 0.01 };
}
