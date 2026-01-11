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
      const data = doc.data();
      const userId = data.user_id; // Use the stored user_id
      const userCurrency = data.currency || 'CAD'; // Default to CAD if not set

      // Calculate stats
      let totalSpent = 0;
      let prevTotalSpent = 0;
      let topCategory = 'None';
      let biggestChange = 'N/A';
      
      try {
        // 1. Fetch expenses for current week
        const expensesRef = adminDb.collection('expenses').doc(userId).collection('items');
        
        const currentWeekQuery = await expensesRef
          .where('occurred_on', '>=', start.toISOString())
          .where('occurred_on', '<=', end.toISOString())
          .get();

        const categoryTotals: Record<string, number> = {};

        currentWeekQuery.docs.forEach(doc => {
          const exp = doc.data();
          const amt = Number(exp.amount) || 0;
          // Simple sum - in production, we should normalize currency here
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

        // 2. Fetch expenses for previous week for comparison
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 7);
        const prevEnd = new Date(start); // Start of current week is end of prev week

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

        // Calculate change
        if (prevTotalSpent > 0) {
            const change = ((totalSpent - prevTotalSpent) / prevTotalSpent) * 100;
            biggestChange = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
        } else if (totalSpent > 0) {
            biggestChange = '+100%'; 
        } else {
            biggestChange = '0%';
        }
        
      } catch (err) {
        console.error(`Error calculating stats for user ${userId}:`, err);
      }

      // Format currency
      const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: userCurrency }).format(totalSpent);

      const reportContent = {
        subject: `Your Weekly Expense Summary (${rangeLabel})`,
        text:
          `Here’s your weekly snapshot for ${rangeLabel}.\n\n` +
          `• Total spent: ${formattedTotal}\n` +
          `• Top category: ${topCategory}\n` +
          `• Biggest change vs last week: ${biggestChange}\n\n` +
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
