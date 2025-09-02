import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    service: "Animals Proxy API",
    status: "online",
    timestamp: new Date().toISOString(),
    endpoints: [
      "POST /api/cognito/webhook - Webhook for Cognito form submissions",
      "POST /api/sync/run - Manual sync trigger",
      "GET /api/status - Service status"
    ]
  });
}
