import { collection, doc } from "./fs.js";
import { getDb } from "./firebase.js";

export { getDb };

export const col = (name) => collection(getDb(), name);
export const docIn = (name, id) => doc(getDb(), name, id);

export const usersCol = () => col("users");
export const userDoc = (id) => docIn("users", id);

export const accountsCol = () => col("accounts");
export const accountDoc = (id) => docIn("accounts", id);

export const transactionsCol = () => col("transactions");
export const transactionDoc = (id) => docIn("transactions", id);

export const categoriesCol = () => col("categories");
export const categoryDoc = (id) => docIn("categories", id);

export const sourcesCol = () => col("moneySources");
export const sourceDoc = (id) => docIn("moneySources", id);

export const vendorsCol = () => col("vendors");
export const vendorDoc = (id) => docIn("vendors", id);

export const loansCol = () => col("loans");
export const loanDoc = (id) => docIn("loans", id);

export const billsCol = () => col("bills");
export const billDoc = (id) => docIn("bills", id);

export const workersCol = () => col("workers");
export const workerDoc = (id) => docIn("workers", id);

export const workRecordsCol = () => col("workerWorkRecords");
export const workRecordDoc = (id) => docIn("workerWorkRecords", id);

export const categoryBudgetsCol = () => col("categoryBudgets");
export const categoryBudgetDoc = (categoryId) => docIn("categoryBudgets", categoryId);

export const phasesCol = () => col("phases");
export const phaseDoc = (id) => docIn("phases", id);

export const auditLogCol = () => col("auditLogs");

export const invitesCol = () => col("invites");
export const inviteDoc = (email) => docIn("invites", email.trim().toLowerCase());

export const settingsDoc = () => docIn("settings", "project");
export const bootstrapDoc = () => docIn("settings", "bootstrap");
