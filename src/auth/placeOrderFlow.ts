import type { ActorContext } from "./actorContext.js";
import type { ConfirmationProvider } from "./confirmation.js";
import { snapshotDigest } from "./confirmation.js";
import { OperationError, type OperationStore } from "./operations.js";
import { SessionStore } from "./sessionStore.js";

/**
 * The confirmation-aware place-order flow. `place_order` no longer executes on
 * request: it creates a pending operation bound to the exact cart terms and
 * hands back a confirmation link. The order is placed only after the buyer
 * confirms (out of band, in their own session), and at most once thanks to the
 * idempotency key and the operation state machine.
 *
 * The pieces the MCP doesn't own live behind injected dependencies:
 *   - loadCart / executeOrder wrap the existing native cart + placeOrder paths
 *   - confirmation is the store-side signed-link provider (stubbed in dev)
 *   - buyer confirmation itself is recorded on the OperationStore by the
 *     store-side confirm handler (simulated directly in tests)
 */
export interface CartSummary {
  cartId: string;
  items: Array<{ sku: string; quantity: number; row_total: number | null }>;
  grandTotal: number | null;
  currency: string | null;
}

export interface PlaceOrderDeps {
  sessions: SessionStore;
  operations: OperationStore;
  confirmation: ConfirmationProvider;
  loadCart: (ctx: ActorContext, cartId: string) => Promise<CartSummary>;
  executeOrder: (
    ctx: ActorContext,
    cartId: string,
  ) => Promise<{ order_number: string }>;
}

/**
 * Step 1 of the handoff: validate scope, snapshot the cart, open an operation,
 * and return a confirmation link — without placing anything.
 */
export async function requestPlaceOrder(
  deps: PlaceOrderDeps,
  args: { session_id: string; cart_id: string; idempotency_key: string },
) {
  const ctx = await deps.sessions.resolveWithScope(args.session_id, "purchase.execute");
  const cart = await deps.loadCart(ctx, args.cart_id);
  const digest = snapshotDigest(cart);

  const op = await deps.operations.create({
    sessionId: ctx.sessionId,
    kind: "place_order",
    idempotencyKey: args.idempotency_key,
    snapshotDigest: digest,
    payload: { cartId: cart.cartId },
  });

  // Idempotent replay: this key already ran to completion.
  if (op.status === "executed") {
    return {
      status: "already_placed" as const,
      operation_id: op.operationId,
      result: op.result,
    };
  }

  const link = await deps.confirmation.issueLink({
    operationId: op.operationId,
    snapshotDigest: digest,
    amount: cart.grandTotal ?? 0,
    currency: cart.currency ?? "",
  });

  return {
    status: "needs_confirmation" as const,
    operation_id: op.operationId,
    confirmation_url: link.confirmationUrl,
    expires_at: new Date(link.expiresAt).toISOString(),
    summary: {
      items: cart.items,
      grand_total: cart.grandTotal,
      currency: cart.currency,
    },
    note:
      "Ask the buyer to confirm at confirmation_url, then poll " +
      "get_operation_status. The order is placed only after they confirm.",
  };
}

/**
 * Step 2 of the handoff: the agent polls this. If the buyer has confirmed, the
 * order is executed here (idempotently) and the order number returned; a
 * timed-out or repeated poll never places a second order.
 */
export async function getOperationStatus(
  deps: PlaceOrderDeps,
  args: { session_id: string; operation_id: string },
  now = Date.now(),
) {
  const ctx = await deps.sessions.resolve(args.session_id, now);
  const op = await deps.operations.get(args.operation_id, now);

  // An operation belongs to the session that created it.
  if (op.sessionId !== ctx.sessionId) {
    throw new OperationError("Unknown operation id.");
  }

  // Confirmed but not yet executed → execute now, exactly once. Claiming the
  // operation (confirmed → executing) is atomic, so a concurrent poll can't also
  // place the order; the loser simply reports current status.
  if (op.status === "confirmed") {
    const claimed = await deps.operations.claimForExecution(op.operationId, now);
    if (claimed) {
      const cartId = String(op.payload.cartId);
      try {
        const result = await deps.executeOrder(ctx, cartId);
        await deps.operations.markExecuted(op.operationId, result, now);
      } catch (err) {
        // Execution failed before an order was recorded → release the claim so a
        // later poll can retry rather than the operation being stuck executing.
        await deps.operations.releaseClaim(op.operationId, now);
        throw err;
      }
    }
  }

  const settled = await deps.operations.get(op.operationId, now);
  return {
    operation_id: settled.operationId,
    status: settled.status,
    result: settled.result,
  };
}
