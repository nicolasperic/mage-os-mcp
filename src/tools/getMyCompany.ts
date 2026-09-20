import { z } from "zod";
import { ClientError, type GraphQLClient } from "graphql-request";
import { GET_MY_COMPANY_QUERY } from "../magento/queries.js";
import { authHeaders } from "../magento/session.js";

export const getMyCompanySchema = {
  session_id: z
    .string()
    .min(1)
    .describe("The session_id returned by login."),
};

interface GetMyCompanyResponse {
  company: {
    id: number;
    name: string;
    legal_name: string | null;
    email: string | null;
    vat_tax_id: string | null;
    city: string | null;
    region: string | null;
    country_code: string | null;
    telephone: string | null;
    is_company_admin: boolean | null;
    role_id: number | null;
    users: Array<{
      firstname: string | null;
      lastname: string | null;
      email: string | null;
      role_id: number | null;
      is_company_admin: boolean | null;
    }> | null;
  } | null;
}

/**
 * Returns the authenticated customer's B2B company. Requires the store to have
 * the Orangecat B2B suite + Orangecat_CompanyGraphQl installed; on stores
 * without it, the `company` field won't exist and we say so clearly.
 */
export async function getMyCompany(
  client: GraphQLClient,
  args: { session_id: string },
) {
  let data: GetMyCompanyResponse;
  try {
    data = await client.request<GetMyCompanyResponse>(
      GET_MY_COMPANY_QUERY,
      {},
      authHeaders(args.session_id),
    );
  } catch (error) {
    // A missing `company` field means the B2B GraphQL module isn't installed.
    // Match on the raw error messages (not a stringified blob, whose escaped
    // quotes would defeat the pattern).
    const errors = error instanceof ClientError ? (error.response.errors ?? []) : [];
    if (
      errors.some(
        (e) => /cannot query field/i.test(e.message) && /company/i.test(e.message),
      )
    ) {
      return {
        supported: false,
        note: "This store does not expose B2B company data over GraphQL (Orangecat_CompanyGraphQl is not installed).",
      };
    }
    throw error;
  }

  if (!data.company) {
    return {
      supported: true,
      has_company: false,
      note: "The authenticated customer does not belong to a company.",
    };
  }

  const c = data.company;
  return {
    supported: true,
    has_company: true,
    company: {
      id: c.id,
      name: c.name,
      legal_name: c.legal_name,
      email: c.email,
      vat_tax_id: c.vat_tax_id,
      city: c.city,
      region: c.region,
      country_code: c.country_code,
      telephone: c.telephone,
      is_company_admin: c.is_company_admin,
      role_id: c.role_id,
      users: (c.users ?? []).map((u) => ({
        name: [u.firstname, u.lastname].filter(Boolean).join(" ") || null,
        email: u.email,
        role_id: u.role_id,
        is_company_admin: u.is_company_admin,
      })),
    },
  };
}
