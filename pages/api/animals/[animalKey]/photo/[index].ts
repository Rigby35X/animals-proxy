import type { NextApiRequest, NextApiResponse } from "next";
import { collectFileRefs, fetchEntryByNumber, fileIdFromRef } from "../../../../../lib/cognito";

const BASE = (process.env.COGNITO_API_BASE || "https://www.cognitoforms.com/api").trim();
const FORM_ID = (process.env.PUBLIC_ANIMALS_COGNITO_FORM_ID || "").trim();
const API_KEY = (process.env.COGNITO_API_KEY || "").trim();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  if (!FORM_ID || !API_KEY) return res.status(500).json({ error: "Animal photo proxy is not configured" });

  try {
    const animalKey = Array.isArray(req.query.animalKey) ? req.query.animalKey[0] : req.query.animalKey;
    const indexRaw = Array.isArray(req.query.index) ? req.query.index[0] : req.query.index;
    const index = Number(indexRaw);

    if (!animalKey || !Number.isInteger(index) || index < 0) return res.status(400).end();

    const match = animalKey.match(/^dog-(\d+)-(\d+)$/);
    if (!match || match[1] !== FORM_ID) return res.status(404).end();

    const entry = await fetchEntryByNumber(FORM_ID, match[2], API_KEY);
    const file = collectFileRefs(entry)[index];
    if (!file) return res.status(404).end();

    const directUrl = file.Url || file.url;
    const fileId = fileIdFromRef(file);

    const source = directUrl
      ? String(directUrl)
      : fileId
        ? BASE + "/files/" + encodeURIComponent(fileId)
        : "";

    if (!source) return res.status(404).end();

    const image = await fetch(source, directUrl ? undefined : {
      headers: { Authorization: "Bearer " + API_KEY, Accept: "*/*" }
    });

    if (!image.ok) return res.status(image.status).end();

    const contentType = image.headers.get("content-type") || "application/octet-stream";
    const disposition = image.headers.get("content-disposition");
    const bytes = Buffer.from(await image.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    if (disposition) res.setHeader("Content-Disposition", disposition);
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).send(bytes);
  } catch (error) {
    console.error("Animal photo proxy error", error);
    return res.status(500).json({ error: "Failed to load animal photo" });
  }
}
