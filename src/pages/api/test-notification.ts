import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }

  return res.status(410).json({
    error: 'Gone',
    message: 'Test notifications are disabled. Use production cron + real triggers instead.',
  });
}
