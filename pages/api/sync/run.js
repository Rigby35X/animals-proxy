export default function handler(req, res) {
  res.json({ endpoint: 'sync', method: req.method });
}