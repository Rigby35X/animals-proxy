const SHOP = process.env.SHOPIFY_STORE!;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const API_VER = "2024-07"; // ok to bump later
const GQL = `https://${SHOP}/admin/api/${API_VER}/graphql.json`;

async function graphql<T>(query: string, variables?: any): Promise<T> {
  const res = await fetch(GQL, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  // some mutations also return userErrors inside data.* — we handle in callers when needed
  return json.data as T;
}

export async function findProductByHandle(handle: string): Promise<{ id: string } | null> {
  const q = /* GraphQL */ `
    query($handle: String!) {
      productByHandle(handle: $handle) { id }
    }
  `;
  const data = await graphql<{ productByHandle: { id: string } | null }>(q, { handle });
  return data.productByHandle;
}

export async function upsertProduct(opts: {
  id?: string;
  title: string;
  bodyHtml?: string;
  tags: string[];
  handle: string;
}): Promise<string> {
  if (opts.id) {
    const q = /* GraphQL */ `
      mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id }
          userErrors { field message }
        }
      }
    `;
    const v = { input: { id: opts.id, title: opts.title, bodyHtml: opts.bodyHtml, tags: opts.tags, handle: opts.handle } };
    const data = await graphql<{ productUpdate: { product: { id: string }, userErrors: any[] } }>(q, v);
    if (data.productUpdate.userErrors?.length) throw new Error(JSON.stringify(data.productUpdate.userErrors));
    return data.productUpdate.product.id;
  } else {
    const q = /* GraphQL */ `
      mutation CreateProduct($input: ProductInput!) {
        productCreate(input: $input) {
          product { id }
          userErrors { field message }
        }
      }
    `;
    const v = { input: { title: opts.title, bodyHtml: opts.bodyHtml, tags: opts.tags, handle: opts.handle, status: "ACTIVE" } };
    const data = await graphql<{ productCreate: { product: { id: string }, userErrors: any[] } }>(q, v);
    if (data.productCreate.userErrors?.length) throw new Error(JSON.stringify(data.productCreate.userErrors));
    return data.productCreate.product.id;
  }
}

export async function setMetafields(ownerId: string, metas: Array<{ namespace: string; key: string; type: string; value: string }>) {
  if (!metas.length) return;
  const q = /* GraphQL */ `
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }
  `;
  const inputs = metas.map(m => ({
    ownerId,
    namespace: m.namespace,
    key: m.key,
    type: m.type,
    value: m.value
  }));
  const data = await graphql<{ metafieldsSet: { userErrors: any[] } }>(q, { metafields: inputs });
  if (data.metafieldsSet.userErrors?.length) throw new Error(JSON.stringify(data.metafieldsSet.userErrors));
}

/** Get current product image IDs (to replace) */
async function getProductImageIds(productId: string): Promise<string[]> {
  const q = /* GraphQL */ `
    query($id: ID!) {
      product(id: $id) {
        images(first: 100) { nodes { id } }
      }
    }
  `;
  const data = await graphql<{ product: { images: { nodes: { id: string }[] } } }>(q, { id: productId });
  return data.product.images.nodes.map(n => n.id);
}

async function deleteProductImages(productId: string, imageIds: string[]) {
  if (!imageIds.length) return;
  const q = /* GraphQL */ `
    mutation ProductDeleteImages($id: ID!, $imageIds: [ID!]!) {
      productDeleteImages(id: $id, imageIds: $imageIds) {
        deletedImageIds
        userErrors { field message }
      }
    }
  `;
  const data = await graphql<{ productDeleteImages: { userErrors: any[] } }>(q, { id: productId, imageIds });
  if (data.productDeleteImages.userErrors?.length) throw new Error(JSON.stringify(data.productDeleteImages.userErrors));
}

/** If you have public URLs, you can directly set them as media originalSource */
async function createMediaFromUrls(productId: string, urls: string[]) {
  if (!urls.length) return;
  const q = /* GraphQL */ `
    mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { alt }
        userErrors { field message }
      }
    }
  `;
  const media = urls.map(u => ({ alt: "Dog photo", originalSource: u, mediaContentType: "IMAGE" }));
  const data = await graphql<{ productCreateMedia: { userErrors: any[] } }>(q, { productId, media });
  if (data.productCreateMedia.userErrors?.length) throw new Error(JSON.stringify(data.productCreateMedia.userErrors));
}

/**
 * Staged uploads path (no public URLs needed).
 * 1) stagedUploadsCreate -> returns S3 URL + parameters
 * 2) HTTP POST (form-data) bytes to that URL
 * 3) productCreateMedia referencing the staged resource
 */
async function stagedUploadsCreate(fileNames: string[]) {
  const q = /* GraphQL */ `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }
  `;
  const input = fileNames.map(name => ({
    filename: name || "image.jpg",
    mimeType: "image/jpeg",     // adjust per file; ok as default
    httpMethod: "POST",
    resource: "PRODUCT_IMAGE"
  }));
  const data = await graphql<{ stagedUploadsCreate: { stagedTargets: any[], userErrors: any[] } }>(q, { input });
  if (data.stagedUploadsCreate.userErrors?.length) throw new Error(JSON.stringify(data.stagedUploadsCreate.userErrors));
  return data.stagedUploadsCreate.stagedTargets;
}

async function postFileToStagedTarget(target: any, bytes: Uint8Array) {
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([new Uint8Array(bytes)]));
  const res = await fetch(target.url, { method: "POST", body: form as any });
  if (!res.ok) throw new Error(`Staged upload failed: ${res.status}`);
  return target.resourceUrl as string; // what we pass to productCreateMedia
}

