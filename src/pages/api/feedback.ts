import type { NextApiRequest, NextApiResponse } from 'next'
import { sendEmail } from '@/lib/email'

const TARGET_EMAIL = 'pratikmak2542@gmail.com'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { message, email, type, userDetails } = req.body

    if (!message) {
      return res.status(400).json({ error: 'Message is required' })
    }

    const subject = `[Expenso Feedback] ${type || 'General'} - ${email || 'Anonymous'}`
    
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Feedback Received</h2>
        <p><strong>From:</strong> ${email || 'Anonymous'}</p>
        <p><strong>Type:</strong> ${type || 'General'}</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <strong>Message:</strong><br/>
          ${message.replace(/\n/g, '<br/>')}
        </div>

        ${userDetails ? `
          <div style="font-size: 12px; color: #666; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">
            <strong>User Details:</strong>
            <pre style="font-family: monospace; white-space: pre-wrap;">${JSON.stringify(userDetails, null, 2)}</pre>
          </div>
        ` : ''}
      </div>
    `

    const success = await sendEmail({
      to: TARGET_EMAIL,
      subject,
      text: `Message from ${email || 'Anonymous'}: ${message}`,
      html
    })

    if (success) {
      return res.status(200).json({ success: true })
    } else {
      return res.status(500).json({ error: 'Failed to send email' })
    }

  } catch (error) {
    console.error('Feedback error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
