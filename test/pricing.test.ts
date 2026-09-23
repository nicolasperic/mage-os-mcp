import { describe, it, expect, vi } from "vitest";
import { money, tierPricing, defaultPriceContext } from "../dist/magento/price.js";
import { getProduct } from "../dist/tools/getProduct.js";
import { searchProducts } from "../dist/tools/searchProducts.js";
import { snapshotDigest } from "../dist/auth/confirmation.js";

function mockClient(response) {
  const request = vi.fn().mockResolvedValue(response);
  return { client: { request }, request };
}

const productWithTiers = (tiers) => ({
  products: {
    items: [
      {
        sku: "BOLT-M6",
        name: "M6 Bolt",
        stock_status: "IN_STOCK",
        only_x_left_in_stock: null,
        url_key: "m6-bolt",
        description: { html: null },
        short_description: { html: null },
        image: null,
        media_gallery: [],
        categories: [],
        price_range: {
          minimum_price: {
            final_price: { value: 10, currency: "GBP" },
            regular_price: { value: 10, currency: "GBP" },
            discount: { amount_off: 0, percent_off: 0 },
          },
        },
        price_tiers: tiers,
      },
    ],
  },
});

describe("price envelope", () => {
  it("carries the tax mode and price view the figure was resolved under", () => {
    const m = money(49.99, "EUR", {
      taxMode: "excl",
      priceView: "company",
      catalogId: "cat-7",
      locationId: 42,
    });
    expect(m).toEqual({
      amount: 49.99,
      currency: "EUR",
      tax_mode: "excl",
      price_view: "company",
      catalog_id: "cat-7",
      location_id: 42,
    });
  });

  it("reports unknown rather than guessing a tax treatment", () => {
    // An agent can act on stated uncertainty; it cannot recover context we drop.
    expect(defaultPriceContext().taxMode).toBe("unknown");
    expect(money(5, "USD", defaultPriceContext()).tax_mode).toBe("unknown");
  });

  it("nulls a missing amount instead of coercing it to zero", () => {
    const m = money(null, null, defaultPriceContext());
    expect(m.amount).toBeNull();
    expect(m.currency).toBeNull();
  });
});

describe("quantity price breaks", () => {
  const ctx = defaultPriceContext("excl");

  it("sorts breaks ascending and reports the cheapest as best", () => {
    const out = tierPricing(
      [
        { quantity: 100, final_price: { value: 7, currency: "GBP" }, discount: { percent_off: 30 } },
        { quantity: 10, final_price: { value: 9, currency: "GBP" }, discount: { percent_off: 10 } },
      ],
      ctx,
    );
    expect(out.tiers.map((t) => t.quantity)).toEqual([10, 100]);
    expect(out.best).toEqual({
      quantity: 100,
      unit_price: {
        amount: 7,
        currency: "GBP",
        tax_mode: "excl",
        price_view: "consumer",
        catalog_id: null,
        location_id: null,
      },
    });
  });

  it("picks the cheapest tier, not simply the largest quantity", () => {
    // Stores can configure breaks that don't decrease monotonically.
    const out = tierPricing(
      [
        { quantity: 10, final_price: { value: 5, currency: "GBP" }, discount: null },
        { quantity: 50, final_price: { value: 8, currency: "GBP" }, discount: null },
      ],
      ctx,
    );
    expect(out.best.quantity).toBe(10);
    expect(out.best.unit_price.amount).toBe(5);
  });

  it("returns null when a product has no breaks, so absence is explicit", () => {
    expect(tierPricing([], ctx)).toBeNull();
    expect(tierPricing(null, ctx)).toBeNull();
  });

  it("drops malformed tiers rather than emitting a break with no quantity", () => {
    const out = tierPricing(
      [
        { quantity: null, final_price: { value: 1, currency: "GBP" }, discount: null },
        { quantity: 25, final_price: { value: 9, currency: "GBP" }, discount: null },
      ],
      ctx,
    );
    expect(out.tiers).toHaveLength(1);
    expect(out.tiers[0].quantity).toBe(25);
  });
});

describe("catalog tools surface tier pricing", () => {
  it("get_product returns the full break table", async () => {
    const { client } = mockClient(
      productWithTiers([
        { quantity: 100, final_price: { value: 7, currency: "GBP" }, discount: { percent_off: 30 } },
      ]),
    );
    const out = await getProduct(client, { sku: "BOLT-M6" }, defaultPriceContext("excl"));
    // Quoting unit price while 100+ drops it 30% is misleading, not merely incomplete.
    expect(out.tier_pricing.best.quantity).toBe(100);
    expect(out.tier_pricing.tiers[0].percent_off).toBe(30);
    expect(out.price.final.tax_mode).toBe("excl");
  });

  it("search results carry breaks too, where buying decisions start", async () => {
    const { client } = mockClient({
      products: {
        total_count: 1,
        page_info: { current_page: 1, page_size: 10, total_pages: 1 },
        items: [
          {
            sku: "BOLT-M6",
            name: "M6 Bolt",
            stock_status: "IN_STOCK",
            url_key: "m6-bolt",
            small_image: null,
            price_range: { minimum_price: { final_price: { value: 10, currency: "GBP" } } },
            price_tiers: [
              { quantity: 50, final_price: { value: 8, currency: "GBP" }, discount: { percent_off: 20 } },
            ],
          },
        ],
      },
    });
    const out = await searchProducts(
      client,
      { search: "bolt", pageSize: 10, currentPage: 1, sort: "relevance" },
      defaultPriceContext("excl"),
    );
    expect(out.results[0].tier_pricing.best.quantity).toBe(50);
    expect(out.results[0].price.tax_mode).toBe("excl");
  });
});

describe("location is part of the confirmed terms", () => {
  const cart = {
    cartId: "cart-1",
    items: [{ sku: "BOLT-M6", quantity: 100, row_total: 700 }],
    grandTotal: 700,
    currency: "GBP",
  };

  it("changes the digest, so a confirmation cannot carry across locations", () => {
    // Location selects catalog, price list and payment terms — different terms.
    expect(snapshotDigest({ ...cart, locationId: 1 })).not.toBe(
      snapshotDigest({ ...cart, locationId: 2 }),
    );
  });

  it("treats an absent location the same as an explicit null", () => {
    // Stores without locations get one stable digest, not two.
    expect(snapshotDigest(cart)).toBe(snapshotDigest({ ...cart, locationId: null }));
  });

  it("still changes when the cart terms change", () => {
    expect(snapshotDigest({ ...cart, locationId: 1 })).not.toBe(
      snapshotDigest({ ...cart, grandTotal: 999, locationId: 1 }),
    );
  });
});
