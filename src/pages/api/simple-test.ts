import type { NextApiRequest, NextApiResponse } from 'next'

// Test if API routes work at all
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('Simple test API called:', req.method)
  
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'GET works!',
      method: req.method,
    })
  }
  
  if (req.method === 'POST') {
    return res.status(200).json({
      success: true,
      message: 'POST works!',
      method: req.method,
      hasBody: !!req.body,
    })
  }
  
  return res.status(405).json({
    success: false,
    error: `Method ${req.method} not allowed`,
  })
}
