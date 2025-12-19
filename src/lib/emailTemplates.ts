export type EmailCta = { text: string; url: string };

export type EmailNotificationKind = 'weekly_reports' | 'marketing' | 'analytics' | 'general';

type BuildEmailInput = {
  kind: EmailNotificationKind;
  subject: string;
  message: string;
  cta?: EmailCta;
  baseUrl?: string;
};

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '');
}

export function getAppBaseUrl(): string {
  const fromEnv =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  const normalized = normalizeBaseUrl(fromEnv);
  return normalized || 'http://localhost:3000';
}

function toAbsoluteUrl(baseUrl: string, urlOrPath: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (!urlOrPath) return normalizedBase;
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  const path = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
  return `${normalizedBase}${path}`;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function textToHtmlParagraphs(text: string): string {
  const cleaned = (text || '').trim();
  if (!cleaned) return '';

  const parts = cleaned.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);
  return parts
    .map(p => `<p style="margin:0 0 14px 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function buildQuickSummary(text: string): string {
  const cleaned = (text || '').trim();
  if (!cleaned) return '';

  // Lightweight "AI-like" summary without external calls: first sentence or first line.
  const firstLine = cleaned.split(/\n/)[0]?.trim() || cleaned;
  const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0]?.trim() || firstLine;
  return firstSentence.length > 180 ? `${firstSentence.slice(0, 177)}...` : firstSentence;
}

function badgeForKind(kind: EmailNotificationKind): { label: string; background: string; color: string } {
  switch (kind) {
    case 'weekly_reports':
      return { label: 'Weekly Report', background: '#EEF2FF', color: '#3730A3' };
    case 'analytics':
      return { label: 'Alert', background: '#FEF2F2', color: '#991B1B' };
    case 'marketing':
      return { label: 'Update', background: '#ECFDF5', color: '#065F46' };
    case 'general':
    default:
      return { label: 'Notification', background: '#F3F4F6', color: '#374151' };
  }
}

export function buildNotificationEmail(input: BuildEmailInput): { html: string; text: string } {
  const baseUrl = input.baseUrl ? normalizeBaseUrl(input.baseUrl) : getAppBaseUrl();
  const cta = input.cta
    ? { text: input.cta.text, url: toAbsoluteUrl(baseUrl, input.cta.url) }
    : undefined;

  const year = new Date().getFullYear();
  const badge = badgeForKind(input.kind);
  const preheader = buildQuickSummary(input.message);

  const dashboardUrl = toAbsoluteUrl(baseUrl, '/');
  // Prefer CID-based inline image (set in nodemailer attachments). Fallback to hosted icon.
  const appIconUrl = 'cid:expenso-logo';
  const appIconFallbackUrl = toAbsoluteUrl(baseUrl, '/icon-192.png');
  const expensesUrl = toAbsoluteUrl(baseUrl, '/expenses');
  const budgetUrl = toAbsoluteUrl(baseUrl, '/budget');
  const analyticsUrl = toAbsoluteUrl(baseUrl, '/analytics');
  const settingsUrl = toAbsoluteUrl(baseUrl, '/settings');

  // Debug logging (will appear in server logs)
  console.log('[Email Template] Generated URLs:', {
    baseUrl,
    dashboardUrl,
    expensesUrl,
    budgetUrl,
    analyticsUrl,
    settingsUrl
  });

  const html = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F5F6F8;">
    <!-- Preheader (hidden preview text) -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(preheader)}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F6F8;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
            <!-- Header -->
            <tr>
              <td style="padding:0 0 12px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0B0F19;border-radius:14px 14px 0 0;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="color:#FFFFFF;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:0.6px;">
                        <img src="${appIconUrl}" width="22" height="22" alt="Expenso" style="display:inline-block;vertical-align:middle;border-radius:6px;margin-right:10px;" onerror="this.onerror=null;this.src='${appIconFallbackUrl}';" />
                        <span style="display:inline-block;vertical-align:middle;">EXPENSO</span>
                      </a>
                    </td>
                    <td align="right" style="padding:18px 20px;">
                      <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${badge.background};color:${badge.color};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;">
                        ${escapeHtml(badge.label)}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body card -->
            <tr>
              <td style="background:#FFFFFF;border-radius:0 0 14px 14px;box-shadow:0 8px 24px rgba(15,23,42,0.06);padding:24px 20px;">
                <h1 style="margin:0 0 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:28px;color:#0B1220;">
                  ${escapeHtml(input.subject)}
                </h1>
                <p style="margin:0 0 18px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#6B7280;">
                  ${escapeHtml(preheader)}
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 16px 6px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">
                      Quick summary
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 16px 14px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#111827;">
                      ${escapeHtml(preheader)}
                    </td>
                  </tr>
                </table>

                <div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>

                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#111827;">
                  ${textToHtmlParagraphs(input.message)}
                </div>

                ${cta ? `
                <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:#2563EB;border-radius:10px;">
                      <a href="${cta.url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 16px;color:#FFFFFF;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;">
                        ${escapeHtml(cta.text)}
                      </a>
                    </td>
                  </tr>
                </table>
                ` : ''}

                <div style="height:22px;line-height:22px;font-size:0;">&nbsp;</div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #E5E7EB;">
                  <tr>
                    <td style="padding-top:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#6B7280;">
                      Quick links:
                      <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563EB;text-decoration:underline;margin-left:6px;">Dashboard</a>
                      <a href="${expensesUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563EB;text-decoration:underline;margin-left:10px;">Expenses</a>
                      <a href="${budgetUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563EB;text-decoration:underline;margin-left:10px;">Budget</a>
                      <a href="${analyticsUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563EB;text-decoration:underline;margin-left:10px;">Analytics</a>
                      <a href="${settingsUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563EB;text-decoration:underline;margin-left:10px;">Settings</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td align="center" style="padding:14px 8px 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#9CA3AF;">
                <div style="max-width:600px;">
                  <div style="margin-bottom:6px;">You received this email because notifications are enabled in your Expenso account.</div>
                  <div>
                    <a href="${settingsUrl}" target="_blank" rel="noopener noreferrer" style="color:#6B7280;text-decoration:underline;">Manage preferences</a>
                    <span style="color:#D1D5DB;"> • </span>
                    <a href="${settingsUrl}" target="_blank" rel="noopener noreferrer" style="color:#6B7280;text-decoration:underline;">Unsubscribe</a>
                  </div>
                  <div style="margin-top:10px;">© ${year} Expenso</div>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  const text = `${input.subject}\n\n${input.message}\n\nOpen Expenso: ${dashboardUrl}`;
  return { html, text };
}

// Backwards-compatible helper (used by older code paths)
export const getEmailTemplate = (title: string, content: string, cta?: EmailCta, baseUrl?: string) => {
  const built = buildNotificationEmail({
    kind: 'general',
    subject: title,
    message: content,
    cta,
    baseUrl,
  });
  return built.html;
};
