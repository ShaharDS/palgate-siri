import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/**
 * Recovers a request whose function died mid-call. Runs every minute.
 * The ONLY non-terminal state is `dispatching` (the engine claims and dispatches atomically).
 * A `dispatching` request whose lease has expired is resolved to
 * `uncertain` and is NEVER re-opened, because the open call may have reached PalGate.
 *
 * Uses server time (skew-free) and clears attemptId so a late write from the dead attempt is fenced out.
 */
export const leaseReaper = onSchedule({ schedule: "every 1 minutes", region: "me-west1" }, async () => {
  const ref = db.doc("gate/state");

  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) return;
    const d = snap.data() as Record<string, unknown>;
    if (d.phase !== "dispatching") return;

    const startedAt = d.leaseStartedAt as admin.firestore.Timestamp | undefined;
    const durationMs = (d.leaseDurationMs as number | undefined) ?? 0;
    if (!startedAt) return;
    if (Date.now() <= startedAt.toMillis() + durationMs) return; // not expired yet

    const requestId = (d.activeRequestId as string | undefined) ?? null;
    txn.set(ref, {
      phase: "uncertain",
      result: "uncertain",
      failureReason: "lease-expired",
      lastHandledRequestId: requestId,
      attemptId: null,
      leaseStartedAt: null,
      leaseDurationMs: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    db.collection("history").add({
      requestId,
      attemptId: (d.attemptId as string | undefined) ?? null,
      phase: "uncertain", result: "uncertain", failureReason: "lease-expired",
      executor: "reaper", at: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => undefined);
  });
});
