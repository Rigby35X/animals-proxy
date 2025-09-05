// lib/cognito.ts

export type CognitoFileRef = {
  Id?: number | string;
  FileName?: string;
  Url?: string;
};

export type CognitoEntry = {
  Id: number;
  DogName: string;
  MyStory?: string;
  Code?: string;

  LitterName?: string;
  PupBirthday?: string;
  Breed?: string;
  Gender?: string;
  EstimatedSizeWhenGrown?: string;
  Availability?: string;

  MainPhoto?: CognitoFileRef | null;
  AdditionalPhoto1?: CognitoFileRef | null;
  AdditionalPhoto2?: CognitoFileRef | null;
  AdditionalPhoto3?: CognitoFileRef | null;
  AdditionalPhoto4?: CognitoFileRef | null;
};

// ✅ Read base from env (so every lambda uses the same host). Falls back to .com.
const BASE = (process.env.COGNITO_API_BASE || "https://www.cognitoforms.com/api").trim();

/**
 * Fetch all entries for a form. Throws with detailed status/body so callers see the real cause.
 */
export async function fetchEntries(formIdRaw: string, apiKeyRaw: string): Promise<CognitoEntry[]> {
  const formId = (formIdRaw || "").trim();
  const apiKey = (apiKeyRaw || "").trim();
  if (!formId || !apiKey) {
    throw new Error(`Missing formId/apiKey (got formId="${formId}", keyLen=${apiKey.length})`);
  }

  const url = `${BASE}/forms/${formId}/entries`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    // Helpful server-side log
    console.error("Cognito entries error", {
      url,
      status: r.status,
      statusText: r.statusText,
      bodyPreview: body.slice(0, 500)
    });
    throw new Error(`Cognito fetch entries failed: ${r.status} ${r.statusText} - ${body}`);
  }

  const data = await r.json();
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
