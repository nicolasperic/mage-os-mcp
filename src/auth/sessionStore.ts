import { randomUUID } from "node:crypto";
import { isExpired, type ActorContext } from "./actorContext.js";
import { requireScope, type Scope } from "./scopes.js";
import { InMemoryRepository, type Repository } from "./persistence.js";

/**
 * Holds active actor contexts by opaque session id.
 *
 * The delegated-auth successor to the old `session_id -> bearer token` map: it
 * stores a full scoped context, honors expiry, and supports revocation. Raw
 * storage is delegated to a `Repository` (in-memory by default), so a real
 * deployment externalizes it — surviving restarts and spanning workers — behind
 * this same interface, and no worker ever reuses a prior actor's context.
 */
export class SessionStore {
  constructor(
    private readonly repo: Repository<ActorContext> = new InMemoryRepository<ActorContext>(),
  ) {}

  /** Store a context (assigning a session id if it has none) and return the id. */
  async store(
    context: Omit<ActorContext, "sessionId"> & { sessionId?: string },
  ): Promise<string> {
    const sessionId = context.sessionId ?? randomUUID();
    await this.repo.set(sessionId, { ...context, sessionId });
    return sessionId;
  }

  /**
   * Resolve a live context, or throw. Expired contexts are evicted and treated
   * as unknown, so a stale or revoked session dies at its next call.
   */
  async resolve(sessionId: string, now = Date.now()): Promise<ActorContext> {
    const context = await this.repo.get(sessionId);
    if (!context) {
      throw new SessionError(
        "Unknown or expired session. Authenticate again to obtain a new one.",
      );
    }
    if (isExpired(context, now)) {
      await this.repo.delete(sessionId);
      throw new SessionError(
        "This session has expired. Authenticate again to obtain a new one.",
      );
    }
    return context;
  }

  /** Resolve a context and assert it carries the required scope. */
  async resolveWithScope(
    sessionId: string,
    scope: Scope,
    now = Date.now(),
  ): Promise<ActorContext> {
    const context = await this.resolve(sessionId, now);
    requireScope(context.scopes, scope);
    return context;
  }

  /** Revoke a session immediately (buyer or company admin action). */
  async revoke(sessionId: string): Promise<void> {
    await this.repo.delete(sessionId);
  }

  /** Test/introspection helper. */
  async size(): Promise<number> {
    return this.repo.count();
  }
}

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}
