import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { SEARCH_PRODUCTS_QUERY } from "../magento/queries.js";
import {
  defaultPriceContext,
  money,
  tierPricing,
  type PriceContext,
} from "../magento/price.js";

export const searchProductsSchema = {
  search: z
    .string()
    .min(1)
    .describe("Free-text search term, e.g. 'jacket' or 'yoga pants'."),
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
    .enum(["relevance", "price_asc", "price_desc", "name_asc"])
    .default("relevance")
    .describe("Result ordering."),
};

const SORT_MAP: Record<string, Record<string, "ASC" | "DESC"> | undefined> = {
  relevance: undefined,
  price_asc: { price: "ASC" },
  price_desc: { price: "DESC" },
  name_asc: { name: "ASC" },
};

interface SearchResponse {
  products: {
    total_count: number;
    page_info: { current_page: number; page_size: number; total_pages: number };
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
      price_tiers: Array<{
        quantity: number | null;
        final_price: { value: number | null; currency: string | null } | null;
        discount: { percent_off: number | null } | null;
      }> | null;
    }>;
  };
}

export async function searchProducts(
  client: GraphQLClient,
  args: {
    search: string;
    pageSize: number;
    currentPage: number;
    sort: string;
  },
  priceCtx: PriceContext = defaultPriceContext(),
) {
  const data = await client.request<SearchResponse>(SEARCH_PRODUCTS_QUERY, {
    search: args.search,
    pageSize: args.pageSize,
    currentPage: args.currentPage,
    sort: SORT_MAP[args.sort],
  });

  const { total_count, page_info, items } = data.products;

  const results = items.map((item) => {
    const min = item.price_range.minimum_price.final_price;
    return {
      sku: item.sku,
      name: item.name,
      price: money(min.value, min.currency, priceCtx),
      tier_pricing: tierPricing(item.price_tiers, priceCtx),
      in_stock: item.stock_status === "IN_STOCK",
      url_key: item.url_key,
      image: item.small_image?.url ?? null,
    };
  });

  return {
    query: args.search,
    total_count,
    page: page_info.current_page,
    total_pages: page_info.total_pages,
    results,
  };
}
