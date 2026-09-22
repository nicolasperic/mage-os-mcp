import { describe, it, expect, vi } from "vitest";
import { ClientError } from "graphql-request";
import { getRequisitionLists } from "../dist/tools/getRequisitionLists.js";

describe("getRequisitionLists", () => {
  it("shapes lists and their items when present", async () => {
    const request = vi.fn().mockResolvedValue({
      customer: {
        requisition_lists: [
          {
            id: 1,
            name: "Monthly Reorder",
            description: "Recurring gym supplies",
            created_at: "2026-09-20 20:58:07",
            items: [
              { product_id: 8, sku: "24-WB01", name: "Voyage Yoga Bag", qty: 3 },
              { product_id: 1, sku: "24-MB01", name: "Joust Duffle Bag", qty: 1 },
            ],
          },
        ],
      },
    });
    const { storeToken } = await import("../dist/magento/session.js");
    const session_id = storeToken("tok");

    const out = await getRequisitionLists({ request } as any, { session_id });
    expect(out.supported).toBe(true);
    expect(out.count).toBe(1);
    expect(out.lists[0]).toMatchObject({ id: 1, name: "Monthly Reorder" });
    expect(out.lists[0].items[0]).toEqual({ sku: "24-WB01", name: "Voyage Yoga Bag", qty: 3 });
    // sends an auth header from the session
    expect(request.mock.calls[0][2]).toEqual({ Authorization: "Bearer tok" });
  });

  it("reports supported:false when the B2B field is absent", async () => {
    const request = vi.fn().mockRejectedValue(
      new ClientError(
        { errors: [{ message: 'Cannot query field "requisition_lists" on type "Customer".' }], status: 400, headers: {} as any },
        { query: "" },
      ),
    );
    const { storeToken } = await import("../dist/magento/session.js");
    const session_id = storeToken("tok");
    const out = await getRequisitionLists({ request } as any, { session_id });
    expect(out).toMatchObject({ supported: false });
  });

  it("returns an empty list set cleanly", async () => {
    const request = vi.fn().mockResolvedValue({ customer: { requisition_lists: [] } });
    const { storeToken } = await import("../dist/magento/session.js");
    const session_id = storeToken("tok");
    const out = await getRequisitionLists({ request } as any, { session_id });
    expect(out).toMatchObject({ supported: true, count: 0, lists: [] });
  });
});
