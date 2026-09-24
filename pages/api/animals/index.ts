import type { NextApiRequest, NextApiResponse } from "next";
import { fetchPublicAnimalsFromOData } from "../../../lib/cognito-odata";

const FORM_ID = (process.env.PUBLIC_ANIMALS_COGNITO_FORM_ID || "").trim();

function cors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    if (!FORM_ID) return res.status(500).json({ error: "Missing PUBLIC_ANIMALS_COGNITO_FORM_ID" });

    const animals = await fetchPublicAnimalsFromOData(FORM_ID);
    return res.status(200).json({
      form_id: FORM_ID,
      count: animals.length,
      animals,
    });
  } catch (error: any) {
    console.error("Public animal list error:", error);
    return res.status(500).json({ error: error?.message || "Failed to fetch animals" });
  }
}
