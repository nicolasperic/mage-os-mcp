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
