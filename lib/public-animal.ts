import type { CognitoEntry, CognitoFileRef } from "./cognito";

export type PublicAnimal = {
  form_id: string;
  entry_id: string;
  animal_key: string;
  name: string;
  story: string;
  code: string;
  status: string;
  litter: string;
  birthday: string;
  breed: string;
  gender: string;
  size: string;
  availability: string;
  photos: string[];
  primary_photo: string;
};

const AVAILABLE_CODES = new Set([
  "Available: Now",
  "Available Now: Mama's",
  "Available: VIP Litter",
]);

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function photoUrl(ref?: CognitoFileRef | null): string {
  return clean(ref?.Url);
}

export function entryNumber(formId: string, entry: CognitoEntry): string {
  const nested = entry?.Entry?.Number;
  if (nested != null && String(nested).trim()) return String(nested).trim();

  const explicit = clean(entry?.Id);
  if (!explicit) return "";

  const prefix = formId + "-";
  if (explicit.startsWith(prefix)) return explicit.slice(prefix.length);

  const trailing = explicit.match(/(\d+)$/);
  return trailing?.[1] || explicit;
}

export function animalKey(formId: string, entry: CognitoEntry): string {
  const number = entryNumber(formId, entry);
  return number ? "dog-" + formId + "-" + number : "";
}

export function isPubliclyAvailable(entry: CognitoEntry): boolean {
  const code = clean(entry?.Code);
  const availability = clean(entry?.Availability);
  return AVAILABLE_CODES.has(code) || /^available\b/i.test(availability);
}

export function toPublicAnimal(formId: string, entry: CognitoEntry): PublicAnimal {
  const refs = [
    entry.MainPhoto,
    entry.AdditionalPhoto1,
    entry.AdditionalPhoto2,
    entry.AdditionalPhoto3,
    entry.AdditionalPhoto4,
  ];
  const photos = refs.map(photoUrl).filter(Boolean);

  const code = clean(entry.Code);
  const availability = clean(entry.Availability);
  const status = availability || code || "Available";

  return {
    form_id: formId,
    entry_id: entryNumber(formId, entry),
    animal_key: animalKey(formId, entry),
    name: clean(entry.DogName) || "Available Pup",
    story: clean(entry.MyStory),
    code,
    status,
    litter: clean(entry.LitterName),
    birthday: clean(entry.PupBirthday),
    breed: clean(entry.Breed),
    gender: clean(entry.Gender),
    size: clean(entry.EstimatedSizeWhenGrown),
    availability,
    photos,
    primary_photo: photos[0] || "",
  };
}
