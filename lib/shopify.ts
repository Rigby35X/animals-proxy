// lib/shopify.ts

const API_VERSION = "2024-07";

type UpsertArgs = {
  id?: string;                   // Shopify GID, if updating
  title: string;
  bodyHtml?: string;             // caller passes Story here; we map -> descriptionHtml
  tags?: string[];
  handle?: string;
  status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
};

type MetafieldInput = {
  namespace: string;
  key: string;
  type: string;                  // e.g. "single_line_text_field", "date", etc.
  value: string;                 // always string in GraphQL input
};

type ShopifyGraphQLError = { message: string; extensions?: any; locations?: any[] };

function shopEndpoint() {
  const store = process.env.SHOPIFY_STORE;
  if (!store) throw new Error("Missing SHOPIFY_STORE env");
  return `https://${store}/admin/api/${API_VERSION}/graphql.json`;
}

async function shopGraphQL<T = any>(query: string, variables?: any): Promise<T> {
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) throw new Error("Missing SHOPIFY_ADMIN_TOKEN env");

  const resp = await fetch(shopEndpoint(), {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await resp.json().catch(async () => {
    const text = await resp.text();
    throw new Error(`Shopify GraphQL bad JSON (HTTP ${resp.status}): ${text}`);
  });

  if (!resp.ok) {
    throw new Error(`Shopify GraphQL HTTP ${resp.status}: ${JSON.stringify(json)}`);
  }

  // Top-level GraphQL errors
  if (json.errors && json.errors.length) {
    const errs = json.errors as ShopifyGraphQLError[];
    throw new Error(JSON.stringify(errs));
  }

  return json as T;
}

/** Create or update a product. Maps `bodyHtml` -> `descriptionHtml` (GraphQL field). */
export async function upsertProduct(input: UpsertArgs): Promise<string> {
  const shopifyInput: any = {
    id: input.id,
    title: input.title,
    descriptionHtml: input.bodyHtml ?? "",        // ← FIXED FIELD NAME
    tags: input.tags || [],
    handle: input.handle,
    status: input.status ?? "ACTIVE",
  };
  // Remove undefined keys (GraphQL rejects undefined)
  Object.keys(shopifyInput).forEach((k) => shopifyInput[k] === undefined && delete shopifyInput[k]);

  const mutation = input.id
    ? `
      mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id handle status title }
          userErrors { field message }
        }
      }
    `
    : `
      mutation CreateProduct($input: ProductInput!) {
        productCreate(input: $input) {
          product { id handle status title }
          userErrors { field message }
        }
      }
    `;

  const data = await shopGraphQL(mutation, { input: shopifyInput });

  const res = input.id ? (data as any).data.productUpdate : (data as any).data.productCreate;
  const userErrors = res?.userErrors || [];
  if (userErrors.length) {
    throw new Error(JSON.stringify(userErrors));
  }
  const productId = res?.product?.id;
  if (!productId) throw new Error("Shopify upsert returned no product id");

  return productId as string;
}

/** Find a product by handle (returns {id, handle} or null). */
export async function findProductByHandle(handle: string): Promise<{ id: string; handle: string } | null> {
  const query = `
    query ProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        handle
      }
    }
  `;
  const json = await shopGraphQL(query, { handle });
  const p = (json as any).data?.productByHandle;
  if (!p) return null;
  return { id: p.id, handle: p.handle };
}

/** Set metafields on a product (array). */
export async function setMetafields(ownerId: string, metafields: MetafieldInput[]) {
  if (!metafields.length) return;

  const mutation = `
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          type
          value
          owner { ... on Product { id } }
        }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    metafields: metafields.map((m) => ({
      ownerId,
      namespace: m.namespace,
      key: m.key,
      type: m.type,
      value: m.value,
    })),
  };

  const json = await shopGraphQL(mutation, variables);
  const res = (json as any).data?.metafieldsSet;
  const userErrors = res?.userErrors || [];
  if (userErrors.length) {
    throw new Error(JSON.stringify(userErrors));
  }
}

/** Delete all current media (images) on a product, then add new images from remote URLs. */
export async function replaceImagesWithUrls(productId: string, urls: string[]) {
  // 1) Fetch existing media IDs
  const qMedia = `
    query GetMedia($id: ID!) {
      product(id: $id) {
        id
        media(first: 100) {
          nodes { id }
        }
      }
    }
  `;
  const mediaJson = await shopGraphQL(qMedia, { id: productId });
  const nodes = (mediaJson as any).data?.product?.media?.nodes || [];
  const mediaIds: string[] = nodes.map((n: any) => n.id).filter(Boolean);

  // 2) Delete existing media (if any)
  if (mediaIds.length) {
    const mDelete = `
      mutation ProductDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          userErrors { field message }
        }
      }
    `;
    const delJson = await shopGraphQL(mDelete, { productId, mediaIds });
    const delErrors = (delJson as any).data?.productDeleteMedia?.userErrors || [];
    if (delErrors.length) throw new Error(JSON.stringify(delErrors));
  }

  if (!urls.length) return;

  // 3) Create media from remote URLs
  const mCreate = `
    mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { id }
        mediaUserErrors { code field message }
        product { id }
      }
    }
  `;

  // Shopify will fetch each URL (must be publicly reachable)
  const media = urls.map((u) => ({ originalSource: u }));

  const createJson = await shopGraphQL(mCreate, { productId, media });
  const userErrors = (createJson as any).data?.productCreateMedia?.mediaUserErrors || [];
  if (userErrors.length) {
    throw new Error(JSON.stringify(userErrors));
  }
}

/**
 * Replace images using Cognito file refs.
 * If your Cognito payload includes direct file URLs (recommended), this will reuse replaceImagesWithUrls.
 * If not, we currently skip (and log) because staging raw bytes requires an S3 pre-sign flow.
 */
export async function replaceImagesFromCognitoFiles(productId: string, files: Array<{ Url?: string }>, _cognitoApiKey: string) {
  const urls = (files || []).map((f) => f?.Url).filter(Boolean) as string[];
  if (urls.length) {
    await replaceImagesWithUrls(productId, urls);
    return;
  }

  // If you need to support non-URL files, implement stagedUploadsCreate + productCreateMedia with resourceUrl.
  // For now, just surface a helpful message.
  console.warn("Cognito files missing Urls; skipping image upload for product:", productId);
}
