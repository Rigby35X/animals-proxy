// pages/api/cognito/webhook.js
// Receives real-time updates from Cognito Forms

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Optional: verify webhook secret
    const webhookSecret = process.env.COGNITO_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-cognito-signature'];
      if (signature !== webhookSecret) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const entry = req.body;
    
    // Validate required fields
    if (!entry.DogName) {
      return res.status(400).json({ error: 'Missing DogName' });
    }

    console.log('Processing Cognito entry:', entry.Id, entry.DogName);

    // Create handle (tj-danger-tj-danger pattern)
    const handle = createHandle(entry.DogName);
    
    // Check if product already exists
    const existingProduct = await findShopifyProduct(handle);
    
    // Map Cognito entry to Shopify product
    const productData = {
      id: existingProduct?.id,
      title: entry.DogName,
      bodyHtml: entry.MyStory || '',
      tags: createTags(entry),
      handle: handle
    };

    // Create or update the product
    const productId = await upsertShopifyProduct(productData);
    
    // Set metafields (breed, birthday, etc.)
    const metafields = createMetafields(entry);
    if (metafields.length > 0) {
      await setShopifyMetafields(productId, metafields);
    }

    // Handle images (MainPhoto + AdditionalPhoto1-4)
    const imageUrls = await getImageUrls(entry);
    if (imageUrls.length > 0) {
      await updateShopifyImages(productId, imageUrls);
    }

    return res.status(200).json({ 
      success: true, 
      productId, 
      handle,
      dogName: entry.DogName
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

// Helper functions
function createHandle(dogName) {
  const slug = dogName.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')         // Spaces to hyphens
    .replace(/-+/g, '-')          // Multiple hyphens to single
    .replace(/^-|-$/g, '');       // Trim hyphens
  
  return `${slug}-${slug}`; // tj-danger-tj-danger pattern
}

function createTags(entry) {
  const tags = ['mbpr-managed'];
  
  // Based on your Code field values
  const availableStatuses = [
    'Available: Now',
    'Available Now: Mama\'s'
  ];
  
  if (entry.Code && availableStatuses.includes(entry.Code)) {
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
    // Convert to YYYY-MM-DD format
    const date = new Date(entry.PupBirthday);
    if (!isNaN(date.getTime())) {
      metafields.push({
        namespace: ns,
        key: 'birthday',
        type: 'date', 
        value: date.toISOString().slice(0, 10)
      });
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

async function getImageUrls(entry) {
  // For now, return empty array - we'll implement image handling next
  // This requires downloading files from Cognito API
  return [];
}

// Shopify API helpers (you'll need to implement these)
async function findShopifyProduct(handle) {
  // TODO: Implement GraphQL query to find product by handle
  return null;
}

async function upsertShopifyProduct(productData) {
  // TODO: Implement GraphQL mutation to create/update product
  return 'gid://shopify/Product/123'; // Placeholder
}

async function setShopifyMetafields(productId, metafields) {
  // TODO: Implement metafields GraphQL mutation
}

async function updateShopifyImages(productId, imageUrls) {
  // TODO: Implement image upload GraphQL mutation  
}