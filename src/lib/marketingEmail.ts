export type MarketingEmailInput = {
  subject: string;
  message: string;
  imageUrls?: string[];
  ctaText?: string;
  ctaUrl?: string;
  baseUrl?: string;
  forceTheme?: 'light' | 'dark';
  useInlineLogo?: boolean;
};

function normalizeBaseUrl(url?: string): string {
  const fallback = 'https://expense-ai-manager.vercel.app';
  if (!url) return fallback;
  return url.trim().replace(/\/$/, '') || fallback;
}

function toAbsoluteUrl(baseUrl: string, urlOrPath?: string): string {
  if (!urlOrPath) return `${baseUrl}/`;
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  const path = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
  return `${baseUrl}${path}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeImageUrls(urls?: string[]): string[] {
  if (!Array.isArray(urls)) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of urls) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;
    const isHttp = /^https?:\/\//i.test(trimmed);
    const isDataImage = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(trimmed);
    if (!isHttp && !isDataImage) continue;
    if (isDataImage && trimmed.length > 2_000_000) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out.slice(0, 6);
}

function textToHtmlBlocks(text: string): string {
  const cleaned = (text || '').trim();
  if (!cleaned) return '';

  const lines = cleaned.split('\n').map((l) => l.trim());
  const hasBullets = lines.some((line) => /^[-*•]\s+/.test(line));

  if (hasBullets) {
    const items = lines
      .filter((line) => /^[-*•]\s+/.test(line))
      .map((line) => line.replace(/^[-*•]\s+/, '').trim())
      .filter(Boolean)
      .map((line) => `<li style="margin:0 0 8px 0;">${escapeHtml(line)}</li>`)
      .join('');

    const nonBullets = lines
      .filter((line) => line && !/^[-*•]\s+/.test(line))
      .map((line) => `<p style="margin:0 0 14px 0;">${escapeHtml(line)}</p>`)
      .join('');

    return `${nonBullets}${items ? `<ul style="margin:0 0 16px 18px;padding:0;color:var(--text);">${items}</ul>` : ''}`;
  }

  return cleaned
    .split(/\n{2,}/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p style="margin:0 0 14px 0;">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function buildMarketingEmail(input: MarketingEmailInput): { html: string; text: string } {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const subject = (input.subject || 'Expenso Update').trim();
  const message = (input.message || '').trim();
  const imageUrls = sanitizeImageUrls(input.imageUrls);
  const ctaText = (input.ctaText || 'Open Expenso').trim();
  const ctaUrl = toAbsoluteUrl(baseUrl, input.ctaUrl || '/');
  const appLogoUrl = toAbsoluteUrl(baseUrl, '/calculatorImg.png');
  const logoSrc = input.useInlineLogo === false ? appLogoUrl : 'cid:expenso-logo';
  const settingsUrl = toAbsoluteUrl(baseUrl, '/settings');
  const forceTheme = input.forceTheme || 'light';

  const imageBlocks = imageUrls
    .map((url) => {
      const safeUrl = escapeHtml(url);
      return `
        <tr>
          <td style="padding:0 0 14px 0;">
            <img src="${safeUrl}" alt="Campaign image" style="display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--border);" />
          </td>
        </tr>`;
    })
    .join('');

  const html = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <style>
      :root {
        --bg: #f3f5f8;
        --card: #ffffff;
        --text: #111827;
        --muted: #6b7280;
        --border: #e5e7eb;
        --btn: #2563eb;
        --btnText: #ffffff;
        --header: #0b1220;
      }
      [data-force-theme="dark"] {
        --bg: #050b14;
        --card: #020712;
        --text: #e5edff;
        --muted: #9aa8c1;
        --border: #334155;
        --btn: #3b82f6;
        --btnText: #ffffff;
        --header: #020712;
      }
      @media (prefers-color-scheme: dark) {
        [data-force-theme="auto"] {
          --bg: #050b14;
          --card: #020712;
          --text: #e5edff;
          --muted: #9aa8c1;
          --border: #334155;
          --btn: #3b82f6;
          --btnText: #ffffff;
          --header: #020712;
        }
      }
    </style>
    <title>${escapeHtml(subject)}</title>
  </head>
  <body data-force-theme="${escapeHtml(forceTheme === 'light' || forceTheme === 'dark' ? forceTheme : 'auto')}" style="margin:0;padding:0;background:var(--bg);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:var(--bg);">
      <tr>
        <td align="center" style="padding:20px 10px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--card);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;">
                  <tr>
                    <td style="background:var(--header);padding:16px 18px;">
                      <a href="${baseUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:#dbeafe;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;">
                        <span style="display:inline-block;vertical-align:middle;width:32px;height:32px;background:#ffffff;border-radius:8px;padding:4px;box-sizing:border-box;margin-right:8px;">
                          <img src="${logoSrc}" width="24" height="24" alt="Expenso" style="display:block;width:24px;height:24px;border-radius:4px;" onerror="this.onerror=null;this.src='${appLogoUrl}'" />
                        </span>
                        <span style="display:inline-block;vertical-align:middle;">Expenso</span>
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="background:var(--card);padding:22px 18px;">
                <h1 style="margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;line-height:30px;color:var(--text);">${escapeHtml(subject)}</h1>
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:var(--text);">
                  ${textToHtmlBlocks(message)}
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">
                  ${imageBlocks}
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
                  <tr>
                    <td style="background:var(--btn);border-radius:10px;">
                      <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 16px;color:var(--btnText);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;">
                        ${escapeHtml(ctaText)}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:var(--muted);">
                  You received this email because marketing notifications are enabled in your Expenso account.
                  <a href="${settingsUrl}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">Manage preferences</a>
                </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = `${subject}\n\n${message}\n\n${imageUrls.length ? `Images:\n${imageUrls.join('\n')}\n\n` : ''}${ctaText}: ${ctaUrl}`;

  return { html, text };
}
