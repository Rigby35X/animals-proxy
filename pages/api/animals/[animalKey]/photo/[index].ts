import type { NextApiRequest, NextApiResponse } from "next";
import { collectFileRefs, fetchEntryByNumber, fileIdFromRef } from "../../../../../lib/cognito";

const BASE = (process.env.COGNITO_API_BASE || "https://www.cognitoforms.com/api").trim();
const FORM_ID = (process.env.PUBLIC_ANIMALS_COGNITO_FORM_ID || "").trim();
const API_KEY = (process.env.COGNITO_API_KEY || "").trim();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const debug = req.query.debug === "1";
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

    // Prefer Cognito's stable file-id endpoint. Direct file URLs can be
    // short-lived and may return 410 Gone after their token expires.
    const source = fileId
      ? BASE + "/files/" + encodeURIComponent(fileId)
      : directUrl
        ? String(directUrl)
        : "";

    if (!source) return res.status(404).end();

    const usingStableFileEndpoint = Boolean(fileId);
    let image = await fetch(source, usingStableFileEndpoint ? {
      headers: { Authorization: "Bearer " + API_KEY, Accept: "*/*" }
    } : undefined);

    if (!image.ok) {
      if (debug) {
        return res.status(200).json({
          ok: false,
          stage: usingStableFileEndpoint ? "cognito_file_metadata" : "direct_file_url",
          upstreamStatus: image.status,
          formId: FORM_ID,
          entryNumber: match[2],
          photoIndex: index,
          hasFileId: Boolean(fileId),
          hasDirectUrl: Boolean(directUrl),
        });
      }
      return res.status(image.status).end();
    }

    let metadataContentType = "";
    let metadataName = "";

    // Cognito's /files/{id} endpoint returns JSON metadata. Preserve its
    // declared MIME type/name, then follow the short-lived download URL.
    const firstType = image.headers.get("content-type") || "";
    let embeddedBytes: Buffer | null = null;

    if (firstType.includes("application/json")) {
      const metadata = await image.json();
      const downloadUrl = metadata?.File || metadata?.Url || metadata?.url;
      const embeddedContent = metadata?.Content || metadata?.content;
      metadataContentType = String(metadata?.ContentType || metadata?.contentType || "");
      metadataName = String(metadata?.Name || metadata?.FileName || "");

      // Cognito's stable /files/{id} response can include the file itself as
      // base64 in Content. Prefer that over the signed File URL because the
      // signed URL can immediately return 410 Gone.
      if (typeof embeddedContent === "string" && embeddedContent.trim()) {
        const raw = embeddedContent.includes(",")
          ? embeddedContent.slice(embeddedContent.indexOf(",") + 1)
          : embeddedContent;
        embeddedBytes = Buffer.from(raw, "base64");
      } else {
        if (!downloadUrl || typeof downloadUrl !== "string") return res.status(502).end();
        image = await fetch(downloadUrl);
        if (!image.ok) {
          if (debug) {
            return res.status(200).json({
              ok: false,
              stage: "cognito_download_url",
              upstreamStatus: image.status,
              formId: FORM_ID,
              entryNumber: match[2],
              photoIndex: index,
              hasFileId: Boolean(fileId),
              hasDirectUrl: Boolean(directUrl),
            });
          }
          return res.status(image.status).end();
        }
      }
    }

    let contentType = metadataContentType || image.headers.get("content-type") || "application/octet-stream";
    const bytes = embeddedBytes || Buffer.from(await image.arrayBuffer());

    const fileName = String(metadataName || file?.FileName || file?.Name || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) contentType = "image/jpeg";
      else if (fileName.endsWith(".png")) contentType = "image/png";
      else if (fileName.endsWith(".webp")) contentType = "image/webp";
      else if (fileName.endsWith(".gif")) contentType = "image/gif";
      else contentType = "image/jpeg";
    }

    if (debug) {
      return res.status(200).json({
        ok: true,
        stage: "ready",
        formId: FORM_ID,
        entryNumber: match[2],
        photoIndex: index,
        hasFileId: Boolean(fileId),
        hasDirectUrl: Boolean(directUrl),
        contentType,
        byteLength: bytes.length,
        usedEmbeddedContent: Boolean(embeddedBytes),
      });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    res.removeHeader("Content-Disposition");
    return res.end(bytes);
  } catch (error) {
    console.error("Animal photo proxy error", error);
    return res.status(500).json({ error: "Failed to load animal photo" });
  }
}
