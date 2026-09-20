import { z } from "zod";
import { ClientError, type GraphQLClient } from "graphql-request";
import { GENERATE_TOKEN_MUTATION } from "../magento/queries.js";
import { storeToken } from "../magento/session.js";

export const loginSchema = {
  email: z.string().email().describe("The customer account email address."),
  password: z.string().min(1).describe("The customer account password."),
};

interface GenerateTokenResponse {
  generateCustomerToken: { token: string };
}

export async function login(
  client: GraphQLClient,
  args: { email: string; password: string },
) {
  try {
    const data = await client.request<GenerateTokenResponse>(
      GENERATE_TOKEN_MUTATION,
      { email: args.email, password: args.password },
    );
    const session_id = storeToken(data.generateCustomerToken.token);
    return {
      success: true,
      session_id,
      note:
        "Pass this session_id to get_customer and get_order_status. The " +
        "credential is stored server-side and is not exposed here.",
    };
  } catch (error) {
    // Invalid credentials are an expected outcome, not a crash — return a
    // clean message and let the agent decide what to do.
    const message =
      error instanceof ClientError
        ? (error.response.errors?.[0]?.message ?? "Authentication failed.")
        : "Authentication failed.";
    return { success: false, error: message };
  }
}
