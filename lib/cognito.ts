// lib/cognito.ts

export type CognitoFileRef = {
  Id?: number | string;
  FileName?: string;
  Url?: string;
  [key: string]: any;
};

export type CognitoFileValue = CognitoFileRef | CognitoFileRef[] | string | null;

export type CognitoEntry = {
  Id: string | number;        // e.g. "24-67"
  DogName: string;
  MyStory?: string;
  Code?: string;

  LitterName?: string;
  PupBirthday?: string;       // date-like string
  Breed?: string;
  Gender?: string;
  EstimatedSizeWhenGrown?: string;
  Availability?: string;

  Entry?: {
    Number?: number;          // numeric entry number (sometimes available)
  };

  MainPhoto?: CognitoFileValue;
  AdditionalPhoto1?: CognitoFileValue;
  AdditionalPhoto2?: CognitoFileValue;
  AdditionalPhoto3?: CognitoFileValue;
  AdditionalPhoto4?: CognitoFileValue;
};

// ✅ Correct base (no /v1)
const BASE = (process.env.COGNITO_API_BASE || "https://www.cognitoforms.com/api").trim();

/**
 * Fetch all entries for a form.
 * Throws with detailed status/body when Cognito errors,
 * so your /api/sync/run endpoint shows exactly what went wrong (401/403/404/etc).
 */
export async function fetchEntries(formId: string, apiKey: string): Promise<CognitoEntry[]> {
  const url = `${BASE}/forms/${formId}/entries`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error(`Cognito API Error:`, {
      url,
      status: r.status,
      statusText: r.statusText,
      body,
      headers: Object.fromEntries(r.headers.entries()),
    });
    throw new Error(`Cognito fetch entries failed: ${r.status} ${r.statusText} - ${body}`);
  }

  const data = await r.json();
  console.log(
    `Successfully fetched ${Array.isArray(data) ? data.length : "unknown"} entries from Cognito`
  );
  return data as CognitoEntry[];
}

/** Gather all file refs (main + up to 4 additional) from an entry */
export function collectFileRefs(entry: CognitoEntry): CognitoFileRef[] {
  const values = [
    entry.MainPhoto,
    entry.AdditionalPhoto1,
    entry.AdditionalPhoto2,
    entry.AdditionalPhoto3,
    entry.AdditionalPhoto4,
  ];

  const out: CognitoFileRef[] = [];
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) if (item) out.push(item);
    } else if (typeof value === "string") {
      out.push({ FileName: value });
    } else {
      out.push(value);
    }
  }
  return out;
}

export function fileIdFromRef(ref: CognitoFileRef): string {
  const direct = ref?.Id ?? ref?.id ?? ref?.FileId ?? ref?.FileID ?? ref?.File?.Id ?? ref?.File?.id;
  if (direct != null && String(direct).trim()) return String(direct).trim();

  const text = [ref?.FileName, ref?.Name, ref?.DisplayName]
    .filter(Boolean)
    .map(String)
    .join(" ");
  const match = text.match(/(F-[A-Za-z0-9_-]+)/);
  return match?.[1] || "";
}

/** ✅ Build a stable key like "24-67" */
export function stableEntryId(formId: string, e: CognitoEntry): string {
  const explicit = String(e.Id ?? "").trim();
  if (explicit) return explicit;
  const num = e.Entry?.Number;
  if (num) return `${formId}-${num}`;
  return "";
}


/** Fetch one Cognito entry by numeric entry number. Used by the public image proxy. */
export async function fetchEntryByNumber(formId: string, entryNumber: string | number, apiKey: string): Promise<CognitoEntry> {
  const url = `${BASE}/forms/${formId}/entries/${entryNumber}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Cognito fetch entry failed: ${r.status} ${r.statusText} - ${body}`);
  }

  return (await r.json()) as CognitoEntry;
}
