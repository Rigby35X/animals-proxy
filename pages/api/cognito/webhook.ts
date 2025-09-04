// pages/api/cognito/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { upsertProduct, setMetafields } from "../../../lib/shopify";
import { toHandle, tagsForCode, mapMetafields } from "../../../lib/map";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    const entry = req.body;

    if (!entry) {
      return res.status(400).json({ error: "Missing request body" });
    }

    const name = entry.DogName || entry.Name;
    if (!name) {
      return res.status(400).json({ error: "Missing DogName/Name in entry" });
    }

    const handle = toHandle(name);

    // Upsert product in Shopify
    const id = await upsertProduct({
      title: name,
      bodyHtml: entry.MyStory || "",
      tags: tagsForCode(entry.Code),
      handle,
    });

    // Sync metafields
    const metas = mapMetafields(entry);
    if (metas.length) await setMetafields(id, metas);

    return res.status(200).json({ ok: true, dog: name });
  } catch (e: any) {
    console.error("Webhook error:", e);
    return res.status(500).json({ error: e?.message || "internal_error" });
  }
}
