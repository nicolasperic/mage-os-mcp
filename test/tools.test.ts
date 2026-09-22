import { describe, it, expect, vi } from "vitest";
import { ClientError } from "graphql-request";
import { searchProducts } from "../dist/tools/searchProducts.js";
import { getProduct } from "../dist/tools/getProduct.js";
import { checkStock } from "../dist/tools/checkStock.js";
import { browseCategories } from "../dist/tools/browseCategories.js";
import { getCategoryProducts } from "../dist/tools/getCategoryProducts.js";
import { addToCart } from "../dist/tools/addToCart.js";
import { login } from "../dist/tools/login.js";
import { getCustomer } from "../dist/tools/getCustomer.js";
import { getOrderStatus } from "../dist/tools/getOrderStatus.js";
import { getMyCompany } from "../dist/tools/getMyCompany.js";

/** A GraphQLClient whose `request` is a mock we control. */
function mockClient(response: unknown) {
  const request = vi.fn().mockResolvedValue(response);
  return { client: { request } as any, request };
}

describe("searchProducts", () => {
  it("maps items and derives in_stock, and passes the sort variable", async () => {
    const { client, request } = mockClient({
      products: {
        total_count: 1,
        page_info: { current_page: 1, page_size: 10, total_pages: 1 },
        items: [
          {
            sku: "MT11",
            name: "Atlas Fitness Tank",
            stock_status: "IN_STOCK",
            url_key: "atlas-fitness-tank",
            small_image: { url: "http://img/mt11.jpg" },
            price_range: {
              minimum_price: { final_price: { value: 18, currency: "USD" } },
            },
          },
        ],
      },
    });

    const out = await searchProducts(client, {
      search: "tank",
      pageSize: 10,
      currentPage: 1,
      sort: "price_asc",
    });

    expect(out.total_count).toBe(1);
    expect(out.results[0]).toEqual({
      sku: "MT11",
      name: "Atlas Fitness Tank",
      price: 18,
      currency: "USD",
      in_stock: true,
      url_key: "atlas-fitness-tank",
      image: "http://img/mt11.jpg",
    });
    // price_asc must translate to a { price: "ASC" } sort variable.
    expect(request.mock.calls[0][1].sort).toEqual({ price: "ASC" });
  });

  it("sends no sort variable for relevance ordering", async () => {
    const { client, request } = mockClient({
      products: {
        total_count: 0,
        page_info: { current_page: 1, page_size: 10, total_pages: 0 },
        items: [],
      },
    });
    await searchProducts(client, {
      search: "x",
      pageSize: 10,
      currentPage: 1,
      sort: "relevance",
    });
    expect(request.mock.calls[0][1].sort).toBeUndefined();
  });
});

describe("getProduct", () => {
  it("strips HTML and shapes the product when found", async () => {
    const { client } = mockClient({
      products: {
        items: [
          {
            sku: "24-WB01",
            name: "Voyage Yoga Bag",
            stock_status: "IN_STOCK",
            only_x_left_in_stock: null,
            url_key: "voyage-yoga-bag",
            description: { html: "<p>Spacious <b>bag</b>.</p>" },
            short_description: { html: null },
            image: { url: "http://img/wb01.jpg", label: "bag" },
            media_gallery: [{ url: "http://img/wb01.jpg", label: "bag" }],
            categories: [{ name: "Gear", url_path: "gear" }, { name: "Bags", url_path: "gear/bags" }],
            price_range: {
              minimum_price: {
                final_price: { value: 32, currency: "USD" },
                regular_price: { value: 32, currency: "USD" },
                discount: { amount_off: 0, percent_off: 0 },
              },
            },
          },
        ],
      },
    });

    const out = await getProduct(client, { sku: "24-WB01" });
    expect(out.found).toBe(true);
    // HTML tags are stripped to readable text (inline tags become spaces).
    expect(out.description).toContain("Spacious bag");
    expect(out.description).not.toContain("<");
    expect(out.categories).toEqual(["Gear", "Bags"]);
    expect(out.price).toEqual({
      final: 32,
      regular: 32,
      currency: "USD",
      percent_off: 0,
    });
  });

  it("returns found:false when no product matches", async () => {
    const { client } = mockClient({ products: { items: [] } });
    const out = await getProduct(client, { sku: "NOPE" });
    expect(out).toEqual({ found: false, sku: "NOPE" });
  });
});

