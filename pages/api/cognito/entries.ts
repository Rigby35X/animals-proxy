import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const base   = process.env.COGNITO_API_BASE ?? "https://www.cognitoforms.com/api";
    const key    = process.env.COGNITO_API_KEY || "";
    const formId = process.env.COGNITO_FORM_ID || "";
    if (!key || !formId) return res.status(500).json({ error: "Missing COGNITO_API_KEY or COGNITO_FORM_ID" });

    // passthrough simple pagination if you want: /api/cognito/entries?page=2&pageSize=50
    const url = new URL(`${base}/forms/${formId}/entries`);
    if (req.query.page)     url.searchParams.set("page", String(req.query.page));
    if (req.query.pageSize) url.searchParams.set("pageSize", String(req.query.pageSize));

    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${key}` } });
    const body = await r.text();
    return res.status(r.status).json(safeJson(body));
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "failed" });
  }
}
function safeJson(s:string){ try { return JSON.parse(s); } catch { return { raw:s }; } }
