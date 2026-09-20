import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { GET_ORDERS_QUERY } from "../magento/queries.js";
import { authHeaders } from "../magento/session.js";

export const getOrderStatusSchema = {
  session_id: z
    .string()
    .min(1)
    .describe("The session_id returned by login."),
  order_number: z
    .string()
    .optional()
    .describe(
      "Optional order number (e.g. '000000001') to look up a single order. " +
        "Omit to list the customer's most recent orders.",
    ),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("How many recent orders to return when no order_number is given."),
};

interface OrdersResponse {
  customer: {
    orders: {
      total_count: number;
      items: Array<{
        number: string;
        order_date: string;
        status: string;
        total: {
          grand_total: { value: number | null; currency: string | null };
        };
        items: Array<{
          product_name: string | null;
          product_sku: string | null;
          quantity_ordered: number | null;
        }>;
        shipments: Array<{
          tracking: Array<{
            carrier: string | null;
            title: string | null;
            number: string | null;
          }> | null;
        }> | null;
      }>;
    };
  };
}

export async function getOrderStatus(
  client: GraphQLClient,
  args: { session_id: string; order_number?: string; pageSize: number },
) {
  const filter = args.order_number
    ? { number: { eq: args.order_number } }
    : undefined;

  const data = await client.request<OrdersResponse>(
    GET_ORDERS_QUERY,
    { filter, pageSize: args.pageSize },
    authHeaders(args.session_id),
  );

  const orders = data.customer.orders.items.map((o) => ({
    number: o.number,
    order_date: o.order_date,
    status: o.status,
    grand_total: o.total.grand_total.value,
    currency: o.total.grand_total.currency,
    items: o.items.map((i) => ({
      name: i.product_name,
      sku: i.product_sku,
      quantity: i.quantity_ordered,
    })),
    tracking: (o.shipments ?? []).flatMap((s) =>
      (s.tracking ?? []).map((t) => ({
        carrier: t.carrier,
        title: t.title,
        number: t.number,
      })),
    ),
  }));

  return { total_count: data.customer.orders.total_count, orders };
}
