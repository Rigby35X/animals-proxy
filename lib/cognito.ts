// lib/cognito.ts

export type CognitoFileRef = {
  Id?: number | string;
  FileName?: string;
  Url?: string; // some payloads include a direct URL
};

export type CognitoEntry = {
  Id: number;
  DogName: string;
  MyStory?: string;
  Code?: string;

  LitterName?: string;
  PupBirthday?: string;   // date-like string
  Breed?: string;
  Gender?: string;
  EstimatedSizeWhenGrown?: string;
  Availability?: string;  // optional

  MainPhoto?: CognitoFileRef | null;
  AdditionalPhoto1?: CognitoFileRef | null;
  AdditionalPhoto2?: CognitoFileRef | null;
  AdditionalPhoto3?: CognitoFileRef | null;
  AdditionalPhoto4?: CognitoFileRef | null;
};

// ✅ Correct base (no /v1)
const BASE = "https://www.cognitoforms.com/api";

/**
 * Fetch all entries for a form. Throws with detailed status/body when Cognito errors,
 * so your /api/sync/run endpoint shows exactly what went wrong (401/403/404/etc).
 */
export async function fetchEntries(formId: string, apiKey: string): Promise<CognitoEntry[]> {
  const r = await fetch(`${BASE}/forms/${formId}/entries`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Cognito fetch entries failed: ${r.status} ${body}`);
  }

  return (await r.json()) as CognitoEntry[];
}

/** Gather all file refs (main + up to 4 additional) from an entry */
export function collectFileRefs(entry: CognitoEntry): CognitoFileRef[] {
  const list: CognitoFileRef[] = [];
  if (entry.MainPhoto) list.push(entry.MainPhoto);
  if (entry.AdditionalPhoto1) list.push(entry.AdditionalPhoto1);
  if (entry.AdditionalPhoto2) list.push(entry.AdditionalPhoto2);
  if (entry.AdditionalPhoto3) list.push(entry.AdditionalPhoto3);
  if (entry.AdditionalPhoto4) list.push(entry.AdditionalPhoto4);
  return list.filter(Boolean);
}
