import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(_: NextApiRequest, res: NextApiResponse) {
  try {
    const base = process.env.COGNITO_API_BASE ?? "https://www.cognitoforms.com/api";
    const key  = process.env.COGNITO_API_KEY || "";
    if (!key) return res.status(500).json({ error: "Missing COGNITO_API_KEY" });

    const r = await fetch(`${base}/forms`, { headers: { Authorization: `Bearer ${key}` } });
    const body = await r.text();
    return res.status(r.status).json(safeJson(body));
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "failed" });
  }
}

function safeJson(s:string){ try { return JSON.parse(s); } catch { return { raw:s }; } }
