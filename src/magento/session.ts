import { randomUUID } from "node:crypto";

/**
 * In-memory map of opaque session id -> Magento customer bearer token.
 *
 * The raw token (a credential) is deliberately kept here on the server and
 * never returned to the MCP client / model. Tools that need authentication
 * take a `session_id` and we look up the token to build the auth header.
 *
 * State lives only for the lifetime of the server process; if it restarts,
 * clients simply log in again.
 */
const tokens = new Map<string, string>();

export function storeToken(token: string): string {
  const sessionId = randomUUID();
  tokens.set(sessionId, token);
  return sessionId;
}

export function getToken(sessionId: string): string {
  const token = tokens.get(sessionId);
  if (!token) {
    throw new Error(
      "Unknown or expired session_id. Call `login` again to obtain a new one.",
    );
  }
  return token;
}

export function authHeaders(sessionId: string): Record<string, string> {
  return { Authorization: `Bearer ${getToken(sessionId)}` };
}
