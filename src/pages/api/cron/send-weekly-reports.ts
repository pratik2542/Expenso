import { NextApiRequest, NextApiResponse } from 'next';
import { sendNotification } from '@/lib/email';
import { adminDb } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Secure this endpoint with a secret key (e.g., CRON_SECRET)
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all users who have weekly_reports enabled
    // Note: In a real app with many users, you'd paginate this or use a job queue.
    const usersSnapshot = await adminDb.collection('user_settings')
      .where('weekly_reports', '==', true)
      .where('email_notifications', '==', true)
      .get();

    const results = [];

    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    const rangeLabel = `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;

    for (const doc of usersSnapshot.docs) {
      const userId = doc.id; // Assuming doc ID is user ID, or use doc.data().user_id
      
      // In a real app, generate the actual report content here (totals, top categories, trends).
      // We intentionally omit `html` so the shared email template builds a production-quality design.
      const reportContent = {
        subject: `Your Weekly Expense Summary (${rangeLabel})`,
        text:
          `Here’s your weekly snapshot for ${rangeLabel}.\n\n` +
          `• Total spent: (coming soon)\n` +
          `• Top category: (coming soon)\n` +
          `• Biggest change vs last week: (coming soon)\n\n` +
          `Open Expenso to see the full breakdown.`
      };

      try {
        const result = await sendNotification(userId, 'weekly_reports', reportContent);
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
