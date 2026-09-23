import { createHash } from "node:crypto";

/**
 * A structured audit record for one MCP tool call — the "who did what, under
 * what permission, with what outcome" trail that governance (and SOC 2-style
 * compliance) needs. Emitted for every call by the governance wrapper.
 *
 * `input` is always redacted (see redact.ts); credentials never appear here,
 * and the underlying bearer token is server-side and out of scope entirely.
 */
export interface AuditEvent {
  /** ISO-8601 timestamp. */
  ts: string;
  /** Per-call id, for correlating a request across systems. */
  correlationId: string;
  /** Tool name, e.g. `place_order`. */
  tool: string;
  /** Who made the call, resolved server-side (never asserted by the agent). */
  actor: {
    type: "customer" | "anonymous";
    customerId?: number;
    companyId?: number | null;
    roleId?: number | null;
    scopes?: string[];
  };
  /** Redacted tool input. */
  input: Record<string, unknown>;
  /** `ok` if the handler returned, `error` if it threw (incl. authz denials). */
  outcome: "ok" | "error";
  /** Error name + message when `outcome` is `error`. No secrets. */
  error?: string;
  durationMs: number;
  /** Set by HashChainAuditSink for tamper-evidence. */
  prevHash?: string;
  hash?: string;
}

/** Where audit events go. Swap for a file, DB, or log service in production. */
export interface AuditSink {
  record(event: AuditEvent): void | Promise<void>;
}

/** Discards events (audit disabled). */
export class NullAuditSink implements AuditSink {
  record(): void {}
}

/**
 * Writes one JSON line per event to stderr. stderr is safe — stdout is reserved
 * for the MCP protocol — and a host/collector can ship these lines onward.
 */
export class StderrAuditSink implements AuditSink {
  record(event: AuditEvent): void {
    process.stderr.write(`${JSON.stringify({ audit: event })}\n`);
  }
}

/** Keeps events in memory. For tests and introspection. */
export class MemoryAuditSink implements AuditSink {
  readonly events: AuditEvent[] = [];
  record(event: AuditEvent): void {
    this.events.push(event);
  }
}

/** Canonical bytes of an event for hashing: everything except its own `hash`. */
function canonical(event: AuditEvent): string {
  const { hash, ...rest } = event;
  return JSON.stringify(rest);
}

/**
 * Decorator sink that hash-chains events (each entry's hash covers the previous
 * hash), making the trail tamper-evident: altering or dropping any past entry
 * breaks the chain. Wraps another sink for actual delivery.
 */
export class HashChainAuditSink implements AuditSink {
  constructor(
    private readonly inner: AuditSink,
    private prev: string = "GENESIS",
  ) {}

  async record(event: AuditEvent): Promise<void> {
    const withPrev: AuditEvent = { ...event, prevHash: this.prev };
    const hash = createHash("sha256").update(canonical(withPrev)).digest("hex");
    this.prev = hash;
    await this.inner.record({ ...withPrev, hash });
  }
}

/** Verify a hash-chained sequence: every hash recomputes and every link holds. */
export function verifyChain(events: AuditEvent[]): boolean {
  let prev = "GENESIS";
  for (const event of events) {
    if (event.prevHash !== prev) return false;
    const expected = createHash("sha256").update(canonical(event)).digest("hex");
    if (event.hash !== expected) return false;
    prev = event.hash;
  }
  return true;
}
