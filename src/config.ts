import "dotenv/config";

/**
 * Runtime configuration, sourced from environment variables.
 * See .env.example for the full list and defaults.
 */
export interface Config {
  baseUrl: string;
  graphqlEndpoint: string;
  storeCode: string;
  insecureTls: boolean;
  timeoutMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

export function loadConfig(): Config {
  const baseUrl = requireEnv("MAGENTO_BASE_URL").replace(/\/+$/, "");
  return {
    baseUrl,
    graphqlEndpoint: `${baseUrl}/graphql`,
    storeCode: process.env.MAGENTO_STORE_CODE?.trim() || "default",
    insecureTls: process.env.MAGENTO_INSECURE_TLS?.trim() === "true",
    timeoutMs: Number(process.env.MAGENTO_TIMEOUT_MS) || 15000,
  };
}
