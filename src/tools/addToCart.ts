import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { ADD_TO_CART_MUTATION } from "../magento/queries.js";
import { shapeCart, type RawCart } from "./shapeCart.js";

export const addToCartSchema = {
  cart_id: z
    .string()
    .min(1)
    .describe("The guest cart id returned by create_guest_cart."),
  items: z
    .array(
      z.object({
        sku: z.string().min(1).describe("Exact SKU of the product to add."),
        quantity: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("How many units to add (default 1)."),
      }),
    )
    .min(1)
    .describe("One or more products to add to the cart."),
};

interface AddToCartResponse {
  addProductsToCart: {
    cart: RawCart;
    user_errors: Array<{ code: string; message: string }>;
  };
}

export async function addToCart(
  client: GraphQLClient,
  args: { cart_id: string; items: Array<{ sku: string; quantity: number }> },
) {
  const data = await client.request<AddToCartResponse>(ADD_TO_CART_MUTATION, {
    cartId: args.cart_id,
    cartItems: args.items.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
    })),
  });

  const { cart, user_errors } = data.addProductsToCart;

  // addProductsToCart reports per-item problems (e.g. out of stock, SKU not
  // found, configurable products needing options) in user_errors rather than
  // throwing, so surface them explicitly.
  return {
    added: user_errors.length === 0,
    user_errors,
    cart: shapeCart(cart),
  };
}