async function productCreateMediaFromStaged(productId: string, resourceUrls: string[]) {
  if (!resourceUrls.length) return;
  const q = /* GraphQL */ `
    mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { alt }
        userErrors { field message }
      }
    }
  `;
  const media = resourceUrls.map(r => ({ alt: "Dog photo", originalSource: r, mediaContentType: "IMAGE" }));
  const data = await graphql<{ productCreateMedia: { userErrors: any[] } }>(q, { productId, media });
  if (data.productCreateMedia.userErrors?.length) throw new Error(JSON.stringify(data.productCreateMedia.userErrors));
}

export async function replaceImagesWithUrls(productId: string, urls: string[]) {
  const ids = await getProductImageIds(productId);
  if (ids.length) await deleteProductImages(productId, ids);
  if (urls.length) await createMediaFromUrls(productId, urls);
}

/**
 * Download bytes from Cognito (by file Id or Url), then use staged uploads.
 * `fetchFileBytes` below supports either direct Url or /files/{id} style — adapt if your payload differs.
 */
async function fetchFileBytes(fileRef: { Url?: string; Id?: number | string; FileName?: string }, apiKey: string): Promise<Uint8Array> {
  if (fileRef.Url) {
    const r = await fetch(fileRef.Url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) throw new Error(`Download via Url failed: ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    return buf;
  }
  if (fileRef.Id != null) {
    // Adjust this endpoint to match your actual Files API if needed.
    const url = `https://www.cognitoforms.com/api/v1/files/${fileRef.Id}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) throw new Error(`Download via file Id failed: ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    return buf;
  }
  throw new Error("No Url or Id available for file download");
}

export async function replaceImagesFromCognitoFiles(productId: string, files: Array<{ Url?: string; Id?: number | string; FileName?: string }>, apiKey: string) {
  const imageIds = await getProductImageIds(productId);
  if (imageIds.length) await deleteProductImages(productId, imageIds);
  if (!files.length) return;

  // 1) Prepare staged targets
  const targets = await stagedUploadsCreate(files.map(f => f.FileName || "image.jpg"));

  // 2) Upload each file to staged target
  const resourceUrls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const bytes = await fetchFileBytes(files[i], apiKey);
    const resourceUrl = await postFileToStagedTarget(targets[i], bytes);
    resourceUrls.push(resourceUrl);
  }

  // 3) Attach to product
  await productCreateMediaFromStaged(productId, resourceUrls);
}
