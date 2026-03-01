import { NextApiRequest, NextApiResponse } from 'next';
import { sendNotification } from '@/lib/email';
import { adminDb } from '@/lib/firebaseAdmin';
import { spendingDelta } from '@/lib/transactions';

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

    const toYmd = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const startYmd = toYmd(start);
    const endYmd = toYmd(end);

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const userId = data.user_id; // Use the stored user_id
      const userCurrency = data.currency || 'CAD'; // Default to CAD if not set

      // Calculate stats
      let totalSpent = 0;
      let prevTotalSpent = 0;
      let topCategory = 'None';
      let biggestChange = 'N/A';
      const categoryTotals: Record<string, number> = {};
      
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

        // 1. Fetch expenses for current week
        const currentExpenses = await fetchExpenses(startYmd, endYmd);

        currentExpenses.forEach(exp => {
          const expCurrency = exp.currency || userCurrency;
          if (expCurrency !== userCurrency) return;

          const delta = spendingDelta(exp);
          if (delta === 0) return;

          totalSpent += delta;
          categoryTotals[exp.category || 'Other'] = (categoryTotals[exp.category || 'Other'] || 0) + delta;
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

        const prevExpenses = await fetchExpenses(toYmd(prevStart), toYmd(prevEnd));

        prevExpenses.forEach(exp => {
          const expCurrency = exp.currency || userCurrency;
          if (expCurrency !== userCurrency) return;

          const delta = spendingDelta(exp);
          if (delta !== 0) prevTotalSpent += delta;
        });

        // Calculate change
        const safeTotalSpent = Math.max(0, totalSpent);
        const safePrevTotalSpent = Math.max(0, prevTotalSpent);

        if (safePrevTotalSpent > 0) {
          const change = ((safeTotalSpent - safePrevTotalSpent) / safePrevTotalSpent) * 100;
            biggestChange = `${change > 0 ? '+' : ''}${change.toFixed(0)}%`;
        } else if (safeTotalSpent > 0) {
            biggestChange = '+100%'; 
        } else {
            biggestChange = '0%';
        }
        
      } catch (err) {
        console.error(`Error calculating stats for user ${userId}:`, err);
      }

      // Format currency
      const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: userCurrency }).format(Math.max(0, totalSpent));

      // Build category breakdown
      const sortedCategories = Object.entries(categoryTotals)
        .filter(([, v]) => (v as number) > 0)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5); // Top 5 categories

      let breakdownText = '';
      if (sortedCategories.length > 0) {
        breakdownText = '\n\nTop Categories:\n' + sortedCategories
          .map(([cat, val]) => {
            const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: userCurrency }).format(val as number);
            const safeTotal = Math.max(0, totalSpent);
            const percentage = safeTotal > 0 ? (((val as number) / safeTotal) * 100).toFixed(0) : 0;
            return `  • ${cat}: ${formatted} (${percentage}%)`;
          })
          .join('\n');
      }

      const reportContent = {
        subject: `Your Weekly Expense Summary (${rangeLabel})`,
        text:
          `Here's your weekly snapshot for ${rangeLabel}.\n\n` +
          `• Total spent: ${formattedTotal}\n` +
          `• Top category: ${topCategory}\n` +
          `• Change vs last week: ${biggestChange}\n` +
          breakdownText +
          `\n\nOpen Expenso to see the full breakdown.`
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
