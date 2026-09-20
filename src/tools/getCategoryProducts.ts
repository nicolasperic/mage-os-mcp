import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { GET_CATEGORY_PRODUCTS_QUERY } from "../magento/queries.js";

export const getCategoryProductsSchema = {
  category_uid: z
    .string()
    .min(1)
    .describe(
      "The category `uid` to list products for (obtain it from browse_categories).",
    ),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("How many products to return (1-50, default 10)."),
  currentPage: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("Page number for pagination (default 1)."),
  sort: z
    .enum(["position", "price_asc", "price_desc", "name_asc"])
    .default("position")
    .describe("Result ordering. 'position' is the merchandised category order."),
};

const SORT_MAP: Record<string, Record<string, "ASC" | "DESC">> = {
  position: { position: "ASC" },
  price_asc: { price: "ASC" },
  price_desc: { price: "DESC" },
  name_asc: { name: "ASC" },
};

interface CategoryProductsResponse {
  products: {
    total_count: number;
    page_info: { current_page: number; total_pages: number };
    items: Array<{
      sku: string;
      name: string;
      stock_status: string | null;
      url_key: string | null;
      small_image: { url: string | null } | null;
      price_range: {
        minimum_price: {
          final_price: { value: number | null; currency: string | null };
        };
      };
    }>;
  };
}

export async function getCategoryProducts(
  client: GraphQLClient,
  args: {
    category_uid: string;
    pageSize: number;
    currentPage: number;
    sort: string;
  },
) {
  const data = await client.request<CategoryProductsResponse>(
    GET_CATEGORY_PRODUCTS_QUERY,
    {
      uid: args.category_uid,
      pageSize: args.pageSize,
      currentPage: args.currentPage,
      sort: SORT_MAP[args.sort],
    },
  );

  const { total_count, page_info, items } = data.products;

  return {
    category_uid: args.category_uid,
    total_count,
    page: page_info.current_page,
    total_pages: page_info.total_pages,
    results: items.map((item) => ({
      sku: item.sku,
      name: item.name,
      price: item.price_range.minimum_price.final_price.value,
      currency: item.price_range.minimum_price.final_price.currency,
      in_stock: item.stock_status === "IN_STOCK",
      url_key: item.url_key,
      image: item.small_image?.url ?? null,
    })),
  };
}
