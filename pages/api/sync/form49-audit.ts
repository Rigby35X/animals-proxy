// Form 49 Shopify migration audit. Read-only by design: no Shopify mutations.
// Kept separate from /api/sync/run, which still serves the legacy sync.
import type { NextApiRequest, NextApiResponse } from "next";
import { fetchEntries } from "../../../lib/cognito";
import { findProductByHandle } from "../../../lib/shopify";

type Dog = {
  handle: string;
  entry_number: string;
  name: string;
  age: string;
  status: string;
  story: string;
  breed: string;
  gender: string;
  litter: string;
  size: string;
  photo_count: number;
};

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
function fileCount(value: unknown): number {
  return (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean).length;
}
function mapForm49(entry: any): Dog | null {
  // REST Id can be a form-prefixed identifier; Entry.Number is also supported.
  const rawId = text(entry?.Entry?.Number ?? entry?.Id ?? entry?.Number);
  const number = rawId.replace(/^49-/, "");
  if (!/^\d+$/.test(number)) return null;
  const profile = entry?.DogProfile || {};
  const extra = entry?.AdditionalDogPhotos || {};
  const intake = entry?.Intake || {};
  const name = text(profile.DogName);
  if (!name) return null;
  return {
    handle: "dog-49-" + number,
    entry_number: number,
    name,
    age: text(profile.Age),
    status: text(entry.DogStatus),
    story: text(intake.MyStory),
    breed: text(profile.PrimaryBreed),
    gender: text(profile.Sex),
    litter: text(profile.LitterName),
    size: text(profile.EstimatedAdultSize),
    photo_count: [
      profile.Photo,
      extra.Photo1 ?? intake.Photo1,
      extra.Photo2 ?? intake.Photo22,
      extra.Photo3 ?? intake.Photo3,
      extra.Photo4 ?? intake.Photo4,
    ].reduce((count: number, value: unknown) => count + fileCount(value), 0),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  // This endpoint exposes private draft records and must never be publicly callable.
  const secret = process.env.SHOPIFY_SYNC_AUDIT_TOKEN;
  if (!secret || req.headers.authorization !== "Bearer " + secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const key = process.env.COGNITO_API_KEY;
  if (!key) return res.status(500).json({ error: "Missing COGNITO_API_KEY" });
  try {
    const entries = await fetchEntries("49", key);
    const dogs = entries.map(mapForm49).filter((dog): dog is Dog => dog !== null);
    const results = [];
    for (const dog of dogs) {
      const existing = await findProductByHandle(dog.handle);
      results.push({
        ...dog,
        shopify_product_id: existing?.id ?? null,
        action: existing ? "would_update_existing" : "missing_product_skip",
      });
    }
    return res.status(200).json({
      dry_run: true,
      form_id: "49",
      total: results.length,
      matched: results.filter(row => row.shopify_product_id).length,
      missing: results.filter(row => !row.shopify_product_id).length,
      results,
    });
  } catch (error: any) {
    console.error("Form 49 Shopify audit failed:", error);
    return res.status(500).json({ error: "Form 49 Shopify audit failed" });
  }
}
