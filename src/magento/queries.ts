import { gql } from "graphql-request";

/**
 * GraphQL documents used by the storefront tools. Kept in one place so the
 * shape of what we ask Magento for is easy to review and extend.
 */

export const SEARCH_PRODUCTS_QUERY = gql`
  query SearchProducts(
    $search: String!
    $pageSize: Int!
    $currentPage: Int!
    $sort: ProductAttributeSortInput
  ) {
    products(
      search: $search
      pageSize: $pageSize
      currentPage: $currentPage
      sort: $sort
    ) {
      total_count
      page_info {
        current_page
        page_size
        total_pages
      }
      items {
        sku
        name
        stock_status
        url_key
        small_image {
          url
        }
        price_range {
          minimum_price {
            final_price {
              value
              currency
            }
          }
        }
      }
    }
  }
`;

// Shared cart selection, reused across the cart mutation/query so the shape
// returned to the agent is always identical.
const CART_FIELDS = gql`
  fragment CartFields on Cart {
    id
    total_quantity
    items {
      uid
      quantity
      product {
        sku
        name
      }
      prices {
        row_total {
          value
          currency
        }
      }
    }
    prices {
      subtotal_excluding_tax {
        value
        currency
      }
      grand_total {
        value
        currency
      }
    }
  }
`;

export const CREATE_GUEST_CART_MUTATION = gql`
  mutation CreateGuestCart {
    createGuestCart {
      cart {
        id
      }
    }
  }
`;

export const ADD_TO_CART_MUTATION = gql`
  mutation AddToCart($cartId: String!, $cartItems: [CartItemInput!]!) {
    addProductsToCart(cartId: $cartId, cartItems: $cartItems) {
      cart {
        ...CartFields
      }
      user_errors {
        code
        message
      }
    }
  }
  ${CART_FIELDS}
`;

export const VIEW_CART_QUERY = gql`
  query ViewCart($cartId: String!) {
    cart(cart_id: $cartId) {
      ...CartFields
    }
  }
  ${CART_FIELDS}
`;

// --- Checkout (guest) ---
// GraphQL executes root mutation fields serially in document order, so we can
// set the guest email, shipping address and billing address in one round trip.
export const SET_SHIPPING_ADDRESS_MUTATION = gql`
  mutation SetShippingAddress(
    $cartId: String!
    $email: String!
    $address: CartAddressInput!
  ) {
    setGuestEmailOnCart(input: { cart_id: $cartId, email: $email }) {
      cart {
        id
      }
    }
    setShippingAddressesOnCart(
      input: { cart_id: $cartId, shipping_addresses: [{ address: $address }] }
    ) {
      cart {
        shipping_addresses {
          available_shipping_methods {
            carrier_code
            method_code
            carrier_title
            method_title
            available
            amount {
              value
              currency
            }
          }
        }
      }
    }
    setBillingAddressOnCart(
      input: { cart_id: $cartId, billing_address: { address: $address } }
    ) {
      cart {
        id
      }
    }
  }
`;

export const SET_SHIPPING_METHOD_MUTATION = gql`
  mutation SetShippingMethod(
    $cartId: String!
    $carrier: String!
    $method: String!
  ) {
    setShippingMethodsOnCart(
      input: {
        cart_id: $cartId
        shipping_methods: [{ carrier_code: $carrier, method_code: $method }]
      }
    ) {
      cart {
        available_payment_methods {
          code
          title
        }
        prices {
          subtotal_excluding_tax {
            value
            currency
          }
          grand_total {
            value
            currency
          }
        }
      }
    }
  }
`;

export const SET_PAYMENT_METHOD_MUTATION = gql`
  mutation SetPaymentMethod($cartId: String!, $code: String!) {
    setPaymentMethodOnCart(
      input: { cart_id: $cartId, payment_method: { code: $code } }
    ) {
      cart {
        selected_payment_method {
          code
          title
        }
        prices {
          subtotal_excluding_tax {
            value
            currency
          }
          grand_total {
            value
            currency
          }
        }
      }
    }
  }
`;

