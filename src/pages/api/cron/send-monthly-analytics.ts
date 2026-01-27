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
    const currentMonthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Define "Current Month" as Month-to-Date
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now); // Up to now

    // Define "Previous Month" for comparison (Full month? Or same days?)
    // Let's do Full Previous Month for context
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      // Use user_id field if available, fallback to doc.id
      const userId = data.user_id || doc.id;
      const userCurrency = data.currency || 'CAD';

      let totalSpent = 0;
      let prevTotalSpent = 0;
      let topCategory = 'None';
      let trend = 'N/A';
      
      try {
        // Collect all expense collection references (Legacy + Environments)
        const expenseCollections: any[] = [];
        
        // 1. Legacy/Default path
        expenseCollections.push(
            adminDb.collection('expenses').doc(userId).collection('items')
        );

        // 2. Named Environments
        const envsSnapshot = await adminDb.collection('users').doc(userId).collection('environments').get();
        envsSnapshot.docs.forEach(envDoc => {
            expenseCollections.push(
                adminDb.collection('users').doc(userId).collection('environments').doc(envDoc.id).collection('expenses')
            );
        });

        // Helper to fetch and sum expenses for a date range across all collections
        const fetchExpenses = async (startDate: Date, endDate: Date) => {
            const promises = expenseCollections.map(ref => 
                ref.where('occurred_on', '>=', startDate.toISOString())
                   .where('occurred_on', '<=', endDate.toISOString())
                   .get()
            );
            
            const snapshots = await Promise.all(promises);
            const allDocs: any[] = [];
            snapshots.forEach((chap: any) => {
                if (!chap.empty) {
                    chap.docs.forEach((d: any) => allDocs.push(d.data()));
                }
            });
            return allDocs;
        };

        // 1. Fetch expenses for current month
        const currentExpenses = await fetchExpenses(start, end);

        const categoryTotals: Record<string, number> = {};

        currentExpenses.forEach(exp => {
          const amt = Number(exp.amount) || 0;
          if (exp.currency === userCurrency) {
             if (exp.type === 'expense' || !exp.type) {
                totalSpent += amt;
                categoryTotals[exp.category || 'Other'] = (categoryTotals[exp.category || 'Other'] || 0) + amt;
             }
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

        // 2. Fetch expenses for previous month
        const prevExpenses = await fetchExpenses(prevStart, prevEnd);

        prevExpenses.forEach(exp => {
            if (exp.currency === userCurrency) {
                if (exp.type === 'expense' || !exp.type) {
                    prevTotalSpent += (Number(exp.amount) || 0);
                }
            }
        });

        // Calculate change
        if (prevTotalSpent > 0) {
            const change = ((totalSpent - prevTotalSpent) / prevTotalSpent) * 100;
            trend = `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs last month`;
        } else {
            trend = 'N/A';
        }
        
      } catch (err) {
        console.error(`Error calculating stats for user ${userId}:`, err);
      }

      const formattedTotal = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: userCurrency
      }).format(totalSpent);

      const analyticsContent = {
        subject: `Your Monthly Analytics Report (${currentMonthLabel})`,
        text:
          `Here's your monthly financial snapshot for ${currentMonthLabel}.\n\n` +
          `• Total expenses: ${formattedTotal}\n` +
          `• Top spending category: ${topCategory}\n` +
          `• Spending trend: ${trend}\n\n` +
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
