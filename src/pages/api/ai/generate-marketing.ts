import { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  maxDuration: 60,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { context } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  const prompt = `You are a marketing expert for "Expenso", a modern expense tracker app.
  Generate a catchy email subject and a professional yet engaging email body to announce a new update to users.
  
  Update Context/Features:
  ${context || 'General app improvements and bug fixes.'}
  
  Requirements:
  - Subject: Catchy, short, includes an emoji.
  - Message: Clear, concise, highlights the benefits. Use plain text (no markdown or HTML).
  - Tone: Professional, friendly, exciting.
  - Do NOT include a generic greeting like "Hello Expenso User". Start directly with the hook or the exciting news.
  - Output Format: JSON object with keys "subject" and "message". Do not include markdown formatting like \`\`\`json.
  
  Example Output:
  {
    "subject": "🚀 New Features Arrived!",
    "message": "We have just released a new update with exciting features..."
  }`;

  try {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
      }
    };

    // Try Gemini 2.0 Flash (Latest available model)
    let response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    // Fallback to Gemini 2.5 Flash if 2.0 fails
    if (!response.ok) {
      console.warn('Gemini 2.0 Flash failed, trying Gemini 2.5 Flash...');
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );
    }

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API Error:', errorText);
        throw new Error('Failed to generate content');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        throw new Error('No content generated');
    }

    // Clean up potential markdown code blocks
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let jsonResult;
    try {
        jsonResult = JSON.parse(cleanText);
    } catch (e) {
        console.error('Failed to parse JSON:', cleanText);
        // Fallback if JSON parsing fails
        jsonResult = {
            subject: 'Update from Expenso',
            message: cleanText
        };
    }

    res.status(200).json(jsonResult);

  } catch (error: any) {
    console.error('AI Generation Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate content' });
  }
}
