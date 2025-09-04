import type { NextApiRequest, NextApiResponse } from "next";

const FORM_ID = process.env.COGNITO_FORM_ID!;
const COGNITO_API_KEY = process.env.COGNITO_API_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!FORM_ID || !COGNITO_API_KEY) {
    return res.status(500).json({ 
      error: "Missing environment variables",
      hasFormId: !!FORM_ID,
      hasApiKey: !!COGNITO_API_KEY 
    });
  }

  try {
    const tests: any = {};

    // Test different endpoint variations
    const endpointsToTest = [
      {
        name: "forms_metadata",
        url: `https://www.cognitoforms.com/api/forms/${FORM_ID}`,
        description: "Form metadata"
      },
      {
        name: "entries_v1",
        url: `https://www.cognitoforms.com/api/forms/${FORM_ID}/entries`,
        description: "Entries (current endpoint)"
      },
      {
        name: "entries_v2",
        url: `https://www.cognitoforms.com/api/v1/forms/${FORM_ID}/entries`,
        description: "Entries with /v1 prefix"
      },
      {
        name: "organization_forms",
        url: `https://www.cognitoforms.com/api/forms`,
        description: "List all forms (to verify API key works)"
      }
    ];

    for (const endpoint of endpointsToTest) {
      console.log(`Testing ${endpoint.name}: ${endpoint.url}`);

      try {
        const response = await fetch(endpoint.url, {
          headers: {
            Authorization: `Bearer ${COGNITO_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });

        const result = {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        };

        let data = null;
        try {
          const text = await response.text();
          if (text) {
            try {
              const parsed = JSON.parse(text);
              // Limit response size for entries
              if (endpoint.name.includes('entries') && Array.isArray(parsed)) {
                data = {
                  count: parsed.length,
                  sample: parsed.slice(0, 1) // Just first entry
                };
              } else if (endpoint.name === 'organization_forms' && Array.isArray(parsed)) {
                data = {
                  count: parsed.length,
                  forms: parsed.map((f: any) => ({ id: f.Id, name: f.Name }))
                };
              } else {
                data = parsed;
              }
            } catch {
              data = text.substring(0, 500); // First 500 chars if not JSON
            }
          }
        } catch (e) {
          data = `Error reading response: ${e}`;
        }

        tests[endpoint.name] = {
          ...result,
          data,
          description: endpoint.description
        };

      } catch (error: any) {
        tests[endpoint.name] = {
          error: error.message,
          description: endpoint.description
        };
      }
    }

    return res.status(200).json({
      formId: FORM_ID,
      apiKeyLength: COGNITO_API_KEY.length,
      apiKeyPrefix: COGNITO_API_KEY.substring(0, 8) + "...",
      tests
    });

  } catch (error: any) {
    console.error("Cognito API test error:", error);
    return res.status(500).json({ 
      error: "Test failed",
      message: error.message,
      stack: error.stack
    });
  }
}
