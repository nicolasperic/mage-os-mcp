import { z } from "zod";
import { revokeSession } from "../magento/session.js";

export const logoutSchema = {
  session_id: z
    .string()
    .min(1)
    .describe("The session_id to revoke."),
};

/**
 * Revoke a session. After this, the session_id can no longer be used — any tool
 * call with it fails until the customer logs in again. This is the client-side
 * half of the model's "authority is revocable" principle.
 */
export async function logout(args: { session_id: string }) {
  const revoked = await revokeSession(args.session_id);
  return {
    revoked,
    note: revoked
      ? "Session revoked. This session_id is no longer valid."
      : "No active session for that id (already expired or revoked).",
  };
}
