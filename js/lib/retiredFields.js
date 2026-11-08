import { getDocs, writeBatch, deleteField } from "./fs.js";
import { transactionsCol, getDb } from "./collections.js";

/** Omit the retired payer selector while retaining createdBy/updatedBy audit attribution. */
export function withoutPaidBy(data) {
  if (!data) return data;
  const { paidByUserId, ...remaining } = data;
  return remaining;
}

let cleanup;
/** Idempotent, field-only cleanup, including soft-deleted transactions. */
export function removePaidByFromTransactions() {
  if (!cleanup) cleanup = cleanTransactions().catch((error) => {
    cleanup = undefined;
    throw error;
  });
  return cleanup;
}

async function cleanTransactions() {
  const snapshot = await getDocs(transactionsCol());
  const affected = snapshot.docs.filter((doc) => Object.hasOwn(doc.data(), "paidByUserId"));
  for (let offset = 0; offset < affected.length; offset += 400) {
    const batch = writeBatch(getDb());
    for (const doc of affected.slice(offset, offset + 400)) {
      batch.update(doc.ref, { paidByUserId: deleteField() });
    }
    await batch.commit();
  }
  console.info(`Paid by cleanup complete: ${affected.length} transaction records cleaned.`);
  return affected.length;
}
