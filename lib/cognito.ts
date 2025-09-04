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
  // Try the most common endpoint format first
  const url = `${BASE}/forms/${formId}/entries`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error(`Cognito API Error:`, {
      url,
      status: r.status,
      statusText: r.statusText,
      body,
      headers: Object.fromEntries(r.headers.entries())
    });
    throw new Error(`Cognito fetch entries failed: ${r.status} ${r.statusText} - ${body}`);
  }

  const data = await r.json();
  console.log(`Successfully fetched ${Array.isArray(data) ? data.length : 'unknown'} entries from Cognito`);
  return data as CognitoEntry[];
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
