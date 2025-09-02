// pages/api/cognito/webhook.js
import { findProductByHandle, createProduct, updateProduct, setMetafields } from '../shopify-helpers.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const entry = req.body;
    console.log('Received Cognito entry:', entry.Id, entry.DogName);
    
    if (!entry.DogName) {
      return res.status(400).json({ error: 'Missing DogName' });
    }

    // Create handle: tj-danger-tj-danger pattern
    const handle = createHandle(entry.DogName);
    
    // Check if product exists
    const existingProduct = await findProductByHandle(handle);
    
    // Create tags based on availability status
    const tags = createTags(entry);
    
    const productInput = {
      title: entry.DogName,
      bodyHtml: entry.MyStory || '',
      tags: tags,
      handle: handle,
      status: 'ACTIVE'
    };

    let product;
    if (existingProduct) {
      productInput.id = existingProduct.id;
      product = await updateProduct(productInput);
    } else {
      product = await createProduct(productInput);
    }

    // Set metafields (breed, birthday, etc.)
    const metafields = createMetafields(entry);
    if (metafields.length > 0) {
      await setMetafields(product.id, metafields);
    }

    console.log('Successfully processed:', product.handle);

    return res.status(200).json({ 
      success: true, 
      productId: product.id,
      handle: product.handle,
      dogName: entry.DogName,
      status: entry.Code
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

function createHandle(dogName) {
  const slug = dogName.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars  
    .replace(/\s+/g, '-')         // Spaces to hyphens
    .replace(/-+/g, '-')          // Multiple hyphens to single
    .replace(/^-|-$/g, '');       // Trim edge hyphens
  
  return `${slug}-${slug}`;
}

function createTags(entry) {
  const tags = ['mbpr-managed'];
  
  // Available now statuses
  const availableNow = [
    'Available: Now',
    'Available Now: Mama\'s'
  ];
  
  if (entry.Code && availableNow.includes(entry.Code)) {
    tags.push('mbpr-available');
  }
  
  return tags;
}

function createMetafields(entry) {
  const metafields = [];
  const ns = 'mbpr';
  
  if (entry.LitterName) {
    metafields.push({
      namespace: ns,
      key: 'litter',
      type: 'single_line_text_field',
      value: String(entry.LitterName)
    });
  }
  
  if (entry.PupBirthday) {
    try {
      const date = new Date(entry.PupBirthday);
      if (!isNaN(date.getTime())) {
        metafields.push({
          namespace: ns,
          key: 'birthday',
          type: 'date',
          value: date.toISOString().slice(0, 10)
        });
      }
    } catch (e) {
      console.warn('Invalid birthday format:', entry.PupBirthday);
    }
  }
  
  if (entry.Breed) {
    metafields.push({
      namespace: ns,
      key: 'breed', 
      type: 'single_line_text_field',
      value: String(entry.Breed)
    });
  }
  
  if (entry.Gender) {
    metafields.push({
      namespace: ns,
      key: 'gender',
      type: 'single_line_text_field', 
      value: String(entry.Gender)
    });
  }
  
  if (entry.EstimatedSizeWhenGrown) {
    metafields.push({
      namespace: ns,
      key: 'adult_size',
      type: 'single_line_text_field',
      value: String(entry.EstimatedSizeWhenGrown)
    });
  }
  
  if (entry.Code) {
    metafields.push({
      namespace: ns,
      key: 'availability',
      type: 'single_line_text_field',
      value: String(entry.Code)
    });
  }
  
  return metafields;
}