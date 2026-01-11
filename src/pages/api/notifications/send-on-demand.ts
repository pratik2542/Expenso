import { NextApiRequest, NextApiResponse } from 'next';
import { sendNotification, NotificationType } from '@/lib/email';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

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

    let userCurrency = 'CAD';
    try {
        const settingsSnap = await adminDb.collection('user_settings').where('user_id', '==', userId).limit(1).get();
        if(!settingsSnap.empty) {
            userCurrency = settingsSnap.docs[0].data().currency || 'CAD';
        }
    } catch (e) { console.error('Failed to fetch user settings', e); }

    switch (type) {
      case 'weekly_reports':
        // Calculate stats
        let totalSpent = 0;
        let prevTotalSpent = 0;
        let topCategory = 'None';
        let biggestChange = 'N/A';
        
        try {
            // 1. Fetch expenses for current week
            const expensesRef = adminDb.collection('expenses').doc(userId).collection('items');
            
            const currentWeekQuery = await expensesRef
            .where('occurred_on', '>=', weekStart.toISOString())
            .where('occurred_on', '<=', now.toISOString())
            .get();

            const categoryTotals: Record<string, number> = {};

            currentWeekQuery.docs.forEach(doc => {
            const exp = doc.data();
            const amt = Number(exp.amount) || 0;
            if (exp.currency === userCurrency) {
                totalSpent += amt;
                categoryTotals[exp.category || 'Other'] = (categoryTotals[exp.category || 'Other'] || 0) + amt;
            }
            });

            // Find top category
            let maxCatVal = 0;
            for (const [cat, val] of Object.entries(categoryTotals)) {
            if (val > maxCatVal) {
                maxCatVal = val;
                topCategory = cat;
            }
            }

            // 2. Fetch prev week
            const prevStart = new Date(weekStart);
            prevStart.setDate(prevStart.getDate() - 7);
            const prevEnd = new Date(weekStart);

            const prevWeekQuery = await expensesRef
            .where('occurred_on', '>=', prevStart.toISOString())
            .where('occurred_on', '<=', prevEnd.toISOString())
            .get();

            prevWeekQuery.docs.forEach(doc => {
                const exp = doc.data();
                if (exp.currency === userCurrency) {
                    prevTotalSpent += (Number(exp.amount) || 0);
                }
            });

            // Change
            if (prevTotalSpent > 0) {
                const change = ((totalSpent - prevTotalSpent) / prevTotalSpent) * 100;
                biggestChange = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
            } else if (totalSpent > 0) {
                biggestChange = '+100%';
            } else {
                biggestChange = '0%';
            }

        } catch (err) {
            console.error('Error calculating stats', err);
        }
        
        const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: userCurrency }).format(totalSpent);

        subject = `Your Weekly Expense Summary (${weekRange})`;
        text =
          `Here's your weekly snapshot for ${weekRange}.\n\n` +
          `• Total spent: ${formattedTotal}\n` +
          `• Top category: ${topCategory}\n` +
          `• Biggest change vs last week: ${biggestChange}\n\n` +
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
