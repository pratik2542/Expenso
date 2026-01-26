import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Google Site Verification for SEO */}
        <meta name="google-site-verification" content="uptZKhPgUDbDFs1JbHg6FzWw3r2Y8THcK8H-sfsRBYk" />
        
        {/* Global SEO */}
        <meta name="application-name" content="Expenso" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Expenso" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#3b82f6" />
        
        {/* Content Security Policy for native app */}
        <meta httpEquiv="Content-Security-Policy" content="default-src * 'self' 'unsafe-inline' 'unsafe-eval' data: gap: content:; connect-src * 'self' https://*.googleapis.com https://generativelanguage.googleapis.com https://api.perplexity.ai https://*.vercel.app https://expense-ai-manager.vercel.app/; script-src * 'self' 'unsafe-inline' 'unsafe-eval'; style-src * 'self' 'unsafe-inline'; frame-src https://expenso-pdfexcel.vercel.app;" />
        {/* Use login page logo as favicon */}
        <link rel="icon" type="image/png" href="/calculatorImg.png" />
        <link rel="shortcut icon" href="/calculatorImg.png" />
        <link rel="apple-touch-icon" href="/calculatorImg.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
