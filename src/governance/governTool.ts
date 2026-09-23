import { randomUUID } from "node:crypto";
import type { AuditEvent, AuditSink } from "./audit.js";
import { redactArgs } from "./redact.js";
import { sessionStore } from "../magento/session.js";
import type { Scope } from "../auth/scopes.js";

/**
 * The governance wrapper: it surrounds every MCP tool call with a server-side
 * audit record — resolved actor, redacted input, outcome, timing, correlation
 * id — without any tool having to change. `installGovernance` applies it to a
 * whole server in one call.
 *
 * Actor resolution is injectable so other deployments (e.g. lp-mcp) can plug in
 * their own identity source; the default reads the session store.
 */
export interface Actor {
  type: "customer" | "anonymous";
  customerId?: number;
  companyId?: number | null;
  roleId?: number | null;
  scopes?: string[];
}

export type ActorResolver = (args: Record<string, unknown>) => Promise<Actor>;

/** Default: resolve the actor from a `session_id` argument, if present & live. */
export const defaultResolveActor: ActorResolver = async (args) => {
  const sid = args?.session_id;
  if (typeof sid === "string" && sid) {
    try {
      const ctx = await sessionStore().resolve(sid);
      return {
        type: "customer",
        customerId: ctx.customerId,
        companyId: ctx.companyId,
        roleId: ctx.roleId,
        scopes: ctx.scopes,
      };
    } catch {
      // Unknown/expired session → the call itself will fail; audit as anonymous.
    }
  }
  return { type: "anonymous" };
};

export interface GovernanceOptions {
  sink: AuditSink;
  resolveActor?: ActorResolver;
  /** Per-tool required scope. A call to a listed tool must resolve a session
   *  that carries the scope, or it's denied (and the denial is audited). */
  toolScopes?: Record<string, Scope>;
}

type ToolHandler = (args: any, extra?: any) => Promise<any>;

/** Wrap one tool handler with audit + timing + actor resolution + scope check. */
export function governTool(
  tool: string,
  handler: ToolHandler,
  opts: GovernanceOptions,
): ToolHandler {
  const resolveActor = opts.resolveActor ?? defaultResolveActor;
  const requiredScope = opts.toolScopes?.[tool];

  return async (args: any, extra?: any) => {
    const correlationId = randomUUID();
    const start = Date.now();
    const actor = await resolveActor(args ?? {});

    const base = {
      ts: new Date().toISOString(),
      correlationId,
      tool,
      actor,
      input: redactArgs(args ?? {}),
    };

    try {
      // Centralized access control: enforce the tool's required scope before it
      // runs. Throwing here means the denial is recorded by the catch below.
      if (requiredScope) {
        await sessionStore().resolveWithScope(args?.session_id, requiredScope);
      }
      const result = await handler(args, extra);
      await opts.sink.record({
        ...base,
        outcome: "ok",
        durationMs: Date.now() - start,
      } as AuditEvent);
      return result;
    } catch (error: any) {
      await opts.sink.record({
        ...base,
        outcome: "error",
        error: `${error?.name ?? "Error"}: ${error?.message ?? ""}`.trim(),
        durationMs: Date.now() - start,
      } as AuditEvent);
      throw error;
    }
  };
}

/**
 * Apply governance to every tool registered on `server` — wraps each handler as
 * it's registered, so all current and future tools are audited from one call.
 * Invoke before registering tools.
 */
export function installGovernance(server: any, opts: GovernanceOptions): void {
  const original = server.registerTool.bind(server);
  server.registerTool = (name: string, spec: any, handler: ToolHandler) =>
    original(name, spec, governTool(name, handler, opts));
}
