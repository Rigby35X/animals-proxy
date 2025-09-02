import type { NextApiRequest, NextApiResponse } from "next";
import { fetchEntries } from "@/lib/cognito";
import { setMetafields, upsertProduct, findProductByHandle, replaceImagesWithUrls, replaceImagesFromCognitoFiles } from "@/lib/shopify";
import { imageFileRefs, mapMetafields, tagsForCode, toHandle } from "@/lib/map";

const FORM_ID = process.env.COGNITO_FORM_ID!;
const COGNITO_API_KEY = process.env.COGNITO_API_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    const entries = await fetchEntries(FORM_ID, COGNITO_API_KEY);

    let processed = 0;
    for (const entry of entries) {
      const name = entry.DogName || (entry as any).Name;
      if (!name) continue;

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
      const urls = files.filter(f => !!f.Url).map(f => f.Url!) as string[];

      if (urls.length === files.length) {
        await replaceImagesWithUrls(id, urls);
      } else if (files.length) {
        await replaceImagesFromCognitoFiles(id, files, COGNITO_API_KEY);
      }

      processed++;
    }

    return res.status(200).json({ processed });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "internal_error" });
  }
}
