// lib/cognito.ts
export type CognitoFileRef = { Id?: number | string; FileName?: string; Url?: string };
export type CognitoEntry = {
  Id: number; DogName: string; MyStory?: string; Code?: string;
  LitterName?: string; PupBirthday?: string; Breed?: string; Gender?: string;
  EstimatedSizeWhenGrown?: string; Availability?: string;
  MainPhoto?: CognitoFileRef | null;
  AdditionalPhoto1?: CognitoFileRef | null;
  AdditionalPhoto2?: CognitoFileRef | null;
  AdditionalPhoto3?: CognitoFileRef | null;
  AdditionalPhoto4?: CognitoFileRef | null;
};

const BASE = (process.env.COGNITO_API_BASE || "https://www.cognitoforms.com/api").trim();

async function fetchJson(url: string, key: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} - ${txt}`);
  return JSON.parse(txt);
}

/** Primary: GET entries with explicit pagination; Fallback: plain list */
export async function fetchEntries(formIdRaw: string, apiKeyRaw: string): Promise<CognitoEntry[]> {
  const formId = (formIdRaw || "").trim();
  const key    = (apiKeyRaw || "").trim();
  if (!formId || !key) throw new Error(`Missing formId/apiKey (formId="${formId}", keyLen=${key.length})`);

  const paged = `${BASE}/forms/${formId}/entries?page=1&pageSize=200`;
  try {
    return await fetchJson(paged, key) as CognitoEntry[];
  } catch (e) {
    // Try the plain list as a fallback
    const plain = `${BASE}/forms/${formId}/entries`;
    try {
      return await fetchJson(plain, key) as CognitoEntry[];
    } catch (e2: any) {
      console.error("Cognito entries error", { paged, plain, errorPaged: String(e), errorPlain: String(e2) });
      throw new Error(`Cognito fetch entries failed: ${String(e2)}`);
    }
  }
}

/** Gather all file refs */
export function collectFileRefs(entry: CognitoEntry): CognitoFileRef[] {
  const list: CognitoFileRef[] = [];
  if (entry.MainPhoto) list.push(entry.MainPhoto);
  if (entry.AdditionalPhoto1) list.push(entry.AdditionalPhoto1);
  if (entry.AdditionalPhoto2) list.push(entry.AdditionalPhoto2);
  if (entry.AdditionalPhoto3) list.push(entry.AdditionalPhoto3);
  if (entry.AdditionalPhoto4) list.push(entry.AdditionalPhoto4);
  return list.filter(Boolean);
}
