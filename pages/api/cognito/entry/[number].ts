import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const base   = process.env.COGNITO_API_BASE ?? "https://www.cognitoforms.com/api";
    const key    = process.env.COGNITO_API_KEY || "";
    const formId = process.env.COGNITO_FORM_ID || "";
    const number = req.query.number;
    if (!key || !formId) return res.status(500).json({ error: "Missing COGNITO_API_KEY or COGNITO_FORM_ID" });
    if (!number)         return res.status(400).json({ error: "Missing entry number" });

    const r = await fetch(`${base}/forms/${formId}/entries/${number}`, {
      headers: { Authorization: `Bearer ${key}` }
    });
    const body = await r.text();
    return res.status(r.status).json(safeJson(body));
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "failed" });
  }
}
function safeJson(s:string){ try { return JSON.parse(s); } catch { return { raw:s }; } }
