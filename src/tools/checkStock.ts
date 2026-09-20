import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { CHECK_STOCK_QUERY } from "../magento/queries.js";

export const checkStockSchema = {
  skus: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .describe(
      "One or more exact SKUs to check availability for (up to 100 in a single call).",
    ),
};

interface CheckStockResponse {
  products: {
    items: Array<{
      sku: string;
      name: string;
      stock_status: string | null;
      only_x_left_in_stock: number | null;
    }>;
  };
}

export async function checkStock(
  client: GraphQLClient,
  args: { skus: string[] },
) {
  const data = await client.request<CheckStockResponse>(CHECK_STOCK_QUERY, {
    skus: args.skus,
  });

  const bySku = new Map(data.products.items.map((item) => [item.sku, item]));

  // Preserve the caller's ordering and surface SKUs that weren't found, so the
  // agent gets a definitive answer for every SKU it asked about.
  const results = args.skus.map((sku) => {
    const item = bySku.get(sku);
    if (!item) {
      return { sku, found: false, in_stock: false, only_x_left_in_stock: null };
    }
    return {
      sku: item.sku,
      found: true,
      name: item.name,
      in_stock: item.stock_status === "IN_STOCK",
      only_x_left_in_stock: item.only_x_left_in_stock,
    };
  });

  return { results };
}
