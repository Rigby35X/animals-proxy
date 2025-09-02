// pages/api/shopify-helpers.js
// Shopify GraphQL API functions

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

if (!SHOP || !TOKEN) {
  throw new Error('Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN environment variables');
}

const GRAPHQL_URL = `https://${SHOP}/admin/api/2024-07/graphql.json`;

async function shopifyGraphQL(query, variables = {}) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  
  if (data.data?.userErrors?.length) {
    throw new Error(`User errors: ${JSON.stringify(data.data.userErrors)}`);
  }

  return data.data;
}

export async function findProductByHandle(handle) {
  const query = `
    query getProduct($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        handle
      }
    }
  `;
  
  const data = await shopifyGraphQL(query, { handle });
  return data.productByHandle;
}

export async function createProduct(productInput) {
  const query = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { input: productInput });
  
  if (data.productCreate.userErrors?.length) {
    throw new Error(`Product create errors: ${JSON.stringify(data.productCreate.userErrors)}`);
  }
  
  return data.productCreate.product;
}

export async function updateProduct(productInput) {
  const query = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { input: productInput });
  
  if (data.productUpdate.userErrors?.length) {
    throw new Error(`Product update errors: ${JSON.stringify(data.productUpdate.userErrors)}`);
  }
  
  return data.productUpdate.product;
}

export async function setMetafields(ownerId, metafieldsArray) {
  const query = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const metafields = metafieldsArray.map(meta => ({
    ownerId,
    namespace: meta.namespace,
    key: meta.key,
    type: meta.type,
    value: meta.value
  }));

  const data = await shopifyGraphQL(query, { metafields });
  
  if (data.metafieldsSet.userErrors?.length) {
    throw new Error(`Metafields errors: ${JSON.stringify(data.metafieldsSet.userErrors)}`);
  }
  
  return data.metafieldsSet.metafields;
}