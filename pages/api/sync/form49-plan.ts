import type { NextApiRequest, NextApiResponse } from "next";
import { fetchPublicAnimalsFromOData } from "../../../lib/cognito-odata";

// Read-only migration planning endpoint. No Shopify mutations are permitted.
// Protected by the existing sync secret; do not return private Cognito fields.
const SECRET = (process.env.SYNC_SECRET || "").trim();
const FORM_ID = (process.env.PUBLIC_ANIMALS_COGNITO_FORM_ID || "").trim();
const legacyKeys: Record<string, string> = {
  "dog-49-1": "dog-38-270",
  "dog-49-2": "dog-38-278",
  "dog-49-3": "dog-38-274",
  "dog-49-4": "dog-38-273",
  "dog-49-6": "dog-38-268",
};
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();
  if (!SECRET || req.headers.authorization !== "Bearer " + SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (FORM_ID !== "49") return res.status(409).json({ error: "Form 49 preview only" });
  try {
    const animals = await fetchPublicAnimalsFromOData(FORM_ID, "");
    return res.status(200).json({
      dry_run: true,
      writes_performed: 0,
      form_id: FORM_ID,
      count: animals.length,
      records: animals.map((a) => ({
        name: a.name,
        new_animal_key: a.animal_key,
        previous_animal_key: legacyKeys[a.animal_key] || null,
        previous_shopify_handle: legacyKeys[a.animal_key] || null,
        photo_count: a.photos.length,
        proposed_action: "REVIEW_EXISTING_SHOPIFY_PRODUCT_BEFORE_UPDATE",
      })),
      warnings: [
        "Existing Shopify product IDs and handles must be checked before any writes.",
        "Never run the legacy /api/sync/run endpoint for Form 49 without migration review.",
        "Shopify image updates must use stable publicly fetchable URLs, not short-lived Cognito URLs.",
      ],
    });
  } catch (error) {
    console.error("Form 49 dry-run plan failed", error);
    return res.status(502).json({ error: "Unable to prepare migration plan" });
  }
}
