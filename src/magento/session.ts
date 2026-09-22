import { SessionStore } from "../auth/sessionStore.js";
import { DEV_DEFAULT_SCOPES } from "../auth/scopes.js";

/**
 * The server's session layer. Backward-compatible surface (`storeToken`,
 * `getToken`, `authHeaders`) over the scoped `SessionStore` from `../auth`, so
 * the whole server now gets expiry + revocation + a scoped actor context
 * without any tool having to change.
 *
 * `storeToken` is the dev/legacy path: it wraps a raw customer bearer in a
 * read-only-scoped context. The delegated (OAuth) path stores a richer context
 * directly via `sessionStore()`.
 */
const store = new SessionStore();

/** Legacy sessions live a day; delegated tokens set their own (shorter) expiry. */
const LEGACY_TTL_MS = 24 * 60 * 60 * 1000;

/** The shared store, for the delegated-auth wiring to use directly. */
export function sessionStore(): SessionStore {
  return store;
}

export async function storeToken(token: string): Promise<string> {
  return store.store({
    customerId: 0,
    companyId: null,
    roleId: null,
    scopes: [...DEV_DEFAULT_SCOPES],
    token,
    expiresAt: Date.now() + LEGACY_TTL_MS,
    via: "legacy-password",
  });
}

export async function getToken(sessionId: string): Promise<string> {
  try {
    return (await store.resolve(sessionId)).token;
  } catch {
    throw new Error(
      "Unknown or expired session_id. Call `login` again to obtain a new one.",
    );
  }
}

export async function authHeaders(
  sessionId: string,
): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getToken(sessionId)}` };
}

/** Revoke a session immediately; a later call with this id fails. */
export async function revokeSession(sessionId: string): Promise<boolean> {
  try {
    await store.resolve(sessionId);
  } catch {
    return false;
  }
  await store.revoke(sessionId);
  return true;
}
