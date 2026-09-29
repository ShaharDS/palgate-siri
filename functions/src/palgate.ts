import { generateToken } from "./palgateToken";

/** Trust-aware outcome. The state machine only ever sees these three. */
export type OpenOutcome =
  | { kind: "success" }
  | { kind: "failure"; reason: string } // provably not opened; safe to retry manually
  | { kind: "uncertain"; reason: string }; // never auto-retry

const BASE_URL = "https://api1.pal-es.com/v1/bt";
const USER_AGENT = "BlueGate/115 CFNetwork/1128.0.1 Darwin/19.6.0";

function isTruthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0 && v !== "0" && v !== "false";
  return true;
}

/**
 * Open the gate. No auto-retry. Outcome classified by the before/after-send boundary:
 * only errors that prove the request never left (DNS / connection refused) are `failure`;
 * anything ambiguous (timeout, 5xx, unparseable) is `uncertain`. Success requires a positive
 * marker: HTTP 2xx with no `err`, and `confirmed !== false`.
 */
export async function openPalgate(
  deviceId: string,
  sessionToken: string,
  phone: string,
  tokenType: number,
): Promise<OpenOutcome> {
  let derived: string;
  try {
    derived = generateToken(sessionToken, phone, tokenType);
  } catch {
    return { kind: "failure", reason: "token-invalid" };
  }

  const url = `${BASE_URL}/device/${encodeURIComponent(deviceId)}/open-gate?openBy=100&outputNum=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { "x-bt-token": derived, "User-Agent": USER_AGENT, Accept: "*/*" },
      signal: controller.signal,
      // Node fetch does not auto-retry; keep it that way (invariant #3).
    });

    if (resp.status === 401 || resp.status === 403) return { kind: "failure", reason: "token-invalid" };
    if (resp.status >= 400 && resp.status < 500) return { kind: "failure", reason: "http-4xx" };
    if (resp.status >= 500) return { kind: "uncertain", reason: "http-5xx" };
    if (resp.status < 200 || resp.status >= 300) return { kind: "uncertain", reason: "unparseable-response" };

    let body: Record<string, unknown>;
    try {
      body = (await resp.json()) as Record<string, unknown>;
    } catch {
      return { kind: "uncertain", reason: "api-schema-changed" };
    }
    if (isTruthy(body.err)) return { kind: "failure", reason: "api-error" }; // e.g. no permission
    if (body.confirmed === false) return { kind: "uncertain", reason: "not-confirmed" };
    return { kind: "success" }; // confirmed===true, or err-falsy without an explicit confirm field
  } catch (e: unknown) {
    const err = e as { name?: string; cause?: { code?: string } };
    if (err.name === "AbortError") return { kind: "uncertain", reason: "network-after-send" };
    const code = err.cause?.code;
    if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNREFUSED") {
      return { kind: "failure", reason: "network-before-send" }; // provably not sent
    }
    return { kind: "uncertain", reason: "network-after-send" };
  } finally {
    clearTimeout(timer);
  }
}
