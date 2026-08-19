export const typeIcon = {
  money_received: "down",
  loan_received: "handCoins",
  transfer: "arrows",
  money_returned: "undo",
  expense: "up",
  loan_repayment: "handCoins",
  bill_payment: "receipt",
  adjustment: "settings",
};

const inflow = ["money_received", "loan_received"];
const outflow = ["expense", "loan_repayment", "bill_payment"];

export function amountSign(type) {
  if (inflow.includes(type)) return "+";
  if (outflow.includes(type)) return "-";
  return "±";
}

export function amountTone(type) {
  if (inflow.includes(type)) return "green";
  if (outflow.includes(type)) return "rust";
  return "blueprint";
}
