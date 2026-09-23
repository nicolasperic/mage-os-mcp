import { describe, it, expect, vi } from "vitest";
import { OperationStore, OperationError } from "../dist/auth/operations.js";
import { SessionStore } from "../dist/auth/sessionStore.js";
import { StubConfirmationProvider, snapshotDigest } from "../dist/auth/confirmation.js";
import { requestPlaceOrder, getOperationStatus } from "../dist/auth/placeOrderFlow.js";
import { ScopeError } from "../dist/auth/scopes.js";
import type { Scope } from "../dist/auth/scopes.js";

const CART = {
  cartId: "cart1",
  items: [{ sku: "24-WB01", quantity: 2, row_total: 64 }],
  grandTotal: 69,
  currency: "USD",
};

async function harness(scopes: Scope[] = ["purchase.execute"]) {
  const sessions = new SessionStore();
  const operations = new OperationStore();
  const sessionId = await sessions.store({
    customerId: 1,
    companyId: 7,
    roleId: 1,
    scopes,
    token: "BEARER",
    expiresAt: Date.now() + 60_000,
    via: "test",
  });
  const executeOrder = vi.fn().mockResolvedValue({ order_number: "000000009" });
  const deps = {
    sessions,
    operations,
    confirmation: new StubConfirmationProvider(),
    loadCart: vi.fn().mockResolvedValue(CART),
    executeOrder,
  };
  return { deps, sessions, operations, sessionId, executeOrder };
}

describe("place-order confirmation handoff", () => {
  it("requires the purchase.execute scope", async () => {
    const { deps, sessionId } = await harness(["cart.draft"]);
    await expect(
      requestPlaceOrder(deps, { session_id: sessionId, cart_id: "cart1", idempotency_key: "k1" }),
    ).rejects.toThrow(ScopeError);
    expect(deps.executeOrder).not.toHaveBeenCalled();
  });

  it("request does not place the order — it returns needs_confirmation", async () => {
    const { deps, sessionId } = await harness();
    const res = await requestPlaceOrder(deps, {
      session_id: sessionId, cart_id: "cart1", idempotency_key: "k1",
    });
    expect(res.status).toBe("needs_confirmation");
    expect(res.operation_id).toBeTruthy();
    expect(res.confirmation_url).toContain(res.operation_id);
    expect(deps.executeOrder).not.toHaveBeenCalled();
  });

  it("polling before confirmation stays pending, still no order", async () => {
    const { deps, sessionId } = await harness();
    const req = await requestPlaceOrder(deps, { session_id: sessionId, cart_id: "cart1", idempotency_key: "k1" });
    const status = await getOperationStatus(deps, { session_id: sessionId, operation_id: req.operation_id });
    expect(status.status).toBe("pending_confirmation");
    expect(deps.executeOrder).not.toHaveBeenCalled();
  });

  it("executes once the buyer confirms, and only once across polls", async () => {
    const { deps, operations, sessionId, executeOrder } = await harness();
    const req = await requestPlaceOrder(deps, { session_id: sessionId, cart_id: "cart1", idempotency_key: "k1" });

    // Buyer confirms out of band, against the exact terms they saw.
    await operations.markConfirmed(req.operation_id, snapshotDigest(CART));

    const first = await getOperationStatus(deps, { session_id: sessionId, operation_id: req.operation_id });
    expect(first.status).toBe("executed");
    expect(first.result).toEqual({ order_number: "000000009" });

    // Repeated / timed-out polls must not place a second order.
    const second = await getOperationStatus(deps, { session_id: sessionId, operation_id: req.operation_id });
    expect(second.status).toBe("executed");
    expect(executeOrder).toHaveBeenCalledTimes(1);
  });

  it("two concurrent polls after confirmation place the order exactly once", async () => {
    const { deps, operations, sessionId, executeOrder } = await harness();
    const req = await requestPlaceOrder(deps, { session_id: sessionId, cart_id: "cart1", idempotency_key: "k1" });
    await operations.markConfirmed(req.operation_id, snapshotDigest(CART));

    // Fire two polls at once — the atomic claim must let only one execute.
    const [a, b] = await Promise.all([
      getOperationStatus(deps, { session_id: sessionId, operation_id: req.operation_id }),
      getOperationStatus(deps, { session_id: sessionId, operation_id: req.operation_id }),
    ]);
    expect(executeOrder).toHaveBeenCalledTimes(1);
    expect([a.status, b.status]).toContain("executed");
  });

  it("a replayed idempotency key returns the same operation, not a new order", async () => {
    const { deps, operations, sessionId, executeOrder } = await harness();
    const first = await requestPlaceOrder(deps, { session_id: sessionId, cart_id: "cart1", idempotency_key: "k1" });
    await operations.markConfirmed(first.operation_id, snapshotDigest(CART));
    await getOperationStatus(deps, { session_id: sessionId, operation_id: first.operation_id });

    // Same key again → recognized as already placed.
    const replay = await requestPlaceOrder(deps, { session_id: sessionId, cart_id: "cart1", idempotency_key: "k1" });
    expect(replay.status).toBe("already_placed");
    expect(replay.result).toEqual({ order_number: "000000009" });
    expect(executeOrder).toHaveBeenCalledTimes(1);
  });

  it("rejects a confirmation whose terms changed", async () => {
    const { operations, sessionId } = await harness();
    const op = await operations.create({
      sessionId, kind: "place_order", idempotencyKey: "k1", snapshotDigest: "digest-A",
    });
    await expect(operations.markConfirmed(op.operationId, "digest-B")).rejects.toThrow(OperationError);
  });

  it("won't let another session read someone else's operation", async () => {
    const { deps, sessions, sessionId } = await harness();
    const req = await requestPlaceOrder(deps, { session_id: sessionId, cart_id: "cart1", idempotency_key: "k1" });
    const otherSession = await sessions.store({
      customerId: 2, companyId: 7, roleId: 3, scopes: ["purchase.execute"] as Scope[],
      token: "OTHER", expiresAt: Date.now() + 60_000, via: "test",
    });
    await expect(
      getOperationStatus(deps, { session_id: otherSession, operation_id: req.operation_id }),
    ).rejects.toThrow(OperationError);
  });
});
