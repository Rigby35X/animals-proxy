// pages/api/sync/run.ts
import type { NextApiRequest, NextApiResponse } from "next";
import {
  setMetafields,
  upsertProduct,
  findProductByHandle,
  replaceImagesWithUrls,
  replaceImagesFromCognitoFiles
} from "../../../lib/shopify";
import { imageFileRefs, mapMetafields, tagsForCode, toHandle } from "../../../lib/map";

const FORM_ID = (process.env.COGNITO_FORM_ID || "").trim();
const COGNITO_API_KEY = (process.env.COGNITO_API_KEY || "").trim();
const COGNITO_API_BASE = (process.env.COGNITO_API_BASE || "https://www.cognitoforms.com/api").trim();

async function fetchEntriesDebug() {
  const url = `${COGNITO_API_BASE}/forms/${FORM_ID}/entries`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${COGNITO_API_KEY}`, Accept: "application/json" }
  });
  const body = await r.text();
  return { ok: r.ok, status: r.status, url, base: COGNITO_API_BASE, formId: FORM_ID, bodyPreview: body.slice(0, 500) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    if (!FORM_ID || !COGNITO_API_KEY) {
      return res.status(500).json({
        error: "Missing env",
        FORM_ID,
        COGNITO_API_KEY_present: !!COGNITO_API_KEY
      });
    }

    // --- DEBUG FIRST: hit Cognito and echo what we used ---
    const probe = await fetchEntriesDebug();
    if (!probe.ok) {
      // Return the upstream details so we can see the exact mismatch
      return res.status(502).json({ error: "cognito_entries_probe_failed", ...probe });
    }

    // If the probe succeeded, parse entries and continue
    const entries = JSON.parse(probe.bodyPreview); // bodyPreview is the full body when ok
    let processed = 0;

    for (const entry of entries) {
      const name = (entry as any).DogName || (entry as any).Name;
      if (!name) continue;

      const handle = toHandle(name);
      const existing = await findProductByHandle(handle);

      const id = await upsertProduct({
        id: existing?.id,
        title: name,
        bodyHtml: (entry as any).MyStory || "",
        tags: tagsForCode((entry as any).Code),
        handle
      });

      const metas = mapMetafields(entry as any);
      if (metas.length) await setMetafields(id, metas);

      const files = imageFileRefs(entry as any);
      const urls = files.filter((f: any) => !!f.Url).map((f: any) => f.Url!) as string[];

      if (urls.length === files.length) {
        await replaceImagesWithUrls(id, urls);
      } else if (files.length) {
        await replaceImagesFromCognitoFiles(id, files as any, COGNITO_API_KEY);
      }

      processed++;
    }

    return res.status(200).json({ processed, source: probe.url });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "internal_error" });
  }
}
