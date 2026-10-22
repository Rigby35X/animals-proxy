// Controlled Form 49 -> existing Shopify products only.
// POST { "handle": "dog-49-9", "dry_run": true } or
// POST { "handle": "dog-49-9", "dry_run": false } after enabling writes.
// No product creation, legacy Form 38 sync remains untouched.
import type { NextApiRequest, NextApiResponse } from "next";
import { fetchEntries } from "../../../lib/cognito";
import { mapForm49 } from "./form49-audit";
import { form49Metafields } from "../../../lib/form49-shopify-fields";
import {
  findProductByHandle,
  updateForm49ExistingProduct,
  setMetafields,
  addMissingForm49Images,
} from "../../../lib/shopify";

const field = (key: string, value: string) => ({
  namespace: "mbpr", key, type: "single_line_text_field", value,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const token = process.env.CRON_SECRET;
  if (!token || req.headers.authorization !== "Bearer " + token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const handle = typeof req.body?.handle === "string" ? req.body.handle : "";
  if (!/^dog-49-\d+$/.test(handle)) {
    return res.status(400).json({ error: "Provide a single Form 49 handle, e.g. dog-49-9" });
  }
  const dryRun = req.body?.dry_run !== false;

  const apiKey = process.env.COGNITO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing Cognito API key" });

  try {
    const entries = await fetchEntries("49", apiKey);
    const dog = entries.map(mapForm49).find(item => item?.handle === handle);
    if (!dog) return res.status(404).json({ error: "Form 49 dog not found" });
    const existing = await findProductByHandle(handle);
    if (!existing) {
      return res.status(409).json({ handle, action: "skipped", reason: "Existing Shopify product not found; creation prohibited" });
    }
    const changes = {
      title: dog.name, description: dog.story, age: dog.age, status: dog.status,
      breed: dog.breed, gender: dog.gender, litter: dog.litter, size: dog.size,
      photo_count: dog.photo_count,
    };
    if (dryRun) return res.status(200).json({
      dry_run: true, handle, shopify_product_id: existing.id, changes,
    });

    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    if (!/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(host)) throw new Error("Invalid host");
    const photoBase = "https://" + host;
    if (dog.photo_count && !/^https:\/\//.test(photoBase)) {
      return res.status(500).json({ error: "Set FORM49_PUBLIC_PHOTO_BASE to the stable HTTPS animals-proxy origin before syncing photos" });
    }

    await updateForm49ExistingProduct(existing.id, dog.name, dog.story);
    // Include empty values so removed details can be cleared on subsequent runs.
    await setMetafields(existing.id, form49Metafields(dog));
    const urls = Array.from({ length: dog.photo_count }, (_, index) =>
      photoBase + "/api/animals/" + handle + "/photo/" + index
    );
    const images = await addMissingForm49Images(existing.id, urls);
    return res.status(200).json({
      dry_run: false, action: "updated_existing", handle,
      shopify_product_id: existing.id, changes, images,
    });
  } catch (error) {
    console.error("Form 49 Shopify sync failed", error);
    return res.status(500).json({ error: "Form 49 Shopify sync failed; check server logs" });
  }
}
