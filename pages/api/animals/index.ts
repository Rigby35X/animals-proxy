import type { NextApiRequest, NextApiResponse } from "next";
import { fetchEntries } from "../../../lib/cognito";
import { isPubliclyAvailable, toPublicAnimal } from "../../../lib/public-animal";

const FORM_ID = (process.env.COGNITO_FORM_ID || "").trim();
const API_KEY = (process.env.COGNITO_API_KEY || "").trim();

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
    if (!FORM_ID || !API_KEY) {
      return res.status(500).json({ error: "Animal API is not configured" });
    }

    const entries = await fetchEntries(FORM_ID, API_KEY);
    const animals = entries
      .filter(isPubliclyAvailable)
      .map((entry) => toPublicAnimal(FORM_ID, entry))
      .filter((animal) => animal.entry_id && animal.animal_key)
      .sort((a, b) => a.name.localeCompare(b.name));

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
