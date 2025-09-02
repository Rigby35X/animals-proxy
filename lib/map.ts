import slugify from "slugify";
import { CognitoEntry, collectFileRefs } from "./cognito";

const HANDLE_SUFFIX = process.env.HANDLE_SUFFIX ?? "-mbpr";

export function toHandle(name: string) {
  const base = slugify(`${name} ${name}`, { lower: true, strict: true }); // keep your current pattern
  return `${base}${HANDLE_SUFFIX}`;
}

export function tagsForCode(code?: string): string[] {
  const tags = ["mbpr-managed"];
  const val = (code || "").trim();

  const availableVals = new Set([
    "Available: Now",
    "Available Now: Mama's",
    "Available: VIP Litter"
  ]);

  if (availableVals.has(val)) {
    tags.push("mbpr-available");
  } else if (val === "Adopted") {
    tags.push("mbpr-adopted");
  }
  return tags;
}

export function mapMetafields(entry: CognitoEntry) {
  const ns = "mbpr";
  const metas: Array<{ namespace: string; key: string; type: string; value: string }> = [];

  if (entry.LitterName) metas.push({ namespace: ns, key: "litter", type: "single_line_text_field", value: String(entry.LitterName) });
  if (entry.PupBirthday) metas.push({ namespace: ns, key: "birthday", type: "date", value: new Date(entry.PupBirthday).toISOString().slice(0,10) });
  if (entry.Breed) metas.push({ namespace: ns, key: "breed", type: "single_line_text_field", value: String(entry.Breed) });
  if (entry.Gender) metas.push({ namespace: ns, key: "gender", type: "single_line_text_field", value: String(entry.Gender) });
  if (entry.EstimatedSizeWhenGrown) metas.push({ namespace: ns, key: "adult_size", type: "single_line_text_field", value: String(entry.EstimatedSizeWhenGrown) });
  if (entry.Availability) metas.push({ namespace: ns, key: "availability", type: "single_line_text_field", value: String(entry.Availability) });

  return metas;
}

export function imageFileRefs(entry: CognitoEntry) {
  return collectFileRefs(entry);
}
