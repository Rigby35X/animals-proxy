import type { NextApiRequest, NextApiResponse } from "next";
import { setMetafields, upsertProduct, findProductByHandle, replaceImagesWithUrls, replaceImagesFromCognitoFiles } from "@/lib/shopify";
import { imageFileRefs, mapMetafields, tagsForCode, toHandle } from "@/lib/map";

const WEBHOOK_SECRET = process.env.COGNITO_WEBHOOK_SECRET!;
const COGNITO_API_KEY = process.env.COGNITO_API_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    // verify secret header
    const sig = req.headers["x-cognito-signature"];
    if (WEBHOOK_SECRET && sig !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const entry = req.body;
    const name = entry.DogName || entry.Name;
    if (!name) return res.status(400).json({ error: "Missing DogName" });

    const handle = toHandle(name);
    const existing = await findProductByHandle(handle);

    const id = await upsertProduct({
      id: existing?.id,
      title: name,
      bodyHtml: entry.MyStory || "",
      tags: tagsForCode(entry.Code),
      handle
    });

    // metafields
    const metas = mapMetafields(entry);
    if (metas.length) await setMetafields(id, metas);

    // images
    const files = imageFileRefs(entry);
    const urls = files.filter(f => !!f.Url).map(f => f.Url!) as string[];

    if (urls.length === files.length) {
      await replaceImagesWithUrls(id, urls);
    } else if (files.length) {
      await replaceImagesFromCognitoFiles(id, files, COGNITO_API_KEY);
    }

    return res.status(200).json({ ok: true, productId: id, handle });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "internal_error" });
  }
}
