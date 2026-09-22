import { createHash } from "node:crypto";

/**
 * The seam for the buyer-facing confirmation step. Issuing a signed, single-use
 * confirmation link and recording that the buyer approved it *in their own
 * session* is store-side work (a store-hosted page + signing key) that depends
 * on decisions still open. This interface is what the MCP calls; the real
 * implementation lands behind it, and a dev stub lets the flow run end-to-end
 * in tests meanwhile.
 */
export interface ConfirmationProvider {
  /**
   * Begin confirmation for an operation. Returns a URL the agent presents to
   * the buyer out of band — one the agent cannot forge, bound to the operation
   * and the exact terms (snapshotDigest).
   */
  issueLink(input: {
    operationId: string;
    snapshotDigest: string;
    amount: number;
    currency: string;
  }): Promise<{ confirmationUrl: string; expiresAt: number }>;
}

/**
 * Stable digest of the exact terms being confirmed. The buyer confirms *this*;
 * if anything material changes, the digest changes and the prior confirmation
 * no longer matches.
 */
export function snapshotDigest(terms: {
  cartId: string;
  items: Array<{ sku: string; quantity: number; row_total: number | null }>;
  grandTotal: number | null;
  currency: string | null;
}): string {
  const canonical = JSON.stringify({
    cartId: terms.cartId,
    items: terms.items
      .map((i) => ({ sku: i.sku, q: i.quantity, t: i.row_total }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
    grand: terms.grandTotal,
    currency: terms.currency,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * DEV stub. Produces a placeholder link and never actually confirms anything on
 * its own — tests drive confirmation explicitly via the operation store. Not a
 * real confirmation surface; the production provider issues signed links from a
 * store-hosted page the buyer authenticates against.
 */
export class StubConfirmationProvider implements ConfirmationProvider {
  constructor(private readonly baseUrl = "https://example.test/b2b/confirm") {}

  async issueLink(input: {
    operationId: string;
    snapshotDigest: string;
    amount: number;
    currency: string;
  }): Promise<{ confirmationUrl: string; expiresAt: number }> {
    // A real provider signs a single-use token; the stub just encodes the ref.
    const url = `${this.baseUrl}?op=${encodeURIComponent(input.operationId)}`;
    return { confirmationUrl: url, expiresAt: Date.now() + 15 * 60 * 1000 };
  }
}
