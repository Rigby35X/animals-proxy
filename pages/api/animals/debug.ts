import type { NextApiRequest, NextApiResponse } from "next";

const ODATA_URL = (process.env.PUBLIC_ANIMALS_ODATA_URL || "").trim();

function rows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!ODATA_URL) return res.status(500).json({ error: "Missing PUBLIC_ANIMALS_ODATA_URL" });

  try {
    const response = await fetch(ODATA_URL, { headers: { Accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: "OData request failed" });

    const payload = JSON.parse(text);
    const data = rows(payload);
    const keys = Array.from(new Set(data.slice(0, 10).flatMap((row: any) => Object.keys(row || {})))).sort();

    // Return structure only, not row values, to avoid exposing private entry data.
    return res.status(200).json({
      row_count: data.length,
      top_level_keys: payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload) : [],
      row_keys: keys,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "debug failed" });
  }
}
