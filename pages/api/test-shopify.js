export default async function handler(req, res) {
  const SHOP = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  
  if (!SHOP || !TOKEN) {
    return res.status(500).json({ 
      error: 'Missing environment variables',
      hasShop: !!SHOP,
      hasToken: !!TOKEN 
    });
  }

  try {
    const response = await fetch(`https://${SHOP}/admin/api/2024-07/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `{ shop { name id } }`
      })
    });

    const data = await response.json();
    
    return res.status(200).json({
      status: response.status,
      shopifyResponse: data,
      store: SHOP
    });
    
  } catch (error) {
    return res.status(500).json({ 
      error: 'Connection failed',
      message: error.message 
    });
  }
}