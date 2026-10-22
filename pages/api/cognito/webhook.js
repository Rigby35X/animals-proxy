import { form49Metafields, form49Tags } from '../../../lib/form49-shopify-fields';
import { fetchEntryByNumber } from '../../../lib/cognito';
import { mapForm49 } from '../sync/form49-audit';
import { findProductByHandle, upsertProduct, setMetafields, addMissingForm49Images } from '../../../lib/shopify';

// The existing Cognito webhook is retained, now with Form 49 field mapping.
// Form 49 notifications can contain either the full entry or just its entry ID.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    // Cognito Post JSON Data can call a URL containing the shared token.
    // Never accept webhook writes without validating the existing secret.
    const secret = process.env.COGNITO_WEBHOOK_SECRET;
    const supplied = String(req.query.token || '');
    if (!secret || !supplied || supplied !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
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
    const tags = form49Tags(dog.status);
    const id = await upsertProduct({
      id: existing?.id, handle: dog.handle, title: dog.name,
      bodyHtml: dog.story, tags, status: 'ACTIVE',
    });
    await setMetafields(id, form49Metafields(dog));
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
