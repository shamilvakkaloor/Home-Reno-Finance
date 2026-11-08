export const typeIcon = {
  money_received: "down",
  transfer: "arrows",
  money_returned: "undo",
  expense: "up",
  adjustment: "settings",
};

const inflow = ["money_received"];
const outflow = ["expense"];

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
