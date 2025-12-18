import { NextApiRequest, NextApiResponse } from 'next';
import { sendNotification, NotificationType } from '@/lib/email';
import { adminAuth } from '@/lib/firebaseAdmin';

/**
 * User-triggered endpoint to send themselves a notification on demand.
 * Useful for "Send me my report now" buttons in the UI.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const { type } = req.body as { type: NotificationType };

    if (!type || !['weekly_reports', 'analytics', 'marketing'].includes(type)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    // Generate content based on type
    let subject = '';
    let text = '';

    const now = new Date();
    const currentMonth = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const weekRange = `${weekStart.toLocaleDateString()} – ${now.toLocaleDateString()}`;

    switch (type) {
      case 'weekly_reports':
        subject = `Your Weekly Expense Summary (${weekRange})`;
        text =
          `Here's your weekly snapshot for ${weekRange}.\n\n` +
          `• Total spent: (calculated from your data)\n` +
          `• Top category: (coming soon)\n` +
          `• Biggest change vs last week: (coming soon)\n\n` +
          `Open Expenso to see the full breakdown.`;
        break;

      case 'analytics':
        subject = `Your Monthly Analytics Report (${currentMonth})`;
        text =
          `Here's your monthly financial snapshot for ${currentMonth}.\n\n` +
          `• Total expenses: (calculated from your data)\n` +
          `• Budget performance: (coming soon)\n` +
          `• Top spending category: (coming soon)\n` +
          `• Spending trend vs last month: (coming soon)\n\n` +
          `Open Expenso to explore detailed insights.`;
        break;

      case 'marketing':
        subject = 'Latest Expenso Updates';
        text =
          `Check out what is new in Expenso.\n\n` +
          `• Feature updates\n` +
          `• Tips for better expense tracking\n\n` +
          `Open the app to explore.`;
        break;
    }

    const result = await sendNotification(userId, type, { subject, text });

    if (result.sent) {
      return res.status(200).json({ success: true, message: `${type} notification sent` });
    } else {
      return res.status(200).json({ 
        success: false, 
        message: `Notification not sent: ${result.reason}`,
        reason: result.reason 
      });
    }

  } catch (error) {
    console.error('Send on-demand notification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
