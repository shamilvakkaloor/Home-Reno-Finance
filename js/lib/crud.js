import { addDoc, updateDoc, deleteDoc, serverTimestamp } from "./fs.js";
import { auditLogCol } from "./collections.js";

/** Writes an audit log entry. Errors are logged, not thrown, so a failed
 *  audit write never blocks the financial write that already succeeded. */
export async function writeAudit(entityType, entityId, action, actor, beforeData, afterData) {
  try {
    await addDoc(auditLogCol(), {
      entityType,
      entityId,
      action,
      performedBy: actor.uid,
      performedByName: actor.displayName,
      performedAt: serverTimestamp(),
      beforeData: beforeData ?? null,
      afterData: afterData ?? null,
      metadata: {
        source: "web",
        device: typeof navigator !== "undefined" ? navigator.userAgent : "",
      },
    });
  } catch (err) {
    console.error("Failed to write audit log", entityType, entityId, err);
  }
}

/** Creates a document, stamping createdBy/createdAt, and writes an audit entry. */
export async function createWithAudit(colRef, entityType, data, actor) {
  const payload = { ...data, createdBy: actor.uid, createdAt: serverTimestamp() };
  const ref = await addDoc(colRef, payload);
  await writeAudit(entityType, ref.id, "create", actor, undefined, data);
  return ref.id;
}

/** Updates a document, stamping updatedBy/updatedAt, and writes an audit entry. */
export async function updateWithAudit(docRef, entityType, before, changes, actor) {
  const payload = { ...changes, updatedBy: actor.uid, updatedAt: serverTimestamp() };
  await updateDoc(docRef, payload);
  await writeAudit(entityType, docRef.id, "update", actor, before, changes);
}

/** Soft-deletes: sets status=deleted, never removes the document. */
export async function softDeleteWithAudit(docRef, entityType, actor) {
  await updateDoc(docRef, { status: "deleted", deletedBy: actor.uid, deletedAt: serverTimestamp() });
  await writeAudit(entityType, docRef.id, "delete", actor);
}

/** Restores a soft-deleted document. */
export async function restoreWithAudit(docRef, entityType, actor) {
  await updateDoc(docRef, { status: "active", deletedBy: null, deletedAt: null });
  await writeAudit(entityType, docRef.id, "restore", actor);
}

/** Hard-deletes a document and writes an audit entry. Only for reference/
 *  taxonomy data (categories, sources, vendors, workers) — never for
 *  transactions or other financial ledger records, which must stay
 *  soft-deletable/restorable for audit purposes. */
export async function hardDeleteWithAudit(docRef, entityType, before, actor) {
  await deleteDoc(docRef);
  await writeAudit(entityType, docRef.id, "delete", actor, before);
}
