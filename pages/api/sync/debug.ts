import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const base   = process.env.COGNITO_API_BASE ?? "https://www.cognitoforms.com/api";
  const formId = (process.env.COGNITO_FORM_ID || "").trim();
  const key    = (process.env.COGNITO_API_KEY || "").trim();

  if (!key || !formId) {
    return res.status(500).json({ error: "Missing envs", formId, keyPresent: !!key });
  }

  const url = `${base}/forms/${formId}/entries`;
  const r   = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const t   = await r.text();
  return res.status(200).json({
    base,
    formId,
    tokenLen: key.length,
    testUrl: url,
    status: r.status,
    ok: r.ok,
    bodyPreview: t.slice(0, 300)
  });
}
