import { NextApiRequest, NextApiResponse } from 'next'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  
  // This endpoint is deprecated - PDF processing now happens on https://expenso-pdfexcel.vercel.app
  return res.status(503).json({ 
    error: 'PDF processing has been moved to https://expenso-pdfexcel.vercel.app',
    message: 'Please use the popup interface to upload and process PDFs'
  })
}

export default handler
