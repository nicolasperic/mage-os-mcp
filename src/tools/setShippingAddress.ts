import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { SET_SHIPPING_ADDRESS_MUTATION } from "../magento/queries.js";

export const setShippingAddressSchema = {
  cart_id: z
    .string()
    .min(1)
    .describe("The guest cart id returned by create_guest_cart."),
  email: z
    .string()
    .email()
    .describe("Guest email address for the order confirmation."),
  firstname: z.string().min(1).describe("Recipient first name."),
  lastname: z.string().min(1).describe("Recipient last name."),
  street: z.string().min(1).describe("Street address (one line)."),
  city: z.string().min(1).describe("City."),
  region: z
    .string()
    .min(1)
    .describe("State/region code or name, e.g. 'TX' or 'Texas'."),
  postcode: z.string().min(1).describe("ZIP / postal code."),
  country_code: z
    .string()
    .length(2)
    .default("US")
    .describe("Two-letter country code (default 'US')."),
  telephone: z.string().min(1).describe("Contact phone number."),
};

interface SetShippingAddressResponse {
  setShippingAddressesOnCart: {
    cart: {
      shipping_addresses: Array<{
        available_shipping_methods: Array<{
          carrier_code: string;
          method_code: string;
          carrier_title: string | null;
          method_title: string | null;
          available: boolean;
          amount: { value: number | null; currency: string | null };
        }>;
      }>;
    };
  };
}

export async function setShippingAddress(
  client: GraphQLClient,
  args: {
    cart_id: string;
    email: string;
    firstname: string;
    lastname: string;
    street: string;
    city: string;
    region: string;
    postcode: string;
    country_code: string;
    telephone: string;
  },
) {
  const data = await client.request<SetShippingAddressResponse>(
    SET_SHIPPING_ADDRESS_MUTATION,
    {
      cartId: args.cart_id,
      email: args.email,
      address: {
        firstname: args.firstname,
        lastname: args.lastname,
        street: [args.street],
        city: args.city,
        region: args.region,
        postcode: args.postcode,
        country_code: args.country_code,
        telephone: args.telephone,
      },
    },
  );

  const methods =
    data.setShippingAddressesOnCart.cart.shipping_addresses[0]
      ?.available_shipping_methods ?? [];

  return {
    note: "Choose a shipping method with set_shipping_method (pass carrier_code and method_code).",
    available_shipping_methods: methods
      .filter((m) => m.available)
      .map((m) => ({
        carrier_code: m.carrier_code,
        method_code: m.method_code,
        label: [m.carrier_title, m.method_title].filter(Boolean).join(" - "),
        amount: m.amount.value,
        currency: m.amount.currency,
      })),
  };
}
