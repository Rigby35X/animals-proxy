export default function handler(req, res) {
  res.json({ endpoint: 'webhook', method: req.method });
}