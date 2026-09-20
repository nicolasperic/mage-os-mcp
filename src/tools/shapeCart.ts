/**
 * Shared shape for a cart as returned by the CartFields GraphQL fragment,
 * plus a helper to turn it into the flat, agent-friendly JSON our cart tools
 * return. Keeping this in one place means add_to_cart and view_cart always
 * present the cart the same way.
 */
export interface RawCart {
  id: string;
  total_quantity: number;
  items: Array<{
    uid: string;
    quantity: number;
    product: { sku: string; name: string };
    prices: { row_total: { value: number | null; currency: string | null } };
  }>;
  prices: {
    subtotal_excluding_tax: { value: number | null; currency: string | null };
    grand_total: { value: number | null; currency: string | null };
  };
}

export function shapeCart(cart: RawCart) {
  return {
    cart_id: cart.id,
    total_quantity: cart.total_quantity,
    items: cart.items.map((item) => ({
      sku: item.product.sku,
      name: item.product.name,
      quantity: item.quantity,
      row_total: item.prices.row_total.value,
    })),
    totals: {
      subtotal: cart.prices.subtotal_excluding_tax.value,
      grand_total: cart.prices.grand_total.value,
      currency:
        cart.prices.grand_total.currency ??
        cart.prices.subtotal_excluding_tax.currency,
    },
  };
}
