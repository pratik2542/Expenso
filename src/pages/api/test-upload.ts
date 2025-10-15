import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Simple test endpoint to verify API routes are working on deployment
 * Call this endpoint to check if API routes are properly deployed
 * GET /api/test-upload
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Log the request for debugging
  console.log('Test upload endpoint called:', {
    method: req.method,
    headers: Object.keys(req.headers),
    query: req.query,
  })

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'API routes are working!',
      environment: {
        hasPerplexityKey: !!process.env.PERPLEXITY_API_KEY,
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        nodeVersion: process.version,
      },
    })
  }

  if (req.method === 'POST') {
    return res.status(200).json({
      success: true,
      message: 'POST method is working!',
      receivedData: {
        contentType: req.headers['content-type'],
        hasBody: !!req.body,
      },
    })
  }

  // For other methods, return 405
  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({
    success: false,
    error: `Method ${req.method} Not Allowed`,
  })
}
