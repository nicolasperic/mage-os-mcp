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
import {
  createGuestCart,
  createGuestCartSchema,
} from "./tools/createGuestCart.js";
import { addToCart, addToCartSchema } from "./tools/addToCart.js";
import { viewCart, viewCartSchema } from "./tools/viewCart.js";
import { login, loginSchema } from "./tools/login.js";
import { getCustomer, getCustomerSchema } from "./tools/getCustomer.js";
import { getOrderStatus, getOrderStatusSchema } from "./tools/getOrderStatus.js";

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

  server.registerTool(
    "create_guest_cart",
    {
      title: "Create guest cart",
      description:
        "Start a new anonymous (guest) shopping cart. Returns a cart_id that " +
        "you must pass to add_to_cart and view_cart. Call this once at the " +
        "start of a shopping session.",
      inputSchema: createGuestCartSchema,
    },
    async () => {
      const result = await createGuestCart(client);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "add_to_cart",
    {
      title: "Add to cart",
      description:
        "Add one or more products (by SKU and quantity) to a guest cart. " +
        "Returns the updated cart with line items and totals. Per-item problems " +
        "(out of stock, unknown SKU, configurable products needing options) are " +
        "reported in user_errors rather than failing the whole call.",
      inputSchema: addToCartSchema,
    },
    async (args) => {
      const result = await addToCart(client, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "view_cart",
    {
      title: "View cart",
      description:
        "View the current contents and totals of a guest cart by its cart_id.",
      inputSchema: viewCartSchema,
    },
    async (args) => {
      const result = await viewCart(client, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "login",
    {
      title: "Log in (customer)",
      description:
        "Authenticate a customer with email and password. Returns a session_id " +
        "to use with get_customer and get_order_status. The credential is stored " +
        "server-side and never returned. Returns success:false with a reason if " +
        "the credentials are wrong.",
      inputSchema: loginSchema,
    },
    async (args) => {
      const result = await login(client, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_customer",
    {
      title: "Get customer profile",
      description:
        "Get the logged-in customer's profile (name, email, saved addresses) " +
        "using a session_id from login.",
      inputSchema: getCustomerSchema,
    },
    async (args) => {
      const result = await getCustomer(client, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_order_status",
    {
      title: "Get order status",
      description:
        "Look up the logged-in customer's orders (status, date, totals, line " +
        "items, tracking) using a session_id from login. Optionally pass an " +
        "order_number to fetch a single order; otherwise the most recent orders " +
        "are returned.",
      inputSchema: getOrderStatusSchema,
    },
    async (args) => {
      const result = await getOrderStatus(client, args);
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
