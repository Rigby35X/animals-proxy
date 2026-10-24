import type { NextApiRequest, NextApiResponse } from "next";
import { fetchPublicAnimalsFromOData } from "../../../lib/cognito-odata";
import { fetchEntries } from "../../../lib/cognito";
import { mapForm49 } from "../sync/form49-audit";

const FORM_ID = (process.env.COGNITO_FORM_ID || process.env.PUBLIC_ANIMALS_COGNITO_FORM_ID || "").trim();

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

    const proto = String(req.headers["x-forwarded-proto"] || "https");
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    const publicBaseUrl = host ? proto + "://" + host : "";

    const animals = FORM_ID === "49"
      ? (await fetchEntries("49", process.env.COGNITO_API_KEY || ""))
          .map(mapForm49)
          .filter((dog): dog is NonNullable<typeof dog> => dog !== null)
          .filter((dog) => /^(available|vip)\b/i.test(dog.status))
          .map((dog) => {
            const photos = Array.from({ length: dog.photo_count }, (_, index) =>
              publicBaseUrl + "/api/animals/" + dog.handle + "/photo/" + index
            );
            return {
              form_id: "49", entry_id: dog.entry_number, animal_key: dog.handle,
              name: dog.name, story: dog.story, code: dog.status, status: dog.status,
              litter: dog.litter, birthday: "", age: dog.age, breed: dog.breed,
              gender: dog.gender, size: dog.size, availability: dog.status,
              photos, primary_photo: photos[0] || "",
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name))
      : await fetchPublicAnimalsFromOData(FORM_ID, publicBaseUrl);
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
