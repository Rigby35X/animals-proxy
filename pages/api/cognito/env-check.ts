import type { NextApiRequest, NextApiResponse } from "next";
export default function handler(_: NextApiRequest, res: NextApiResponse) {
  const base   = (process.env.COGNITO_API_BASE || "https://www.cognitoforms.com/api").trim();
  const formId = (process.env.COGNITO_FORM_ID || "").trim();
  const key    = (process.env.COGNITO_API_KEY || "").trim();
  res.status(200).json({ base, formId, formId_len: formId.length, key_present: key.length > 0, key_len: key.length });
}
