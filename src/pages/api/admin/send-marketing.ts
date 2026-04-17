import { NextApiRequest, NextApiResponse } from 'next';
import { sendNotification } from '@/lib/email';
import { adminDb } from '@/lib/firebaseAdmin';
import { getAppBaseUrl } from '@/lib/emailTemplates';
import { buildMarketingEmail } from '@/lib/marketingEmail';

/**
 * Admin-only endpoint to send marketing emails when a new feature is released.
 * Requires ADMIN_SECRET in production.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Secure with admin secret
  const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subject, message, imageUrls, ctaText, ctaUrl } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'Missing subject or message' });
    }

    const builtEmail = buildMarketingEmail({
      subject,
      message,
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      ctaText: typeof ctaText === 'string' ? ctaText : 'Open Expenso',
      ctaUrl: typeof ctaUrl === 'string' ? ctaUrl : '/',
      baseUrl: getAppBaseUrl(),
    });

    // Get all users to allow soft opt-in (send unless explicitly disabled)
    const usersSnapshot = await adminDb.collection('user_settings').get();

    const results = [];

    for (const doc of usersSnapshot.docs) {
      const userId = doc.id;
      const userData = doc.data();

      // Skip if explicitly disabled
      if (userData.marketing === false || userData.email_notifications === false) {
        continue;
      }
      
      try {
        const result = await sendNotification(userId, 'marketing', {
          subject,
          text: builtEmail.text,
          html: builtEmail.html,
        });
        results.push({ userId, result });
      } catch (err) {
        console.error(`[Marketing] Failed to send to ${userId}`, err);
        results.push({ userId, error: 'Failed' });
      }
    }

    res.status(200).json({ 
      success: true, 
      processed: results.length, 
      details: results 
    });

  } catch (error) {
    console.error('[Marketing] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
