import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { PLACE_ORDER_MUTATION } from "../magento/queries.js";

export const placeOrderSchema = {
  cart_id: z
    .string()
    .min(1)
    .describe(
      "The guest cart id to submit. The cart must already have a shipping " +
        "address, shipping method and payment method set.",
    ),
};

interface PlaceOrderResponse {
  placeOrder: { order: { order_number: string } };
}

export async function placeOrder(
  client: GraphQLClient,
  args: { cart_id: string },
) {
  const data = await client.request<PlaceOrderResponse>(PLACE_ORDER_MUTATION, {
    cartId: args.cart_id,
  });

  return {
    success: true,
    order_number: data.placeOrder.order.order_number,
    note: "Order placed. The cart is now consumed and can no longer be used.",
  };
}
