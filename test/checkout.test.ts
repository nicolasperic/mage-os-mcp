import { describe, it, expect, vi } from "vitest";
import { setShippingAddress } from "../dist/tools/setShippingAddress.js";
import { setShippingMethod } from "../dist/tools/setShippingMethod.js";
import { setPaymentMethod } from "../dist/tools/setPaymentMethod.js";
import { placeOrder } from "../dist/tools/placeOrder.js";

function mockClient(response: unknown) {
  const request = vi.fn().mockResolvedValue(response);
  return { client: { request } as any, request };
}

const address = {
  cart_id: "cart1",
  email: "guest@example.com",
  firstname: "John",
  lastname: "Doe",
  street: "123 Main St",
  city: "Austin",
  region: "TX",
  postcode: "78701",
  country_code: "US",
  telephone: "5125551234",
};

describe("setShippingAddress", () => {
  it("builds the address input (street as array) and returns only available methods", async () => {
    const { client, request } = mockClient({
      setShippingAddressesOnCart: {
        cart: {
          shipping_addresses: [
            {
              available_shipping_methods: [
                {
                  carrier_code: "flatrate",
                  method_code: "flatrate",
                  carrier_title: "Flat Rate",
                  method_title: "Fixed",
                  available: true,
                  amount: { value: 5, currency: "USD" },
                },
                {
                  carrier_code: "gone",
                  method_code: "gone",
                  carrier_title: "Gone",
                  method_title: "N/A",
                  available: false,
                  amount: { value: 0, currency: "USD" },
                },
              ],
            },
          ],
        },
      },
    });

    const out = await setShippingAddress(client, address);

    // street must be sent as an array inside the CartAddressInput
    expect(request.mock.calls[0][1].address.street).toEqual(["123 Main St"]);
    expect(request.mock.calls[0][1].email).toBe("guest@example.com");
    // unavailable methods are filtered out
    expect(out.available_shipping_methods).toHaveLength(1);
    expect(out.available_shipping_methods[0]).toEqual({
      carrier_code: "flatrate",
      method_code: "flatrate",
      label: "Flat Rate - Fixed",
      amount: 5,
      currency: "USD",
    });
  });
});

describe("setShippingMethod", () => {
  it("returns available payment methods and totals", async () => {
    const { client } = mockClient({
      setShippingMethodsOnCart: {
        cart: {
          available_payment_methods: [{ code: "checkmo", title: "Check / Money order" }],
          prices: {
            subtotal_excluding_tax: { value: 32, currency: "USD" },
            grand_total: { value: 37, currency: "USD" },
          },
        },
      },
    });

    const out = await setShippingMethod(client, {
      cart_id: "cart1",
      carrier_code: "flatrate",
      method_code: "flatrate",
    });
    expect(out.available_payment_methods[0].code).toBe("checkmo");
    expect(out.totals).toEqual({ subtotal: 32, grand_total: 37, currency: "USD" });
  });
});

describe("setPaymentMethod", () => {
  it("echoes the selected method and totals", async () => {
    const { client } = mockClient({
      setPaymentMethodOnCart: {
        cart: {
          selected_payment_method: { code: "checkmo", title: "Check / Money order" },
          prices: {
            subtotal_excluding_tax: { value: 32, currency: "USD" },
            grand_total: { value: 37, currency: "USD" },
          },
        },
      },
    });
    const out = await setPaymentMethod(client, { cart_id: "cart1", code: "checkmo" });
    expect(out.selected_payment_method.code).toBe("checkmo");
    expect(out.totals.grand_total).toBe(37);
  });
});

describe("placeOrder", () => {
  it("returns the order number on success", async () => {
    const { client, request } = mockClient({
      placeOrder: { order: { order_number: "000000003" } },
    });
    const out = await placeOrder(client, { cart_id: "cart1" });
    expect(out).toMatchObject({ success: true, order_number: "000000003" });
    expect(request.mock.calls[0][1]).toEqual({ cartId: "cart1" });
  });
});
