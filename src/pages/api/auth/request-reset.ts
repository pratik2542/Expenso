import type { NextApiRequest, NextApiResponse } from 'next'
import { adminDb } from '@/lib/firebaseAdmin'
import { sendEmail } from '@/lib/email'
import { getAppBaseUrl } from '@/lib/emailTemplates'
import crypto from 'crypto'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email } = req.body

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' })
    }

    // Check if user exists in Firebase Auth
    const auth = (await import('firebase-admin/auth')).getAuth()
    let userRecord
    try {
      userRecord = await auth.getUserByEmail(email)
    } catch (error: any) {
      // Don't reveal if user exists or not for security
      console.log('User not found:', email)
      return res.status(200).json({ 
        success: true, 
        message: 'If an account exists with this email, you will receive a password reset link.' 
      })
    }

    // Generate a secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiry = Date.now() + 3600000 // 1 hour from now

    // Store the token in Firestore
    const tokenRef = adminDb.collection('password_reset_tokens').doc(userRecord.uid)
    await tokenRef.set({
      email: email,
      token: resetToken,
      expiresAt: resetTokenExpiry,
      createdAt: Date.now(),
      used: false
    })

    // Generate reset link
    const appBaseUrl = getAppBaseUrl()
    const resetLink = `${appBaseUrl}/reset-password?token=${resetToken}`
    const dashboardUrl = appBaseUrl
    const appIconUrl = 'cid:expenso-logo'
    const appIconFallbackUrl = `${appBaseUrl}/icon-192.png`

    // Send reset email with same header style as report emails
    const emailHtml = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Password Reset</title>
  </head>
  <body style="margin:0;padding:0;background:#F5F6F8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F6F8;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
            <!-- Header -->
            <tr>
              <td colspan="2" style="background:#0B0F19;border-radius:14px 14px 0 0;padding:18px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:0;padding-right:12px;width:60%;">
                      <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="color:#FFFFFF;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:0.6px;">
                        <img src="${appIconUrl}" width="22" height="22" alt="Expenso" style="display:inline-block;vertical-align:middle;border-radius:6px;margin-right:10px;" onerror="this.onerror=null;this.src='${appIconFallbackUrl}';" />
                        <span style="display:inline-block;vertical-align:middle;">EXPENSO</span>
                      </a>
                    </td>
                    <td align="right" style="padding:0;width:40%;">
                      <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#FEF2F2;color:#991B1B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;white-space:nowrap;">
                        Alert
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body card -->
            <tr>
              <td colspan="2" style="background:#FFFFFF;border-radius:0 0 14px 14px;box-shadow:0 8px 24px rgba(15,23,42,0.06);padding:24px 20px;">
                <h1 style="margin:0 0 18px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:28px;color:#0B1220;">
                  Password Reset Request
                </h1>

                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#111827;">
                  <p style="margin:0 0 14px 0;">
                    We received a request to reset the password for your account. Click the button below to create a new password:
                  </p>
                </div>

                <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:#2563EB;border-radius:10px;">
                      <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 16px;color:#FFFFFF;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;">
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>

                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#6B7280;">
                  <p style="margin:0 0 10px 0;">Or copy and paste this link into your browser:</p>
                  <p style="margin:0 0 14px 0;color:#2563EB;word-break:break-all;">
                    ${resetLink}
                  </p>
                </div>

                <div style="margin-top:24px;padding-top:20px;border-top:1px solid #E5E7EB;">
                  <p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#111827;font-weight:600;">
                    Security Notice:
                  </p>
                  <ul style="margin:0;padding-left:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#6B7280;">
                    <li>This link will expire in 1 hour</li>
                    <li>If you didn't request this reset, you can safely ignore this email</li>
                    <li>Your password won't change until you create a new one</li>
                  </ul>
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td colspan="2" style="padding:20px;text-align:center;">
                <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:18px;color:#9CA3AF;">
                  This email was sent by Expenso Expense Tracker
                </p>
                <p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:16px;color:#D1D5DB;">
                  © ${new Date().getFullYear()} Expenso. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `

    const textContent = `
Password Reset Request

We received a request to reset the password for your Expenso account.

To reset your password, visit this link:
${resetLink}

This link will expire in 1 hour.

If you didn't request this reset, you can safely ignore this email. Your password won't change until you create a new one.

---
Expenso Expense Tracker
© ${new Date().getFullYear()} Expenso. All rights reserved.
    `

    await sendEmail({
      to: email,
      subject: 'Reset Your Expenso Password',
      text: textContent,
      html: emailHtml
    })

    return res.status(200).json({ 
      success: true, 
      message: 'If an account exists with this email, you will receive a password reset link.' 
    })

  } catch (error: any) {
    console.error('Password reset request error:', error)
    return res.status(500).json({ error: 'Failed to process password reset request' })
  }
}