describe("checkStock", () => {
  it("preserves request order and flags SKUs that were not found", async () => {
    const { client } = mockClient({
      products: {
        items: [
          { sku: "24-MB01", name: "Joust Duffle Bag", stock_status: "IN_STOCK", only_x_left_in_stock: null },
          { sku: "24-WB01", name: "Voyage Yoga Bag", stock_status: "OUT_OF_STOCK", only_x_left_in_stock: 0 },
        ],
      },
    });

    const out = await checkStock(client, { skus: ["24-WB01", "NOPE", "24-MB01"] });
    expect(out.results.map((r: any) => r.sku)).toEqual(["24-WB01", "NOPE", "24-MB01"]);
    expect(out.results[0]).toMatchObject({ sku: "24-WB01", found: true, in_stock: false });
    expect(out.results[1]).toEqual({ sku: "NOPE", found: false, in_stock: false, only_x_left_in_stock: null });
    expect(out.results[2]).toMatchObject({ sku: "24-MB01", found: true, in_stock: true });
  });
});

describe("browseCategories", () => {
  it("exposes the root's children as top-level departments", async () => {
    const { client } = mockClient({
      categoryList: [
        {
          uid: "root",
          name: "Default Category",
          level: 1,
          product_count: 0,
          url_path: null,
          children: [
            {
              uid: "Mw==",
              name: "Gear",
              level: 2,
              product_count: 33,
              url_path: "gear",
              children: [
                { uid: "MTM=", name: "Bags", level: 3, product_count: 14, url_path: "gear/bags" },
              ],
            },
          ],
        },
      ],
    });

    const out = await browseCategories(client);
    expect(out.departments).toHaveLength(1);
    expect(out.departments[0]).toMatchObject({ uid: "Mw==", name: "Gear", product_count: 33 });
    expect(out.departments[0].children[0]).toMatchObject({ uid: "MTM=", name: "Bags" });
  });
});

describe("getCategoryProducts", () => {
  it("passes the category uid + sort and maps results", async () => {
    const { client, request } = mockClient({
      products: {
        total_count: 1,
        page_info: { current_page: 1, total_pages: 1 },
        items: [
          {
            sku: "WS12",
            name: "Radiant Tee",
            stock_status: "IN_STOCK",
            url_key: "radiant-tee",
            small_image: { url: "http://img/ws12.jpg" },
            price_range: { minimum_price: { final_price: { value: 22, currency: "USD" } } },
          },
        ],
      },
    });

    const out = await getCategoryProducts(client, {
      category_uid: "MjE=",
      pageSize: 10,
      currentPage: 1,
      sort: "position",
    });

    expect(request.mock.calls[0][1]).toMatchObject({ uid: "MjE=", sort: { position: "ASC" } });
    expect(out.results[0]).toMatchObject({ sku: "WS12", price: 22, in_stock: true });
  });
});

describe("addToCart", () => {
  it("reports user_errors without failing the call", async () => {
    const { client } = mockClient({
      addProductsToCart: {
        cart: {
          id: "cart1",
          total_quantity: 0,
          items: [],
          prices: {
            subtotal_excluding_tax: { value: 0, currency: "USD" },
            grand_total: { value: 0, currency: "USD" },
          },
        },
        user_errors: [{ code: "PRODUCT_NOT_FOUND", message: "Could not find a product with SKU \"NOPE\"" }],
      },
    });

    const out = await addToCart(client, { cart_id: "cart1", items: [{ sku: "NOPE", quantity: 1 }] });
    expect(out.added).toBe(false);
    expect(out.user_errors[0].code).toBe("PRODUCT_NOT_FOUND");
    expect(out.cart.cart_id).toBe("cart1");
  });
});

describe("login", () => {
  it("stores the token server-side and returns a session_id, not the token", async () => {
    const { client } = mockClient({ generateCustomerToken: { token: "SECRET" } });
    const out = await login(client, { email: "a@b.com", password: "pw" });
    expect(out.success).toBe(true);
    expect(out.session_id).toBeTruthy();
    expect(JSON.stringify(out)).not.toContain("SECRET");
  });

  it("returns success:false with the message on invalid credentials", async () => {
    const request = vi.fn().mockRejectedValue(
      new ClientError(
        { errors: [{ message: "The account sign-in was incorrect" }], status: 200, headers: {} as any },
        { query: "" },
      ),
    );
    const out = await login({ request } as any, { email: "a@b.com", password: "bad" });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/sign-in was incorrect/);
  });
});

describe("getCustomer", () => {
  it("shapes profile and addresses and sends an auth header", async () => {
    const request = vi.fn().mockResolvedValue({
      customer: {
        firstname: "Veronica",
        lastname: "Costello",
        email: "roni_cost@example.com",
        addresses: [
          {
            firstname: "Veronica",
            lastname: "Costello",
            street: ["6146 Honey Bluff Parkway"],
            city: "Calder",
            region: { region: "Michigan" },
            postcode: "49628-7978",
            country_code: "US",
            telephone: "(555) 229-3326",
            default_shipping: true,
            default_billing: true,
          },
        ],
      },
    });
    const { storeToken } = await import("../dist/magento/session.js");
    const session_id = await storeToken("tok");

    const out = await getCustomer({ request } as any, { session_id });
    expect(out.firstname).toBe("Veronica");
    expect(out.addresses[0]).toMatchObject({ name: "Veronica Costello", region: "Michigan", default_shipping: true });
    // third arg is the per-request auth header
    expect(request.mock.calls[0][2]).toEqual({ Authorization: "Bearer tok" });
  });
});

