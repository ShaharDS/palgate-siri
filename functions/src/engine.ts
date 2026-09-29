import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { openPalgate } from "./palgate";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const LEASE_MS = 40_000;
const DEDUP_MS = 8_000; // one-tap paths: collapse a second open within this window
const TERMINAL = new Set(["idle", "succeeded", "failed", "uncertain", "canceled"]);

export interface OpenResult {
  status: string;        // succeeded | failed | uncertain | in-progress | <cached result>
  reason: string | null;
  dedup?: boolean;
  busy?: boolean;
  cached?: boolean;
}

export interface OpenParams {
  deviceId: string;
  sessionToken: string;
  phone: string;
  tokenType: number;
  requestedByName: string;         // display / audit label, e.g. the person's label "alex"
  executor: string;                // "cloud-function" | "http-shortcut"
  requestedByUid?: string | null;
  idempotencyKey?: string;         // generated per request when not supplied
  dedup?: boolean;                 // enable the recent-success dedup window
  sourceIp?: string | null;
}

/**
 * The single, shared "open the gate" engine. Enforces the four never-double-open invariants
 * (see docs/request-lifecycle.md): the dispatching transaction commits before the network call
 * (server-ack barrier), idempotency outlives terminal state (lastHandledRequestId), no HTTP
 * auto-retry (in openPalgate), and outcomes are classified by the before/after-send boundary.
 */
export async function performOpen(params: OpenParams): Promise<OpenResult> {
  const ref = db.doc("gate/state");
  const attemptId = randomUUID();
  const idempotencyKey = params.idempotencyKey ?? randomUUID();

  // Accidental double-tap guard for one-tap paths that don't send a stable key.
  if (params.dedup) {
    const snap = await ref.get();
    const d = (snap.exists ? snap.data() : {}) as Record<string, any>;
    const updatedMs = d.updatedAt && typeof d.updatedAt.toMillis === "function" ? d.updatedAt.toMillis() : 0;
    if (d.phase === "succeeded" && updatedMs && Date.now() - updatedMs < DEDUP_MS) {
      return { status: "succeeded", reason: null, dedup: true };
    }
  }

  // Claim + dispatch (single-flight + idempotency + server-ack barrier), all in one transaction.
  const decision = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = (snap.exists ? snap.data() : {}) as Record<string, any>;
    if (d.lastHandledRequestId === idempotencyKey) {
      return { kind: "cached" as const, result: (d.result as string | null) ?? null, reason: (d.failureReason as string | null) ?? null };
    }
    if (!TERMINAL.has((d.phase as string) ?? "idle")) return { kind: "busy" as const };
    tx.set(ref, {
      activeRequestId: idempotencyKey,
      idempotencyKey,
      phase: "dispatching",
      actionType: "OPEN_GATE",
      gateId: params.deviceId,
      attemptId,
      requestedByUid: params.requestedByUid ?? null,
      requestedByName: params.requestedByName,
      leaseStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      leaseDurationMs: LEASE_MS,
      result: null,
      failureReason: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { kind: "go" as const };
  });

  if (decision.kind === "cached") return { status: decision.result ?? "unknown", reason: decision.reason, cached: true };
  if (decision.kind === "busy") return { status: "in-progress", reason: null, busy: true };

  const outcome = await openPalgate(params.deviceId, params.sessionToken, params.phone, params.tokenType);
  const phase = outcome.kind === "success" ? "succeeded" : outcome.kind === "failure" ? "failed" : "uncertain";
  const reason = "reason" in outcome ? outcome.reason : null;

  // Resolve, fenced by attemptId so a reaped attempt can't clobber a newer one.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if ((snap.data()?.attemptId ?? null) !== attemptId) return;
    tx.set(ref, {
      phase, result: phase, failureReason: reason,
      lastHandledRequestId: idempotencyKey,
      attemptId: null, leaseStartedAt: null, leaseDurationMs: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  await db.collection("history").add({
    requestId: idempotencyKey, attemptId, phase, result: phase, failureReason: reason,
    requestedByUid: params.requestedByUid ?? null,
    requestedByName: params.requestedByName,
    sourceIp: params.sourceIp ?? null,
    executor: params.executor,
    at: admin.firestore.FieldValue.serverTimestamp(),
  }).catch(() => undefined);

  return { status: phase, reason };
}
