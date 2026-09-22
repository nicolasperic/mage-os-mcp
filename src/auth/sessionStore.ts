import { randomUUID } from "node:crypto";
import {
  isExpired,
  type ActorContext,
} from "./actorContext.js";
import { requireScope, type Scope } from "./scopes.js";

/**
 * Holds active actor contexts by opaque session id.
 *
 * This is the delegated-auth successor to the old `session_id -> bearer token`
 * map: it stores a full scoped context, honors expiry, and supports explicit
 * revocation. It is still an in-memory store for now — a real deployment
 * externalizes this so it survives restarts and spans workers, and so that no
 * worker ever reuses a prior actor's context. That swap happens behind this
 * same interface.
 */
export class SessionStore {
  private readonly contexts = new Map<string, ActorContext>();

  /** Store a context (assigning a session id if it has none) and return the id. */
  store(context: Omit<ActorContext, "sessionId"> & { sessionId?: string }): string {
    const sessionId = context.sessionId ?? randomUUID();
    this.contexts.set(sessionId, { ...context, sessionId });
    return sessionId;
  }

  /**
   * Resolve a live context, or throw. Expired contexts are evicted and treated
   * as unknown, so a stale or revoked session dies at its next call.
   */
  resolve(sessionId: string, now = Date.now()): ActorContext {
    const context = this.contexts.get(sessionId);
    if (!context) {
      throw new SessionError(
        "Unknown or expired session. Authenticate again to obtain a new one.",
      );
    }
    if (isExpired(context, now)) {
      this.contexts.delete(sessionId);
      throw new SessionError(
        "This session has expired. Authenticate again to obtain a new one.",
      );
    }
    return context;
  }

  /** Resolve a context and assert it carries the required scope. */
  resolveWithScope(sessionId: string, scope: Scope, now = Date.now()): ActorContext {
    const context = this.resolve(sessionId, now);
    requireScope(context.scopes, scope);
    return context;
  }

  /** Revoke a session immediately (buyer or company admin action). */
  revoke(sessionId: string): void {
    this.contexts.delete(sessionId);
  }

  /** Test/introspection helper. */
  size(): number {
    return this.contexts.size;
  }
}

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}
