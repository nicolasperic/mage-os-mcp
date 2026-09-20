import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { GET_CUSTOMER_QUERY } from "../magento/queries.js";
import { authHeaders } from "../magento/session.js";

export const getCustomerSchema = {
  session_id: z
    .string()
    .min(1)
    .describe("The session_id returned by login."),
};

interface GetCustomerResponse {
  customer: {
    firstname: string;
    lastname: string;
    email: string;
    addresses: Array<{
      firstname: string | null;
      lastname: string | null;
      street: string[] | null;
      city: string | null;
      region: { region: string | null } | null;
      postcode: string | null;
      country_code: string | null;
      telephone: string | null;
      default_shipping: boolean | null;
      default_billing: boolean | null;
    }>;
  };
}

export async function getCustomer(
  client: GraphQLClient,
  args: { session_id: string },
) {
  const data = await client.request<GetCustomerResponse>(
    GET_CUSTOMER_QUERY,
    {},
    authHeaders(args.session_id),
  );

  const c = data.customer;
  return {
    firstname: c.firstname,
    lastname: c.lastname,
    email: c.email,
    addresses: (c.addresses ?? []).map((a) => ({
      name: [a.firstname, a.lastname].filter(Boolean).join(" ") || null,
      street: (a.street ?? []).join(", "),
      city: a.city,
      region: a.region?.region ?? null,
      postcode: a.postcode,
      country_code: a.country_code,
      telephone: a.telephone,
      default_shipping: a.default_shipping ?? false,
      default_billing: a.default_billing ?? false,
    })),
  };
}
