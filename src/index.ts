#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createGraphQLClient } from "./magento/client.js";
import { searchProducts, searchProductsSchema } from "./tools/searchProducts.js";
import { getProduct, getProductSchema } from "./tools/getProduct.js";
import { checkStock, checkStockSchema } from "./tools/checkStock.js";
import {
  browseCategories,
  browseCategoriesSchema,
} from "./tools/browseCategories.js";
import {
  getCategoryProducts,
  getCategoryProductsSchema,
} from "./tools/getCategoryProducts.js";

/**
 * mage-os-mcp — an MCP server that lets AI agents shop and query a
 * Magento / Mage-OS store over the storefront GraphQL API.
 */
async function main() {
  const config = loadConfig();
  const client = createGraphQLClient(config);

  const server = new McpServer({
    name: "mage-os-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Search the store catalog by free-text term. Returns matching products " +
        "with SKU, name, price, stock status and image. Use this to discover " +
        "products before fetching full details with get_product.",
      inputSchema: searchProductsSchema,
    },
    async (args) => {
      const result = await searchProducts(client, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product details",
      description:
        "Fetch full details for a single product by its exact SKU: description, " +
        "pricing (incl. discounts), stock, categories and images.",
      inputSchema: getProductSchema,
    },
    async (args) => {
      const result = await getProduct(client, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "check_stock",
    {
      title: "Check stock",
      description:
        "Check availability for one or more products by SKU. Returns, per SKU, " +
        "whether it was found, whether it is in stock, and the remaining " +
        "quantity when the store exposes a low-stock threshold. Use this to " +
        "confirm availability before recommending or ordering items.",
      inputSchema: checkStockSchema,
    },
    async (args) => {
      const result = await checkStock(client, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "browse_categories",
    {
      title: "Browse categories",
      description:
        "Return the store's category tree (departments and their subcategories) " +
        "with product counts. Use this to discover how the catalog is organized, " +
        "then pass a category `uid` to get_category_products to list its items.",
      inputSchema: browseCategoriesSchema,
    },
    async () => {
      const result = await browseCategories(client);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_category_products",
    {
      title: "Get category products",
      description:
        "List products within a category by its `uid` (from browse_categories), " +
        "with pagination and sorting. Use this to show what's available in a " +
        "department, e.g. everything in 'Bags'.",
      inputSchema: getCategoryProductsSchema,
    },
    async (args) => {
      const result = await getCategoryProducts(client, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr is safe for logging; stdout is reserved for the MCP protocol.
  console.error(
    `mage-os-mcp connected to ${config.graphqlEndpoint} (store: ${config.storeCode})`,
  );
}

main().catch((error) => {
  console.error("Fatal error starting mage-os-mcp:", error);
  process.exit(1);
});
