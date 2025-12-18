import { NextApiRequest, NextApiResponse } from 'next';
import { sendNotification } from '@/lib/email';
import { adminDb } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Secure this endpoint with a secret key
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all users who have analytics notifications enabled
    const usersSnapshot = await adminDb.collection('user_settings')
      .where('analytics', '==', true)
      .where('email_notifications', '==', true)
      .get();

    const results = [];

    const now = new Date();
    const currentMonth = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    for (const doc of usersSnapshot.docs) {
      const userId = doc.id;
      
      // In production, generate actual analytics data here (spending trends, budget status, etc.)
      const analyticsContent = {
        subject: `Your Monthly Analytics Report (${currentMonth})`,
        text:
          `Here's your monthly financial snapshot for ${currentMonth}.\n\n` +
          `• Total expenses: (calculated from your data)\n` +
          `• Budget performance: (coming soon)\n` +
          `• Top spending category: (coming soon)\n` +
          `• Spending trend vs last month: (coming soon)\n\n` +
          `Open Expenso to explore detailed insights.`
      };

      try {
        const result = await sendNotification(userId, 'analytics', analyticsContent);
        results.push({ userId, result });
      } catch (err) {
        console.error(`[Cron] Failed to send to ${userId}`, err);
        results.push({ userId, error: 'Failed' });
      }
    }

    res.status(200).json({ success: true, processed: results.length, details: results });

  } catch (error) {
    console.error('[Cron] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
