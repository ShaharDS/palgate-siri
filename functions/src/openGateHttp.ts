import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { createHash, timingSafeEqual } from "crypto";
import { performOpen } from "./engine";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const SESSION_TOKEN = defineSecret("PALGATE_SESSION_TOKEN");
const PHONE = defineSecret("PALGATE_PHONE");
const TOKEN_TYPE = defineString("PALGATE_TOKEN_TYPE", { default: "1" });
const DEVICE_ID = defineString("PALGATE_DEVICE_ID");
// Initial SEED only. The live allowlist is the Firestore doc config/openGateSecrets (console-editable).
// On first request, if that doc is missing, it's created from this seed. After that, manage it in the console.
const OPEN_GATE_SECRETS = defineString("OPEN_GATE_SECRETS", { default: "[]" });
const REGION = "me-west1"; // Tel Aviv, next to PalGate's servers

interface SecretEntry { label: string; sha256: string; active: boolean; }

const SECRETS_DOC = "config/openGateSecrets";
let cache: { at: number; secrets: SecretEntry[] } | null = null;

function parseSeed(): SecretEntry[] {
  try {
    const arr = JSON.parse(OPEN_GATE_SECRETS.value());
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Live allowlist from Firestore (console-editable), cached per-instance ~60s. If the doc doesn't
 * exist yet, seed it once from the OPEN_GATE_SECRETS env param so it becomes editable in the console.
 * On any Firestore error, fall back to the env seed so the gate keeps working.
 */
async function loadSecrets(): Promise<SecretEntry[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.secrets;
  let secrets: SecretEntry[] = [];
  try {
    const ref = db.doc(SECRETS_DOC);
    const snap = await ref.get();
    if (snap.exists) {
      const d = snap.data() as Record<string, any>;
      secrets = Array.isArray(d?.secrets) ? d.secrets : [];
    } else {
      const seed = parseSeed();
      if (seed.length) {
        await ref.set({
          secrets: seed,
          seededFromEnv: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      secrets = seed;
    }
  } catch {
    secrets = parseSeed();
  }
  cache = { at: Date.now(), secrets };
  return secrets;
}

const sha256hex = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** Constant-time match of a presented secret against the active allowlist. Returns the label or null. */
function matchLabel(secret: string, list: SecretEntry[]): string | null {
  const presented = Buffer.from(sha256hex(secret), "hex");
  let found: string | null = null;
  for (const e of list) {
    if (!e || e.active !== true || typeof e.sha256 !== "string" || e.sha256.length !== 64) continue;
    let stored: Buffer;
    try { stored = Buffer.from(e.sha256, "hex"); } catch { continue; }
    if (stored.length === presented.length && timingSafeEqual(stored, presented)) found = e.label;
  }
  return found;
}

/**
 * The one-tap / Siri endpoint. Authenticated by a per-person bearer secret in the Authorization header,
 * checked against the console-managed Firestore allowlist. Returns 404 on any miss (non-enumerable).
 * On success it runs performOpen() from engine.ts, which enforces the never-double-open guarantees.
 */
export const openGateHttp = onRequest(
  { region: REGION, minInstances: 0, maxInstances: 3, memory: "256MiB", secrets: [SESSION_TOKEN, PHONE] },
  async (req, res) => {
    const auth = (req.get("authorization") || "").trim();
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    const secret = m ? m[1].trim() : "";
    if (!secret || secret.length > 512) { res.status(404).send("Not found"); return; }

    const label = matchLabel(secret, await loadSecrets());
    if (!label) { res.status(404).send("Not found"); return; }

    const ip = (req.get("x-forwarded-for") || req.ip || "").split(",")[0].trim() || null;
    const result = await performOpen({
      deviceId: DEVICE_ID.value(),
      sessionToken: SESSION_TOKEN.value(),
      phone: PHONE.value(),
      tokenType: parseInt(TOKEN_TYPE.value(), 10),
      requestedByName: label,
      executor: "http-shortcut",
      dedup: true,
      sourceIp: ip,
    });

    res.status(200).json({ status: result.status, reason: result.reason ?? null });
  },
);
