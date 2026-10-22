import { fetchEntryByNumber } from "./cognito";
import type { PublicAnimal } from "./public-animal";

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function pick(row: any, ...keys: string[]) {
  for (const key of keys) {
    if (row && row[key] != null && row[key] !== "") return row[key];
  }
  return "";
}

function fileUrl(value: any): string {
  if (typeof value === "string" && /\(F-[^)]+\)/.test(value)) return value;
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = fileUrl(item);
      if (url) return url;
    }
    return "";
  }
  return clean(value.Url || value.url || value.DownloadUrl || value.DownloadURL || value.FileUrl || value.FileURL);
}

function collectPhotos(row: any): string[] {
  const values = [
    pick(row, "DogProfile_Photo", "MainPhoto", "Main_Photo", "Photo", "PrimaryPhoto"),
    pick(row, "AdditionalDogPhotos_Photo1", "Intake_Photo1", "AdditionalPhoto1", "Additional_Photo_1"),
    pick(row, "AdditionalDogPhotos_Photo2", "Intake_Photo22", "AdditionalPhoto2", "Additional_Photo_2"),
    pick(row, "AdditionalDogPhotos_Photo3", "Intake_Photo3", "AdditionalPhoto3", "Additional_Photo_3"),
    pick(row, "AdditionalDogPhotos_Photo4", "Intake_Photo4", "AdditionalPhoto4", "Additional_Photo_4"),
  ];
  const urls: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const url = fileUrl(item);
        if (url && !urls.includes(url)) urls.push(url);
      }
    } else {
      const url = fileUrl(value);
      if (url && !urls.includes(url)) urls.push(url);
    }
  }
  return urls;
}

export function odataRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

export function odataEntryNumber(row: any): string {
  return clean(
    pick(
      row,
      "Id",
      "MBPRDogRecord_Id",
      "Number",
      "EntryNumber",
      "Entry_Number",
      "EntryNumberValue",
      "Entry",
      "Id",
      "#"
    )
  ).replace(/^#/, "");
}

export function odataIsAvailable(row: any): boolean {
  const code = clean(pick(row, "DogStatus", "Code", "Status", "Availability"));
  return /^(available|vip)\b/i.test(code);
}

export function odataToPublicAnimal(formId: string, row: any, publicBaseUrl = ""): PublicAnimal {
  const entryId = odataEntryNumber(row);
  const rawPhotos = collectPhotos(row);
  const key = entryId ? "dog-" + formId + "-" + entryId : "";
  const photos = key && publicBaseUrl ? rawPhotos.map((_, index) => publicBaseUrl + "/api/animals/" + key + "/photo/" + index) : rawPhotos;
  const code = clean(pick(row, "DogStatus", "Code", "Status"));
  const availability = clean(pick(row, "DogStatus", "Availability", "Code", "Status"));

  return {
    form_id: formId,
    entry_id: entryId,
    animal_key: key,
    name: clean(pick(row, "DogProfile_DogName", "DogName", "Dog_Name", "Name")) || "Available Pup",
    story: clean(pick(row, "Intake_MyStory", "MyStory", "My_Story", "Story", "Description")),
    code,
    status: availability || code || "Available",
    litter: clean(pick(row, "DogProfile_LitterName", "LitterName", "Litter_Name", "Litter")),
    birthday: clean(pick(row, "DogProfile_DateOfBirth", "PupBirthday", "Pup_Birthday", "Birthday")),
    age: clean(pick(row, "DogProfile_Age", "Age")),
    breed: clean(pick(row, "DogProfile_PrimaryBreed", "Breed")),
    gender: clean(pick(row, "DogProfile_Sex", "Gender", "Sex")),
    size: clean(pick(row, "DogProfile_EstimatedAdultSize", "EstimatedSizeWhenGrown", "Estimated_Size_When_Grown", "AdultSize", "Size")),
    availability,
    photos,
    primary_photo: photos[0] || "",
  };
}

// For Form 49, the REST entry is the source of truth for nested photo fields.
// Count files using the exact same order as the photo endpoint, so /photo/N
// never points at a different file when a field is empty.
function form49PhotoCount(entry: any): number {
  const normalize = (value: any): any[] =>
    (Array.isArray(value) ? value : value == null ? [] : [value]).filter(Boolean);
  return [
    entry?.DogProfile?.Photo,
    entry?.AdditionalDogPhotos?.Photo1 ?? entry?.Intake?.Photo1,
    entry?.AdditionalDogPhotos?.Photo2 ?? entry?.Intake?.Photo22,
    entry?.AdditionalDogPhotos?.Photo3 ?? entry?.Intake?.Photo3,
    entry?.AdditionalDogPhotos?.Photo4 ?? entry?.Intake?.Photo4,
  ].reduce((total, value) => total + normalize(value).length, 0);
}

// Public website feed: Cognito OData -> normalized read-only animal records.
export async function fetchPublicAnimalsFromOData(formId: string, publicBaseUrl = ""): Promise<PublicAnimal[]> {
  const url = (process.env.PUBLIC_ANIMALS_ODATA_URL || "").trim();
  if (!url) throw new Error("Missing PUBLIC_ANIMALS_ODATA_URL");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error("Cognito OData fetch failed: " + response.status + " " + response.statusText + " - " + text.slice(0, 500));
  }

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Cognito OData returned non-JSON content");
  }

  const animals = odataRows(payload)
    .filter(odataIsAvailable)
    .map((row) => odataToPublicAnimal(formId, row, publicBaseUrl))
    .filter((animal) => animal.entry_id && animal.animal_key);

  if (formId === "49") {
    const apiKey = (process.env.COGNITO_API_KEY || "").trim();
    if (!apiKey) throw new Error("Missing COGNITO_API_KEY for Form 49 photo mapping");
    // Fail the preview feed rather than silently publish an incomplete gallery.
    await Promise.all(animals.map(async (animal) => {
      const entry = await fetchEntryByNumber(formId, animal.entry_id, apiKey);
      const count = form49PhotoCount(entry);
      animal.photos = Array.from({ length: count }, (_, index) =>
        publicBaseUrl + "/api/animals/" + animal.animal_key + "/photo/" + index
      );
      animal.primary_photo = animal.photos[0] || "";
    }));
  }

  return animals.sort((a, b) => a.name.localeCompare(b.name));
}
