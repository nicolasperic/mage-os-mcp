import { randomUUID } from "node:crypto";
import { InMemoryRepository, type Repository } from "./persistence.js";

/**
 * The execution operation state machine behind the agent → human confirmation
 * handoff. An Execute-tier action never completes on the agent's word: it
 * creates an operation that must be confirmed by the buyer in their own session
 * before it executes, and it executes at most once even under retries/timeouts.
 *
 *   pending_confirmation ─(buyer confirms)─▶ confirmed ─(execute)─▶ executed
 *            ├─(expires)──▶ expired
 *            └─(declines)─▶ rejected
 *
 * Only `pending_confirmation → confirmed → executed` is the success path.
 *
 * Raw storage is delegated to `Repository` (in-memory by default) so a real
 * deployment externalizes it — a timed-out agent then finds its operation's
 * result across a restart or another worker.
 */
export type OperationStatus =
  | "pending_confirmation"
  | "confirmed"
  | "executed"
  | "rejected"
  | "expired";

export interface Operation {
  operationId: string;
  sessionId: string;
  kind: string;
  idempotencyKey: string;
  snapshotDigest: string;
  payload: Record<string, unknown>;
  status: OperationStatus;
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

export class OperationStore {
  constructor(
    private readonly ops: Repository<Operation> = new InMemoryRepository<Operation>(),
    /** Secondary index: idempotencyKey -> operationId. */
    private readonly keyIndex: Repository<string> = new InMemoryRepository<string>(),
  ) {}

  /**
   * Create a pending operation, or return the existing one for a repeated
   * idempotency key. A replay with a *different* snapshot for the same key is a
   * conflict — the terms changed under a reused key.
   */
  async create(input: {
    sessionId: string;
    kind: string;
    idempotencyKey: string;
    snapshotDigest: string;
    payload?: Record<string, unknown>;
    ttlMs?: number;
    now?: number;
  }): Promise<Operation> {
    const now = input.now ?? Date.now();
    const existingId = await this.keyIndex.get(input.idempotencyKey);
    if (existingId) {
      const existing = await this.ops.get(existingId);
      if (existing) {
        if (existing.snapshotDigest !== input.snapshotDigest) {
          throw new OperationError(
            "Idempotency key reused with different terms. Use a new key for a " +
              "new request.",
          );
        }
        return existing;
      }
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
    await this.ops.set(op.operationId, op);
    await this.keyIndex.set(op.idempotencyKey, op.operationId);
    return op;
  }

  /** Read an operation, rolling it to `expired` if its window has passed. */
  async get(operationId: string, now = Date.now()): Promise<Operation> {
    const op = await this.ops.get(operationId);
    if (!op) {
      throw new OperationError("Unknown operation id.");
    }
    if (op.status === "pending_confirmation" && now >= op.expiresAt) {
      op.status = "expired";
      await this.ops.set(op.operationId, op);
    }
    return op;
  }

  /**
   * Record that the buyer confirmed — but only against the exact terms they
   * saw. A confirmation for a different snapshot is refused.
   */
  async markConfirmed(
    operationId: string,
    snapshotDigest: string,
    now = Date.now(),
  ): Promise<Operation> {
    const op = await this.get(operationId, now);
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
    await this.ops.set(op.operationId, op);
    return op;
  }

  async markRejected(operationId: string, now = Date.now()): Promise<Operation> {
    const op = await this.get(operationId, now);
    if (op.status === "pending_confirmation") {
      op.status = "rejected";
      await this.ops.set(op.operationId, op);
    }
    return op;
  }

  /**
   * Mark executed and attach the result. Idempotent: a second call returns the
   * already-recorded result rather than allowing a second execution.
   */
  async markExecuted(
    operationId: string,
    result: Record<string, unknown>,
    now = Date.now(),
  ): Promise<Operation> {
    const op = await this.get(operationId, now);
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
    await this.ops.set(op.operationId, op);
    return op;
  }

  async size(): Promise<number> {
    return this.ops.count();
  }
}