describe("getOrderStatus", () => {
  const ordersResponse = {
    customer: {
      orders: {
        total_count: 1,
        items: [
          {
            number: "000000001",
            order_date: "20/09/2026 06:29:02",
            status: "Processing",
            total: { grand_total: { value: 36.39, currency: "USD" } },
            items: [{ product_name: "Iris Workout Top", product_sku: "WS03-XS-Red", quantity_ordered: 1 }],
            shipments: [],
          },
        ],
      },
    },
  };

  it("maps orders and applies a number filter when order_number is given", async () => {
    const request = vi.fn().mockResolvedValue(ordersResponse);
    const { storeToken } = await import("../dist/magento/session.js");
    const session_id = await storeToken("tok");

    const out = await getOrderStatus({ request } as any, { session_id, order_number: "000000001", pageSize: 10 });
    expect(out.orders[0]).toMatchObject({ number: "000000001", status: "Processing", grand_total: 36.39 });
    expect(request.mock.calls[0][1].filter).toEqual({ number: { eq: "000000001" } });
  });

  it("sends no filter when listing recent orders", async () => {
    const request = vi.fn().mockResolvedValue(ordersResponse);
    const { storeToken } = await import("../dist/magento/session.js");
    const session_id = await storeToken("tok");
    await getOrderStatus({ request } as any, { session_id, pageSize: 10 });
    expect(request.mock.calls[0][1].filter).toBeUndefined();
  });
});

describe("getMyCompany", () => {
  it("shapes the company + roster when present", async () => {
    const request = vi.fn().mockResolvedValue({
      company: {
        id: 1,
        name: "Costello Industries",
        legal_name: "Costello Industries LLC",
        email: "purchasing@costello.example",
        vat_tax_id: "US-VAT-99881",
        city: "Calder",
        region: "Michigan",
        country_code: "US",
        telephone: "(555) 229-3326",
        is_company_admin: true,
        role_id: 1,
        users: [
          { firstname: "Veronica", lastname: "Costello", email: "roni_cost@example.com", role_id: 1, is_company_admin: true },
        ],
      },
    });
    const { storeToken } = await import("../dist/magento/session.js");
    const session_id = await storeToken("tok");

    const out = await getMyCompany({ request } as any, { session_id });
    expect(out).toMatchObject({ supported: true, has_company: true });
    expect(out.company.name).toBe("Costello Industries");
    expect(out.company.users[0]).toMatchObject({ name: "Veronica Costello", is_company_admin: true });
  });

  it("reports supported:false when the B2B GraphQL field is absent", async () => {
    const request = vi.fn().mockRejectedValue(
      new ClientError(
        { errors: [{ message: 'Cannot query field "company" on type "Query".' }], status: 400, headers: {} as any },
        { query: "" },
      ),
    );
    const { storeToken } = await import("../dist/magento/session.js");
    const session_id = await storeToken("tok");
    const out = await getMyCompany({ request } as any, { session_id });
    expect(out).toMatchObject({ supported: false });
  });

  it("reports has_company:false when the customer has no company", async () => {
    const request = vi.fn().mockResolvedValue({ company: null });
    const { storeToken } = await import("../dist/magento/session.js");
    const session_id = await storeToken("tok");
    const out = await getMyCompany({ request } as any, { session_id });
    expect(out).toMatchObject({ supported: true, has_company: false });
  });
});

describe("login", () => {
  it("returns a string session_id (awaited), usable by later tools", async () => {
    const request = vi.fn().mockResolvedValue({ generateCustomerToken: { token: "TOK-1" } });
    const out = await login({ request } as any, { email: "a@b.com", password: "pw" });
    expect(out.success).toBe(true);
    expect(typeof out.session_id).toBe("string");
    // the returned session resolves to the stored bearer
    const { getToken } = await import("../dist/magento/session.js");
    expect(await getToken(out.session_id as string)).toBe("TOK-1");
  });

  it("returns success:false with a message on bad credentials", async () => {
    const request = vi.fn().mockRejectedValue(
      new ClientError(
        { errors: [{ message: "The account sign-in was incorrect" }], status: 200, headers: {} as any },
        { query: "" },
      ),
    );
    const out = await login({ request } as any, { email: "a@b.com", password: "bad" });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/incorrect/);
  });
});
