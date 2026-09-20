import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { SET_PAYMENT_METHOD_MUTATION } from "../magento/queries.js";

export const setPaymentMethodSchema = {
  cart_id: z
    .string()
    .min(1)
    .describe("The guest cart id returned by create_guest_cart."),
  code: z
    .string()
    .min(1)
    .describe(
      "Payment method code from set_shipping_method, e.g. 'checkmo' " +
        "(Check / Money Order).",
    ),
};

interface SetPaymentMethodResponse {
  setPaymentMethodOnCart: {
    cart: {
      selected_payment_method: { code: string; title: string | null };
      prices: {
        subtotal_excluding_tax: { value: number | null; currency: string | null };
        grand_total: { value: number | null; currency: string | null };
      };
    };
  };
}

export async function setPaymentMethod(
  client: GraphQLClient,
  args: { cart_id: string; code: string },
) {
  const data = await client.request<SetPaymentMethodResponse>(
    SET_PAYMENT_METHOD_MUTATION,
    { cartId: args.cart_id, code: args.code },
  );

  const cart = data.setPaymentMethodOnCart.cart;

  return {
    note: "Everything is set. Call place_order to submit the order.",
    selected_payment_method: cart.selected_payment_method,
    totals: {
      subtotal: cart.prices.subtotal_excluding_tax.value,
      grand_total: cart.prices.grand_total.value,
      currency: cart.prices.grand_total.currency,
    },
  };
}
