import { z } from "zod";
import { ClientError, type GraphQLClient } from "graphql-request";
import { GET_REQUISITION_LISTS_QUERY } from "../magento/queries.js";
import { authHeaders } from "../magento/session.js";

export const getRequisitionListsSchema = {
  session_id: z
    .string()
    .min(1)
    .describe("The session_id returned by login."),
};

interface GetRequisitionListsResponse {
  customer: {
    requisition_lists: Array<{
      id: number;
      name: string | null;
      description: string | null;
      created_at: string | null;
      items: Array<{
        product_id: number | null;
        sku: string | null;
        name: string | null;
        qty: number | null;
      }> | null;
    }> | null;
  };
}

/**
 * Returns the authenticated customer's B2B requisition lists (saved lists for
 * repeat ordering). Requires the store to have the Orangecat B2B suite +
 * Orangecat_ProductListsGraphQl; on stores without it, the field won't exist
 * and we say so clearly rather than erroring.
 */
export async function getRequisitionLists(
  client: GraphQLClient,
  args: { session_id: string },
) {
  let data: GetRequisitionListsResponse;
  try {
    data = await client.request<GetRequisitionListsResponse>(
      GET_REQUISITION_LISTS_QUERY,
      {},
      authHeaders(args.session_id),
    );
  } catch (error) {
    const errors = error instanceof ClientError ? (error.response.errors ?? []) : [];
    if (
      errors.some(
        (e) =>
          /cannot query field/i.test(e.message) &&
          /requisition_lists/i.test(e.message),
      )
    ) {
      return {
        supported: false,
        note: "This store does not expose requisition lists over GraphQL (Orangecat_ProductListsGraphQl is not installed).",
      };
    }
    throw error;
  }

  const lists = data.customer.requisition_lists ?? [];
  return {
    supported: true,
    count: lists.length,
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      created_at: l.created_at,
      items: (l.items ?? []).map((i) => ({
        sku: i.sku,
        name: i.name,
        qty: i.qty,
      })),
    })),
  };
}
