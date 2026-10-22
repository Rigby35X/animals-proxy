import { fetchEntryByNumber } from '../../../lib/cognito';
import { mapForm49 } from '../sync/form49-audit';
import { findProductByHandle, upsertProduct, setMetafields, addMissingForm49Images } from '../../../lib/shopify';

// The existing Cognito webhook is retained, now with Form 49 field mapping.
// Form 49 notifications can contain either the full entry or just its entry ID.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const rawId = String(body.Entry?.Number ?? body.Id ?? body.Number ?? '').trim();
    const number = rawId.replace(/^49-/, '');
    if (!/^\\d+$/.test(number)) return res.status(400).json({ error: 'Missing Form 49 entry number' });

    // Fetch the current full record so partial webhook payloads don't erase dog fields.
    const apiKey = process.env.COGNITO_API_KEY;
    if (!apiKey) throw new Error('Missing COGNITO_API_KEY');
    const entry = await fetchEntryByNumber('49', number, apiKey);
    const dog = mapForm49(entry);
    if (!dog) return res.status(422).json({ error: 'Could not map Form 49 entry' });

    const existing = await findProductByHandle(dog.handle);
    const tags = ['mbpr-managed', 'mbpr-form49'];
    if (/^(available|vip)/i.test(dog.status)) tags.push('mbpr-available');
    if (/adopted/i.test(dog.status)) tags.push('mbpr-adopted');
    const id = await upsertProduct({
      id: existing?.id, handle: dog.handle, title: dog.name,
      bodyHtml: dog.story, tags, status: 'ACTIVE',
    });
    const values = {
      age: dog.age, availability: dog.status, breed: dog.breed,
      gender: dog.gender, litter: dog.litter, adult_size: dog.size,
      cognito_form49_handle: dog.handle,
    };
    await setMetafields(id, Object.entries(values).map(([key, value]) => ({
      namespace: 'mbpr', key, type: 'single_line_text_field', value,
    })));
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    if (!/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(host)) throw new Error('Invalid host');
    const urls = Array.from({ length: dog.photo_count }, (_, i) =>
      'https://' + host + '/api/animals/' + dog.handle + '/photo/' + i
    );
    await addMissingForm49Images(id, urls);
    return res.status(200).json({ success: true, handle: dog.handle, productId: id });
  } catch (error) {
    console.error('Form 49 webhook sync failed:', error);
    return res.status(500).json({ error: 'Form 49 webhook sync failed' });
  }
}
