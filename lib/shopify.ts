// lib/shopify.ts
const API_VERSION = "2024-07";

type UpsertArgs = {
  id?: string;
  title: string;
  bodyHtml?: string;             // mapped -> descriptionHtml
  tags?: string[];
  handle?: string;
  status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
};

type MetafieldInput = {
  namespace: string;
  key: string;
  type: string;
  value: string;
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
  if (json.errors && json.errors.length) {
    const errs = json.errors as ShopifyGraphQLError[];
    throw new Error(JSON.stringify(errs));
  }
  return json as T;
}

export async function upsertProduct(input: UpsertArgs): Promise<string> {
  const shopifyInput: any = {
    id: input.id,
    title: input.title,
    descriptionHtml: input.bodyHtml ?? "",   // ✅ correct field name
    tags: input.tags || [],
    handle: input.handle,
    status: input.status ?? "ACTIVE",
  };
  Object.keys(shopifyInput).forEach((k) => shopifyInput[k] === undefined && delete shopifyInput[k]);

  const mutation = input.id ? `
    mutation UpdateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id handle status title }
        userErrors { field message }
      }
    }` : `
    mutation CreateProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product { id handle status title }
        userErrors { field message }
      }
    }`;

  const data = await shopGraphQL(mutation, { input: shopifyInput });
  const res = input.id ? (data as any).data.productUpdate : (data as any).data.productCreate;
  const userErrors = res?.userErrors || [];
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
  const productId = res?.product?.id;
  if (!productId) throw new Error("Shopify upsert returned no product id");
  return productId as string;
}

export async function findProductByHandle(handle: string): Promise<{ id: string; handle: string } | null> {
  const q = `query ProductByHandle($handle: String!) { productByHandle(handle: $handle) { id handle } }`;
  const json = await shopGraphQL(q, { handle });
  const p = (json as any).data?.productByHandle;
  return p ? { id: p.id, handle: p.handle } : null;
}

/** Generic product search (first result) using Shopify’s Admin search syntax */
export async function findProductByQuery(query: string): Promise<{ id: string; handle: string; title: string } | null> {
  const q = `
    query ProductsByQuery($query: String!) {
      products(first: 1, query: $query) {
        nodes { id handle title }
      }
    }
  `;
  const json = await shopGraphQL(q, { query });
  const node = (json as any).data?.products?.nodes?.[0];
  return node ? { id: node.id, handle: node.handle, title: node.title } : null;
}

export async function setMetafields(ownerId: string, metafields: MetafieldInput[]) {
  if (!metafields.length) return;
  const m = `
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key type value owner { ... on Product { id } } }
        userErrors { field message }
      }
    }`;
  const vars = { metafields: metafields.map(mf => ({ ownerId, ...mf })) };
  const json = await shopGraphQL(m, vars);
  const errs = (json as any).data?.metafieldsSet?.userErrors || [];
  if (errs.length) throw new Error(JSON.stringify(errs));
}

export async function replaceImagesWithUrls(productId: string, urls: string[]) {
  const qMedia = `query GetMedia($id: ID!) { product(id: $id) { id media(first: 100) { nodes { id } } } }`;
  const mediaJson = await shopGraphQL(qMedia, { id: productId });
  const nodes = (mediaJson as any).data?.product?.media?.nodes || [];
  const mediaIds: string[] = nodes.map((n: any) => n.id).filter(Boolean);

  if (mediaIds.length) {
    const mDelete = `
      mutation ProductDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          userErrors { field message }
        }
      }`;
    const delJson = await shopGraphQL(mDelete, { productId, mediaIds });
    const delErrors = (delJson as any).data?.productDeleteMedia?.userErrors || [];
    if (delErrors.length) throw new Error(JSON.stringify(delErrors));
  }
  if (!urls.length) return;

  const mCreate = `
    mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { id }
        mediaUserErrors { code field message }
        product { id }
      }
    }`;
  const media = urls.map(u => ({ originalSource: u }));
  const createJson = await shopGraphQL(mCreate, { productId, media });
  const userErrors = (createJson as any).data?.productCreateMedia?.mediaUserErrors || [];
  if (userErrors.length) throw new Error(JSON.stringify(userErrors));
}

export async function replaceImagesFromCognitoFiles(productId: string, files: Array<{ Url?: string }>, _cognitoKey: string) {
  const urls = (files || []).map(f => f?.Url).filter(Boolean) as string[];
  if (urls.length) {
    await replaceImagesWithUrls(productId, urls);
    return;
  }
  console.warn("Cognito files missing Urls; skipping image upload for", productId);
}
