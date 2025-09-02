export type CognitoFileRef = {
  Id?: number | string;       // some Cognito file payloads include Id
  FileName?: string;
  Url?: string;               // sometimes Cognito provides a direct URL
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

const BASE = "https://www.cognitoforms.com/api";

export async function fetchEntries(formId: string, apiKey: string): Promise<CognitoEntry[]> {
  const res = await fetch(`${BASE}/forms/${formId}/entries`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`Cognito fetch entries failed: ${res.status}`);
  // Cognito returns an array of entries with field internal names as keys
  return (await res.json()) as CognitoEntry[];
}

/**
 * Attempt to resolve public-ish URLs for images.
 * If Cognito already provides `Url`, we can use it directly with productCreateMedia.
 * If not, you can fall back to Shopify staged upload by first downloading bytes from Cognito.
 * For downloading bytes, you'll likely call a Files endpoint like:
 *   GET /files/{fileId}
 * with the same Bearer token; adapt as needed if your payload differs.
 */
export function collectFileRefs(entry: CognitoEntry): CognitoFileRef[] {
  const list: CognitoFileRef[] = [];
  if (entry.MainPhoto) list.push(entry.MainPhoto);
  if (entry.AdditionalPhoto1) list.push(entry.AdditionalPhoto1);
  if (entry.AdditionalPhoto2) list.push(entry.AdditionalPhoto2);
  if (entry.AdditionalPhoto3) list.push(entry.AdditionalPhoto3);
  if (entry.AdditionalPhoto4) list.push(entry.AdditionalPhoto4);
  return list.filter(Boolean);
}
