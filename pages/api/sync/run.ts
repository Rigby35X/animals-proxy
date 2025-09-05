// pages/api/sync/run.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { fetchEntries } from "../../../lib/cognito";
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

// pages/api/sync/run.ts (only the fallback helper changed)
async function fetchEntriesWithFallback(req: NextApiRequest): Promise<any[]> {
  try {
    return await fetchEntries(FORM_ID, COGNITO_API_KEY);
  } catch (e) {
    // Fallback: call our own GET endpoint on the SAME host that invoked this lambda
    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    const origin = `https://${host}`;
    const url = `${origin}/api/cognito/entries?page=1&pageSize=200`;

    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const txt = await r.text();
    if (!r.ok) throw new Error(`entries fallback failed: ${r.status} ${txt}`);
    return JSON.parse(txt);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).end();
    if (!FORM_ID || !COGNITO_API_KEY) {
      return res.status(500).json({ error: "Missing COGNITO_FORM_ID or COGNITO_API_KEY env" });
    }

    const entries = await fetchEntriesWithFallback(req);
    // ... rest of your upsert loop unchanged ...


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

    return res.status(200).json({ processed });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "internal_error" });
  }
}
