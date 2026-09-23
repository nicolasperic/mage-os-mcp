/**
 * Self-describing prices.
 *
 * A storefront renders a price for a human who can see the surrounding context —
 * which store they're on, whether they're logged in, whether the theme shows
 * tax-inclusive figures. An MCP client has none of that. If we hand an agent a
 * bare `49.99`, it will repeat it as fact, and be wrong for whichever half of the
 * audience sees the other tax treatment. A human notices; an agent never does.
 *
 * So every monetary value this server returns is wrapped in a `Money` envelope
 * that says what the number actually means. Where we genuinely don't know, we
 * say `"unknown"` rather than guessing — an agent can surface that uncertainty,
 * but it cannot recover context we silently dropped.
 */

/** Whether the figure includes tax. `unknown` until the deployment declares it. */
export type TaxMode = "incl" | "excl" | "unknown";

/**
 * Which audience's pricing this represents. B2B stores routinely contain a B2C
 * store; the same SKU legitimately has a consumer price and a company price.
 */
export type PriceView = "consumer" | "company";

/** The pricing context a set of figures was resolved under. */
export interface PriceContext {
  taxMode: TaxMode;
  priceView: PriceView;
  /** Catalog / price list the figures came from, when the store scopes them. */
  catalogId: string | null;
  /** Company location the figures were resolved for, when one is bound. */
  locationId: number | null;
}

/** A monetary value that carries its own meaning. */
export interface Money {
  amount: number | null;
  currency: string | null;
  tax_mode: TaxMode;
  price_view: PriceView;
  catalog_id: string | null;
  location_id: number | null;
}

/**
 * The default context for an unauthenticated catalog read: consumer pricing,
 * tax treatment whatever the deployment declared, no catalog or location bound.
 */
export function defaultPriceContext(taxMode: TaxMode = "unknown"): PriceContext {
  return { taxMode, priceView: "consumer", catalogId: null, locationId: null };
}

export function money(
  amount: number | null | undefined,
  currency: string | null | undefined,
  ctx: PriceContext,
): Money {
  return {
    amount: amount ?? null,
    currency: currency ?? null,
    tax_mode: ctx.taxMode,
    price_view: ctx.priceView,
    catalog_id: ctx.catalogId,
    location_id: ctx.locationId,
  };
}

/** One quantity break: buy `quantity` or more, pay `unit_price` each. */
export interface PriceTier {
  quantity: number;
  unit_price: Money;
  percent_off: number | null;
}

/**
 * Quantity price breaks — the most B2B-specific thing a catalog read can carry,
 * and the one most likely to make an agent's advice wrong if omitted. Quoting a
 * unit price without knowing that 100+ drops it 30% is not an incomplete answer,
 * it's a misleading one.
 */
export interface TierPricing {
  tiers: PriceTier[];
  /** The cheapest tier — the floor price, and the quantity needed to reach it. */
  best: { quantity: number; unit_price: Money };
}

interface RawTier {
  quantity: number | null;
  final_price: { value: number | null; currency: string | null } | null;
  discount: { percent_off: number | null } | null;
}

/**
 * Normalize Magento's `price_tiers` into ascending quantity breaks. Returns
 * null when the product has none, so the absence of tiers is explicit rather
 * than an empty array the agent has to interpret.
 */
export function tierPricing(
  raw: RawTier[] | null | undefined,
  ctx: PriceContext,
): TierPricing | null {
  const tiers = (raw ?? [])
    .filter((t): t is RawTier & { quantity: number } => typeof t.quantity === "number")
    .map((t) => ({
      quantity: t.quantity,
      unit_price: money(t.final_price?.value, t.final_price?.currency, ctx),
      percent_off: t.discount?.percent_off ?? null,
    }))
    .sort((a, b) => a.quantity - b.quantity);

  if (tiers.length === 0) return null;

  // Cheapest unit price, not simply the largest quantity — a store can
  // configure breaks that don't decrease monotonically.
  const best = tiers.reduce((lowest, t) =>
    (t.unit_price.amount ?? Infinity) < (lowest.unit_price.amount ?? Infinity) ? t : lowest,
  );

  return { tiers, best: { quantity: best.quantity, unit_price: best.unit_price } };
}
