import type { NextApiRequest, NextApiResponse } from "next";
import {
  upsertProduct, setMetafields, findProductByHandle,
  replaceImagesWithUrls, replaceImagesFromCognitoFiles
} from "../../../lib/shopify";
import { toHandle, tagsForCode, mapMetafields, imageFileRefs } from "../../../lib/map";

const BASE  = (process.env.COGNITO_API_BASE || "https://www.cognitoforms.com/api").trim();
const FORM  = (process.env.COGNITO_FORM_ID || "").trim();
const TOKEN = (process.env.COGNITO_API_KEY || "").trim();

// fetch a single entry by number
async function fetchEntry(number: number) {
  const url = `${BASE}/forms/${FORM}/entries/${number}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" } });
  const txt = await r.text();
  if (r.status === 404) return null; // not found/doesn't exist
  if (!r.ok) throw new Error(`GET ${url} failed: ${r.status} ${txt}`);
  return JSON.parse(txt);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).end();
    if (!FORM || !TOKEN) return res.status(500).json({ error: "Missing COGNITO_FORM_ID or COGNITO_API_KEY" });

    // ---- scan config ----
    // startFrom: if you know a recent number, put it here; otherwise start at 1
    const startFrom = Number(req.query.start ?? 1);
    // stopAfterNMisses: stop after this many consecutive 404s (heuristic end)
    const stopAfterNMisses = Number(req.query.stopAfter ?? 50);
    // maxToCheck: optional absolute cap to be safe
    const maxToCheck = Number(req.query.max ?? 2000);

    let n = startFrom;
    let misses = 0;
    let processed = 0;
    const foundNumbers: number[] = [];

    while (misses < stopAfterNMisses && (n - startFrom) < maxToCheck) {
      const entry = await fetchEntry(n).catch((e) => {
        // For robustness: treat 401/403 as hard error (bad token); 404 as miss
        throw e;
      });

      if (!entry) {
        misses++;
      } else {
        misses = 0;
        foundNumbers.push(n);

        const name = entry.DogName || entry.Name;
        if (name) {
          const handle = toHandle(name);
          const existing = await findProductByHandle(handle);

          const id = await upsertProduct({
            id: existing?.id,
            title: name,
            bodyHtml: entry.MyStory || "",
            tags: tagsForCode(entry.Code),
            handle
          });

          const metas = mapMetafields(entry);
          if (metas.length) await setMetafields(id, metas);

          const files = imageFileRefs(entry);
          const urls = files.filter((f: any) => !!f.Url).map((f: any) => f.Url!) as string[];

          if (urls.length === files.length) {
            await replaceImagesWithUrls(id, urls);
          } else if (files.length) {
            await replaceImagesFromCognitoFiles(id, files as any, TOKEN);
          }

          processed++;
        }
      }

      n++;
    }

    return res.status(200).json({
      processed,
      checkedRange: [startFrom, n - 1],
      consecutiveMissesStop: stopAfterNMisses,
      foundNumbers,
    });
  } catch (e: any) {
    console.error("scan error:", e);
    return res.status(500).json({ error: e?.message || "internal_error" });
  }
}
