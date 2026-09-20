import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { GET_PRODUCT_QUERY } from "../magento/queries.js";

export const getProductSchema = {
  sku: z
    .string()
    .min(1)
    .describe("The exact SKU of the product to retrieve."),
};

interface GetProductResponse {
  products: {
    items: Array<{
      sku: string;
      name: string;
      stock_status: string | null;
      only_x_left_in_stock: number | null;
      url_key: string | null;
      description: { html: string | null } | null;
      short_description: { html: string | null } | null;
      image: { url: string | null; label: string | null } | null;
      media_gallery: Array<{ url: string | null; label: string | null }>;
      categories: Array<{ name: string | null; url_path: string | null }> | null;
      price_range: {
        minimum_price: {
          final_price: { value: number | null; currency: string | null };
          regular_price: { value: number | null; currency: string | null };
          discount: {
            amount_off: number | null;
            percent_off: number | null;
          } | null;
        };
      };
    }>;
  };
}

/** Strip HTML tags to give agents clean, readable text. */
function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getProduct(
  client: GraphQLClient,
  args: { sku: string },
) {
  const data = await client.request<GetProductResponse>(GET_PRODUCT_QUERY, {
    sku: args.sku,
  });

  const item = data.products.items[0];
  if (!item) {
    return { found: false, sku: args.sku };
  }

  const min = item.price_range.minimum_price;

  return {
    found: true,
    sku: item.sku,
    name: item.name,
    in_stock: item.stock_status === "IN_STOCK",
    only_x_left_in_stock: item.only_x_left_in_stock,
    price: {
      final: min.final_price.value,
      regular: min.regular_price.value,
      currency: min.final_price.currency,
      percent_off: min.discount?.percent_off ?? null,
    },
    short_description: stripHtml(item.short_description?.html),
    description: stripHtml(item.description?.html),
    categories: (item.categories ?? []).map((c) => c.name).filter(Boolean),
    url_key: item.url_key,
    image: item.image?.url ?? null,
    media_gallery: item.media_gallery.map((m) => m.url).filter(Boolean),
  };
}
