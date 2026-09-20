import { describe, it, expect } from "vitest";
import { shapeCart } from "../dist/tools/shapeCart.js";

describe("shapeCart", () => {
  it("flattens a raw cart into agent-friendly line items and totals", () => {
    const raw = {
      id: "abc123",
      total_quantity: 3,
      items: [
        {
          uid: "1",
          quantity: 2,
          product: { sku: "24-WB01", name: "Voyage Yoga Bag" },
          prices: { row_total: { value: 64, currency: "USD" } },
        },
        {
          uid: "2",
          quantity: 1,
          product: { sku: "24-MB01", name: "Joust Duffle Bag" },
          prices: { row_total: { value: 34, currency: "USD" } },
        },
      ],
      prices: {
        subtotal_excluding_tax: { value: 98, currency: "USD" },
        grand_total: { value: 98, currency: "USD" },
      },
    };

    expect(shapeCart(raw)).toEqual({
      cart_id: "abc123",
      total_quantity: 3,
      items: [
        { sku: "24-WB01", name: "Voyage Yoga Bag", quantity: 2, row_total: 64 },
        { sku: "24-MB01", name: "Joust Duffle Bag", quantity: 1, row_total: 34 },
      ],
      totals: { subtotal: 98, grand_total: 98, currency: "USD" },
    });
  });

  it("falls back to the subtotal currency when grand_total currency is null", () => {
    const raw = {
      id: "x",
      total_quantity: 0,
      items: [],
      prices: {
        subtotal_excluding_tax: { value: 0, currency: "EUR" },
        grand_total: { value: 0, currency: null },
      },
    };
    expect(shapeCart(raw).totals.currency).toBe("EUR");
  });
});
