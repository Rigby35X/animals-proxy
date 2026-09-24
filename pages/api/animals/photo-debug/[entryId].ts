import type { NextApiRequest, NextApiResponse } from "next";

const BASE = (process.env.COGNITO_API_BASE || "https://www.cognitoforms.com/api").trim();
const FORM_ID = (process.env.PUBLIC_ANIMALS_COGNITO_FORM_ID || "").trim();
const API_KEY = (process.env.COGNITO_API_KEY || "").trim();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const entryId = Array.isArray(req.query.entryId) ? req.query.entryId[0] : req.query.entryId;
  if (!entryId || !FORM_ID || !API_KEY) return res.status(400).json({ error: "missing config" });

  const response = await fetch(BASE + "/forms/" + FORM_ID + "/entries/" + entryId, {
    headers: { Authorization: "Bearer " + API_KEY, Accept: "application/json" }
  });

  const text = await response.text();
  if (!response.ok) return res.status(response.status).json({ ok: false, status: response.status });

  const data = JSON.parse(text);
  const photoFields = ["MainPhoto","AdditionalPhoto1","AdditionalPhoto2","AdditionalPhoto3","AdditionalPhoto4"];
  const summary:any = {};
  for (const field of photoFields) {
    const value = data?.[field];
    summary[field] = value ? {
      present: true,
      hasUrl: Boolean(value?.Url || value?.url),
      keys: typeof value === "object" ? Object.keys(value) : []
    } : { present: false };
  }
  return res.status(200).json({ ok: true, photoFields: summary });
}
