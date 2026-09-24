import type { NextApiRequest, NextApiResponse } from "next";
import { fetchEntries } from "../../../lib/cognito";
import { animalKey, isPubliclyAvailable, toPublicAnimal } from "../../../lib/public-animal";

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

    const requested = Array.isArray(req.query.animalKey) ? req.query.animalKey[0] : req.query.animalKey;
    if (!requested) return res.status(400).json({ error: "Missing animal key" });

    const expectedPrefix = "dog-" + FORM_ID + "-";
    if (!requested.startsWith(expectedPrefix)) {
      return res.status(404).json({ error: "Animal not found" });
    }

    const entries = await fetchEntries(FORM_ID, API_KEY);
    const match = entries.find((entry) => animalKey(FORM_ID, entry) === requested);

    if (!match || !isPubliclyAvailable(match)) {
      return res.status(404).json({ error: "Animal not found" });
    }

    return res.status(200).json(toPublicAnimal(FORM_ID, match));
  } catch (error: any) {
    console.error("Public animal detail error:", error);
    return res.status(500).json({ error: error?.message || "Failed to fetch animal" });
  }
}
