export default async function handler(req, res) {
  // Debug what we're receiving
  const mode = req.query.mode;
  
  if (mode === 'shopify') {
    const SHOP = process.env.SHOPIFY_STORE;
    const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
    
    return res.json({
      message: 'Shopify test mode',
      hasShop: !!SHOP,
      hasToken: !!TOKEN,
      shopValue: SHOP || 'missing',
      tokenStart: TOKEN ? TOKEN.substring(0, 8) + '...' : 'missing'
    });
  }
  
  // Show what we received
  return res.json({ 
    message: "API working",
    receivedMode: mode,
    allQuery: req.query,
    method: req.method
  });
}