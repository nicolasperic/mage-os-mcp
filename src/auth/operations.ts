import { randomUUID } from "node:crypto";

/**
 * The execution operation state machine behind the agent → human confirmation
 * handoff. An Execute-tier action (place an order, accept an offer) never
 * completes on the agent's word: it creates an operation that must be confirmed
 * by the buyer in their own session before it executes, and it executes at most
 * once even under retries or timeouts.
 *
 *   pending_confirmation ─(buyer confirms)─▶ confirmed ─(execute)─▶ executed
 *            │                                                        ▲
 *            └────────────── (expires) ──▶ expired                    │
 *                                          rejected ◀─(buyer declines)┘?
 *
 * Only `pending_confirmation → confirmed → executed` is the success path;
 * everything else is terminal and non-retryable into an order.
 */
export type OperationStatus =
  | "pending_confirmation"
  | "confirmed"
  | "executed"
  | "rejected"
  | "expired";

export interface Operation {
  operationId: string;
  /** Ties the operation to the actor that created it. */
  sessionId: string;
  /** The action being confirmed, e.g. "place_order". */
  kind: string;
  /** Caller-supplied key: the same key returns the same operation, never a 2nd. */
  idempotencyKey: string;
  /** Digest of the exact terms being confirmed (cart/amount snapshot). */
  snapshotDigest: string;
  /** Kind-specific data needed to execute (e.g. the cart id). */
  payload: Record<string, unknown>;
  status: OperationStatus;
  /** Set once executed — e.g. the resulting order number. */
  result: Record<string, unknown> | null;
  createdAt: number;
  expiresAt: number;
}

export class OperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationError";
  }
}

/**
 * In-memory operation store. Like the session store, this is externalized in a
 * real deployment (so an operation survives a worker restart and a timed-out
 * agent can still find its result) — behind this same interface.
 */
export class OperationStore {
  private readonly ops = new Map<string, Operation>();
  /** idempotencyKey -> operationId, so a replayed create returns the original. */
  private readonly byKey = new Map<string, string>();

  /**
   * Create a pending operation, or return the existing one for a repeated
   * idempotency key. A replay with a *different* snapshot for the same key is a
   * conflict — the terms changed under a reused key.
   */
  create(input: {
    sessionId: string;
    kind: string;
    idempotencyKey: string;
    snapshotDigest: string;
    payload?: Record<string, unknown>;
    ttlMs?: number;
    now?: number;
  }): Operation {
    const now = input.now ?? Date.now();
    const existingId = this.byKey.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.ops.get(existingId)!;
      if (existing.snapshotDigest !== input.snapshotDigest) {
        throw new OperationError(
          "Idempotency key reused with different terms. Use a new key for a " +
            "new request.",
        );
      }
      return existing;
    }

    const op: Operation = {
      operationId: randomUUID(),
      sessionId: input.sessionId,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      snapshotDigest: input.snapshotDigest,
      payload: input.payload ?? {},
      status: "pending_confirmation",
      result: null,
      createdAt: now,
      expiresAt: now + (input.ttlMs ?? 15 * 60 * 1000),
    };
    this.ops.set(op.operationId, op);
    this.byKey.set(op.idempotencyKey, op.operationId);
    return op;
  }

  /** Read an operation, rolling it to `expired` if its window has passed. */
  get(operationId: string, now = Date.now()): Operation {
    const op = this.ops.get(operationId);
    if (!op) {
      throw new OperationError("Unknown operation id.");
    }
    if (op.status === "pending_confirmation" && now >= op.expiresAt) {
      op.status = "expired";
    }
    return op;
  }

  /**
   * Record that the buyer confirmed — but only against the exact terms they
   * saw. A confirmation for a different snapshot is refused.
   */
  markConfirmed(operationId: string, snapshotDigest: string, now = Date.now()): Operation {
    const op = this.get(operationId, now);
    if (op.status === "confirmed" || op.status === "executed") {
      return op; // idempotent: already past this gate
    }
    if (op.status !== "pending_confirmation") {
      throw new OperationError(`Cannot confirm an operation that is ${op.status}.`);
    }
    if (op.snapshotDigest !== snapshotDigest) {
      throw new OperationError("Confirmation does not match the pending terms.");
    }
    op.status = "confirmed";
    return op;
  }

  markRejected(operationId: string, now = Date.now()): Operation {
    const op = this.get(operationId, now);
    if (op.status === "pending_confirmation") {
      op.status = "rejected";
    }
    return op;
  }

  /**
   * Mark executed and attach the result. Idempotent: a second call returns the
   * already-recorded result rather than allowing a second execution.
   */
  markExecuted(operationId: string, result: Record<string, unknown>, now = Date.now()): Operation {
    const op = this.get(operationId, now);
    if (op.status === "executed") {
      return op;
    }
    if (op.status !== "confirmed") {
      throw new OperationError(
        `Cannot execute an operation that is ${op.status}; it must be confirmed first.`,
      );
    }
    op.status = "executed";
    op.result = result;
    return op;
  }

  size(): number {
    return this.ops.size;
  }
}
