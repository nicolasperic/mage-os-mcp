import type { GraphQLClient } from "graphql-request";
import { CREATE_GUEST_CART_MUTATION } from "../magento/queries.js";

// No inputs: creates a fresh anonymous cart.
export const createGuestCartSchema = {};

interface CreateGuestCartResponse {
  createGuestCart: { cart: { id: string } };
}

export async function createGuestCart(client: GraphQLClient) {
  const data = await client.request<CreateGuestCartResponse>(
    CREATE_GUEST_CART_MUTATION,
  );

  return {
    cart_id: data.createGuestCart.cart.id,
    note:
      "Save this cart_id and pass it to add_to_cart and view_cart. " +
      "It identifies this anonymous shopping session.",
  };
}
