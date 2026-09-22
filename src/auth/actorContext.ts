import type { Scope } from "./scopes.js";

/**
 * The server-side identity behind a session. Built once, from a verified
 * credential, and never reconstructed from tool arguments.
 *
 * The `token` (the underlying Magento bearer used for GraphQL calls) is a
 * credential: it stays on the server and is never serialized to the model.
 * Use `safeView()` whenever a context needs to be described back to a client.
 */
export interface ActorContext {
  /** Opaque session handle given to the client; not a credential itself. */
  sessionId: string;
  /** Authenticated customer id. */
  customerId: number;
  /** Company the token is scoped to, or null for a non-company customer. */
  companyId: number | null;
  /** The member's role id within the company, when applicable. */
  roleId: number | null;
  /** Scopes this token carries — the ceiling on what the agent may do. */
  scopes: Scope[];
  /** Underlying bearer for downstream Magento calls. Server-side only. */
  token: string;
  /** Absolute expiry (epoch ms). After this the context is invalid. */
  expiresAt: number;
  /** How the context was obtained — for auditing. */
  via: string;
}

/** The client-safe projection of a context: everything except the credential. */
export interface ActorContextView {
  session_id: string;
  customer_id: number;
  company_id: number | null;
  role_id: number | null;
  scopes: Scope[];
  expires_at: string;
  via: string;
}

export function safeView(ctx: ActorContext): ActorContextView {
  return {
    session_id: ctx.sessionId,
    customer_id: ctx.customerId,
    company_id: ctx.companyId,
    role_id: ctx.roleId,
    scopes: ctx.scopes,
    expires_at: new Date(ctx.expiresAt).toISOString(),
    via: ctx.via,
  };
}

export function isExpired(ctx: ActorContext, now = Date.now()): boolean {
  return now >= ctx.expiresAt;
}
