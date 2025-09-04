import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(_: NextApiRequest, res: NextApiResponse) {
  try {
    const store = process.env.SHOPIFY_STORE!;
    const token = process.env.SHOPIFY_ADMIN_TOKEN!;
    const ver = "2024-07";
    const resp = await fetch(`https://${store}/admin/api/${ver}/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: "{ shop { name primaryDomain { url } } }" })
    });
    const json = await resp.json();
    res.status(resp.ok ? 200 : 500).json(json);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
}
