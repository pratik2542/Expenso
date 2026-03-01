import { NextApiRequest, NextApiResponse } from 'next';
import { sendNotification } from '@/lib/email';
import { adminDb } from '@/lib/firebaseAdmin';
import { spendingDelta } from '@/lib/transactions';

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

    const toYmd = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const isRelevantForSpending = (row: any) => spendingDelta(row) !== 0;
    
    // Report on the PREVIOUS month (the month that just ended)
    // If today is Feb 1, report on January
    const reportMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const reportMonthLabel = reportMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Define "Report Month" - Full previous month
    const start = new Date(reportMonth.getFullYear(), reportMonth.getMonth(), 1);
    const end = new Date(reportMonth.getFullYear(), reportMonth.getMonth() + 1, 0); // Last day of report month
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);

    // Define "Comparison Month" - Month before the report month
    const prevStart = new Date(reportMonth.getFullYear(), reportMonth.getMonth() - 1, 1);
    const prevEnd = new Date(reportMonth.getFullYear(), reportMonth.getMonth(), 0);
    const prevStartYmd = toYmd(prevStart);
    const prevEndYmd = toYmd(prevEnd);

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
        const fetchExpenses = async (startDateYmd: string, endDateYmd: string) => {
            const promises = expenseCollections.map(ref => 
            ref.where('occurred_on', '>=', startDateYmd)
               .where('occurred_on', '<=', endDateYmd)
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
        const currentExpenses = await fetchExpenses(startYmd, endYmd);

        const categoryTotals: Record<string, number> = {};

        currentExpenses.forEach(exp => {
          if (!isRelevantForSpending(exp)) return;

          const expCurrency = exp.currency || userCurrency;
          if (expCurrency !== userCurrency) return;

          const delta = spendingDelta(exp);
          totalSpent += delta;
          const category = exp.category || 'Other';
          categoryTotals[category] = (categoryTotals[category] || 0) + delta;
        });

        // Find top category
        let maxCatVal = 0;
        for (const [cat, val] of Object.entries(categoryTotals)) {
          const numVal = Number(val) || 0;
          if (numVal > maxCatVal) {
            maxCatVal = numVal;
            topCategory = cat;
          }
        }

        // 2. Fetch expenses for previous month
        const prevExpenses = await fetchExpenses(prevStartYmd, prevEndYmd);

        prevExpenses.forEach(exp => {
          if (!isRelevantForSpending(exp)) return;

          const expCurrency = exp.currency || userCurrency;
          if (expCurrency !== userCurrency) return;

          prevTotalSpent += spendingDelta(exp);
        });

        // Calculate change
        const safeTotalSpent = Math.max(0, totalSpent);
        const safePrevTotalSpent = Math.max(0, prevTotalSpent);

        if (safePrevTotalSpent > 0) {
          const change = ((safeTotalSpent - safePrevTotalSpent) / safePrevTotalSpent) * 100;
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
      }).format(Math.max(0, totalSpent));

      const analyticsContent = {
        subject: `Your Monthly Analytics Report (${reportMonthLabel})`,
        text:
          `Here's your monthly financial snapshot for ${reportMonthLabel}.\n\n` +
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
