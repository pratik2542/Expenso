import { adminDb } from './firebaseAdmin';
import nodemailer from 'nodemailer';
import { buildNotificationEmail, getAppBaseUrl } from './emailTemplates';
import path from 'path';

export type NotificationType = 'weekly_reports' | 'marketing' | 'analytics' | 'general';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends an email using Gmail (via Nodemailer).
 * Requires EMAIL_USER and EMAIL_PASS in .env.local
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  // Fallback to mock if credentials are missing
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('---------------------------------------------------');
    console.log('[EMAIL SERVICE] Missing credentials. Mocking send:');
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log('---------------------------------------------------');
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  }

  try {

    // Gmail configuration
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    let inlineLogo:
      | {
          filename: string;
          path: string;
          cid: string;
          contentType: string;
          contentDisposition: 'inline';
        }
      | undefined;

    try {
      const logoPath = path.join(process.cwd(), 'public', 'calculatorImg.png');
      inlineLogo = {
        filename: 'calculatorImg.png',
        path: logoPath,
        cid: 'expenso-logo',
        contentType: 'image/png',
        contentDisposition: 'inline',
      };
    } catch {
      // If file isn't available in the runtime, we still send the email.
      inlineLogo = undefined;
    }

    await transporter.sendMail({
      from: `"Expenso App" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: inlineLogo ? [inlineLogo] : undefined,
    });

    return true;
  } catch (error) {
    console.error('[Email] Failed to send email:', error);
    return false;
  }
}

/**
 * Checks user preferences and sends a notification if allowed.
 */
export async function sendNotification(userId: string, type: NotificationType, content: { subject: string, text: string, html?: string }) {
  try {
    // 1. Fetch user settings
    const settingsDoc = await adminDb.collection('user_settings').doc(userId).get();
    
    if (!settingsDoc.exists) {
      console.log(`[Notification] User ${userId} has no settings. Skipping.`);
      return { sent: false, reason: 'no_settings' };
    }

    const settings = settingsDoc.data();
    
    // 2. Check if email notifications are globally enabled
    if (settings?.email_notifications === false) {
      console.log(`[Notification] User ${userId} has disabled all email notifications.`);
      return { sent: false, reason: 'email_notifications_disabled' };
    }

    // 3. Check specific notification type
    let allowed = false;
    switch (type) {
      case 'weekly_reports':
        allowed = !!settings?.weekly_reports;
        break;
      case 'marketing':
        allowed = !!settings?.marketing;
        break;
      case 'analytics':
        allowed = !!settings?.analytics;
        break;
      case 'general':
        allowed = true; // 'email_notifications' master switch already checked
        break;
    }

    if (!allowed) {
      console.log(`[Notification] User ${userId} has disabled ${type} notifications.`);
      return { sent: false, reason: `${type}_disabled` };
    }

    // 4. Get user email (stored in settings or auth)
    // Note: In settings.tsx, email is not persisted to user_settings by default, 
    // but AuthContext tries to save it. We should check.
    let email = settings?.email;
    
    if (!email) {
        // If not in settings, we might need to fetch from Auth, but adminAuth is easier
        const { adminAuth } = require('./firebaseAdmin');
        try {
            const userRecord = await adminAuth.getUser(userId);
            email = userRecord.email;
        } catch (authError) {
            console.error(`[Notification] Could not fetch user email from Auth:`, authError);
        }
    }

    if (!email) {
      console.log(`[Notification] User ${userId} has no email address.`);
      return { sent: false, reason: 'no_email' };
    }

    const baseUrl = getAppBaseUrl();

    const defaultCta = (() => {
      switch (type) {
        case 'weekly_reports':
          return { text: 'View analytics', url: '/analytics' };
        case 'analytics':
          return { text: 'Review budget', url: '/budget' };
        case 'marketing':
          return { text: 'Open Expenso', url: '/' };
        case 'general':
        default:
          return { text: 'Open settings', url: '/settings' };
      }
    })();

    const built = content.html
      ? { html: content.html, text: content.text }
      : buildNotificationEmail({
          kind: type,
          subject: content.subject,
          message: content.text,
          cta: defaultCta,
          baseUrl,
        });

    // 5. Send email
    await sendEmail({
      to: email,
      subject: content.subject,
      text: built.text,
      html: built.html,
    });

    return { sent: true };

  } catch (error) {
    console.error('[Notification] Error sending notification:', error);
    throw error;
  }
}
