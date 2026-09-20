import type { GraphQLClient } from "graphql-request";
import { BROWSE_CATEGORIES_QUERY } from "../magento/queries.js";

// No inputs: the tool returns the whole shallow category tree.
export const browseCategoriesSchema = {};

interface RawCategory {
  uid: string;
  name: string;
  level: number;
  product_count: number;
  url_path: string | null;
  include_in_menu?: number | null;
  children?: RawCategory[];
}

interface BrowseCategoriesResponse {
  categoryList: RawCategory[];
}

interface CategoryNode {
  uid: string;
  name: string;
  product_count: number;
  url_path: string | null;
  children: CategoryNode[];
}

function shape(cat: RawCategory): CategoryNode {
  return {
    uid: cat.uid,
    name: cat.name,
    product_count: cat.product_count,
    url_path: cat.url_path,
    children: (cat.children ?? []).map(shape),
  };
}

export async function browseCategories(client: GraphQLClient) {
  const data =
    await client.request<BrowseCategoriesResponse>(BROWSE_CATEGORIES_QUERY);

  // categoryList returns the store root(s); expose their children as the
  // top-level departments so the agent doesn't have to reason about the root.
  const roots = data.categoryList ?? [];
  const departments = roots.flatMap((root) => (root.children ?? []).map(shape));

  return {
    note: "Use a category `uid` with get_category_products to list its products.",
    departments,
  };
}
