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
import { mapForm49 } from "./form49-audit";
import { addMissingForm49Images } from "../../../lib/shopify";

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
    if (req.method !== "POST" && req.method !== "GET") return res.status(405).end();
    if (!FORM_ID || !COGNITO_API_KEY) {
      return res.status(500).json({ error: "Missing COGNITO_FORM_ID or COGNITO_API_KEY env" });
    }

    const entries = await fetchEntriesWithFallback(req);
    // ... rest of your upsert loop unchanged ...



    if (FORM_ID === "49") {
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
      if (!/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(host)) throw new Error("Invalid host");
      const origin = "https://" + host;
      let processed = 0;
      let skipped = 0;
      const errors: Array<{handle: string; error: string}> = [];
      for (const entry of entries) {
        const dog = mapForm49(entry);
        if (!dog) { skipped++; continue; }
        try {
          const existing = await findProductByHandle(dog.handle);
          const tags = ["mbpr-managed", "mbpr-form49"];
          if (/^(available|vip)/i.test(dog.status)) tags.push("mbpr-available");
          if (/adopted/i.test(dog.status)) tags.push("mbpr-adopted");
          const id = await upsertProduct({
            id: existing?.id, handle: dog.handle, title: dog.name,
            bodyHtml: dog.story, tags, status: "ACTIVE",
          });
          const values: Record<string, string> = {
            age: dog.age, availability: dog.status, breed: dog.breed,
            gender: dog.gender, litter: dog.litter, adult_size: dog.size,
            cognito_form49_handle: dog.handle,
          };
          await setMetafields(id, Object.entries(values).map(([key, value]) => ({
            namespace: "mbpr", key, value, type: "single_line_text_field",
          })));
          const urls = Array.from({ length: dog.photo_count }, (_, i) =>
            origin + "/api/animals/" + dog.handle + "/photo/" + i
          );
          await addMissingForm49Images(id, urls);
          processed++;
        } catch (error: any) {
          errors.push({ handle: dog.handle, error: error?.message || "sync_failed" });
        }
      }
      return res.status(errors.length ? 207 : 200).json({ form_id: "49", processed, skipped, errors });
    }

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
