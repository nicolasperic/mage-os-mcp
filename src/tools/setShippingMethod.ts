import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { SET_SHIPPING_METHOD_MUTATION } from "../magento/queries.js";

export const setShippingMethodSchema = {
  cart_id: z
    .string()
    .min(1)
    .describe("The guest cart id returned by create_guest_cart."),
  carrier_code: z
    .string()
    .min(1)
    .describe("Carrier code from set_shipping_address, e.g. 'flatrate'."),
  method_code: z
    .string()
    .min(1)
    .describe("Method code from set_shipping_address, e.g. 'flatrate'."),
};

interface SetShippingMethodResponse {
  setShippingMethodsOnCart: {
    cart: {
      available_payment_methods: Array<{ code: string; title: string | null }>;
      prices: {
        subtotal_excluding_tax: { value: number | null; currency: string | null };
        grand_total: { value: number | null; currency: string | null };
      };
    };
  };
}

export async function setShippingMethod(
  client: GraphQLClient,
  args: { cart_id: string; carrier_code: string; method_code: string },
) {
  const data = await client.request<SetShippingMethodResponse>(
    SET_SHIPPING_METHOD_MUTATION,
    {
      cartId: args.cart_id,
      carrier: args.carrier_code,
      method: args.method_code,
    },
  );

  const cart = data.setShippingMethodsOnCart.cart;

  return {
    note: "Choose a payment method with set_payment_method (pass one of the codes below).",
    available_payment_methods: cart.available_payment_methods.map((m) => ({
      code: m.code,
      title: m.title,
    })),
    totals: {
      subtotal: cart.prices.subtotal_excluding_tax.value,
      grand_total: cart.prices.grand_total.value,
      currency: cart.prices.grand_total.currency,
    },
  };
}
