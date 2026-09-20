import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { VIEW_CART_QUERY } from "../magento/queries.js";
import { shapeCart, type RawCart } from "./shapeCart.js";

export const viewCartSchema = {
  cart_id: z
    .string()
    .min(1)
    .describe("The guest cart id returned by create_guest_cart."),
};

interface ViewCartResponse {
  cart: RawCart;
}

export async function viewCart(
  client: GraphQLClient,
  args: { cart_id: string },
) {
  const data = await client.request<ViewCartResponse>(VIEW_CART_QUERY, {
    cartId: args.cart_id,
  });

  return shapeCart(data.cart);
}
