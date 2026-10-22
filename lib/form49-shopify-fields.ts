/** Existing MBPR Shopify metafields confirmed in Shopify Admin. */
type Field = { namespace: string; key: string; type: string; value: string };
const single = (key: string, value: string): Field => ({ namespace: "custom", key, type: "single_line_text_field", value });
const list = (key: string, value: string): Field => ({ namespace: "custom", key, type: "list.single_line_text_field", value: JSON.stringify([value]) });
export function form49Metafields(dog: {age:string;status:string;breed:string;gender:string;litter:string;size:string;story:string}): Field[] {
  const fields: Field[] = [];
  if (dog.age) fields.push(list("age", dog.age));
  if (dog.status) fields.push(single("availability", dog.status));
  if (dog.breed) fields.push(list("breed", dog.breed));
  if (/^(male|female)$/i.test(dog.gender)) fields.push(list("gender", dog.gender.toLowerCase() === "male" ? "Male" : "Female"));
  const size = ["Small","Medium","Large","Extra Large"].find(s => s.toLowerCase() === dog.size.toLowerCase());
  if (size) fields.push(single("size_when_grown_", size));
  if (dog.litter) fields.push(single("litter", dog.litter.slice(0,1000)));
  if (dog.story) fields.push({namespace:"custom",key:"description",type:"multi_line_text_field",value:dog.story.slice(0,1000)});
  return fields;
}
export function form49Tags(status: string): string[] {
  const tags = ["mbpr-managed","mbpr-form49"];
  if (/^available\s*:?\s*now$/i.test(status.trim())) tags.push("Available Now","Available: Now","mbpr-available");
  else if (/^(available|vip)/i.test(status)) tags.push("mbpr-available");
  if (/adopted/i.test(status)) tags.push("mbpr-adopted");
  return tags;
}