export const PLACE_ORDER_MUTATION = gql`
  mutation PlaceOrder($cartId: String!) {
    placeOrder(input: { cart_id: $cartId }) {
      order {
        order_number
      }
    }
  }
`;

export const GENERATE_TOKEN_MUTATION = gql`
  mutation GenerateCustomerToken($email: String!, $password: String!) {
    generateCustomerToken(email: $email, password: $password) {
      token
    }
  }
`;

// Requires the Orangecat B2B suite + the Orangecat_CompanyGraphQl companion
// module (https://github.com/nicolasperic/mage-os-b2b-graphql) on the store.
export const GET_MY_COMPANY_QUERY = gql`
  query GetMyCompany {
    company {
      id
      name
      legal_name
      email
      vat_tax_id
      city
      region
      country_code
      telephone
      is_company_admin
      role_id
      users {
        firstname
        lastname
        email
        role_id
        is_company_admin
      }
    }
  }
`;

// Requires the Orangecat B2B suite + Orangecat_ProductListsGraphQl companion
// module on the store.
export const GET_REQUISITION_LISTS_QUERY = gql`
  query GetRequisitionLists {
    customer {
      requisition_lists {
        id
        name
        description
        created_at
        items {
          product_id
          sku
          name
          qty
        }
      }
    }
  }
`;

export const GET_CUSTOMER_QUERY = gql`
  query GetCustomer {
    customer {
      firstname
      lastname
      email
      addresses {
        firstname
        lastname
        street
        city
        region {
          region
        }
        postcode
        country_code
        telephone
        default_shipping
        default_billing
      }
    }
  }
`;

export const GET_ORDERS_QUERY = gql`
  query GetOrders($filter: CustomerOrdersFilterInput, $pageSize: Int!) {
    customer {
      orders(filter: $filter, pageSize: $pageSize) {
        total_count
        items {
          number
          order_date
          status
          total {
            grand_total {
              value
              currency
            }
          }
          items {
            product_name
            product_sku
            quantity_ordered
          }
          shipments {
            tracking {
              carrier
              title
              number
            }
          }
        }
      }
    }
  }
`;

export const BROWSE_CATEGORIES_QUERY = gql`
  query BrowseCategories {
    categoryList {
      uid
      name
      level
      product_count
      url_path
      children {
        uid
        name
        level
        product_count
        url_path
        include_in_menu
        children {
          uid
          name
          level
          product_count
          url_path
        }
      }
    }
  }
`;

export const GET_CATEGORY_PRODUCTS_QUERY = gql`
  query GetCategoryProducts(
    $uid: String!
    $pageSize: Int!
    $currentPage: Int!
    $sort: ProductAttributeSortInput
  ) {
    products(
      filter: { category_uid: { eq: $uid } }
      pageSize: $pageSize
      currentPage: $currentPage
      sort: $sort
    ) {
      total_count
      page_info {
        current_page
        total_pages
      }
      items {
        sku
        name
        stock_status
        url_key
        small_image {
          url
        }
        price_range {
          minimum_price {
            final_price {
              value
              currency
            }
          }
        }
      }
    }
  }
`;

export const CHECK_STOCK_QUERY = gql`
  query CheckStock($skus: [String!]!) {
    products(filter: { sku: { in: $skus } }, pageSize: 100) {
      items {
        sku
        name
        stock_status
        only_x_left_in_stock
      }
    }
  }
`;

export const GET_PRODUCT_QUERY = gql`
  query GetProduct($sku: String!) {
    products(filter: { sku: { eq: $sku } }, pageSize: 1) {
      items {
        sku
        name
        stock_status
        only_x_left_in_stock
        url_key
        description {
          html
        }
        short_description {
          html
        }
        image {
          url
          label
        }
        media_gallery {
          url
          label
        }
        categories {
          name
          url_path
        }
        price_range {
          minimum_price {
            final_price {
              value
              currency
            }
            regular_price {
              value
              currency
            }
            discount {
              amount_off
              percent_off
            }
          }
        }
      }
    }
  }
`;
