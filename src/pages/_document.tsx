import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Content Security Policy for native app */}
        <meta httpEquiv="Content-Security-Policy" content="default-src * 'self' 'unsafe-inline' 'unsafe-eval' data: gap: content:; connect-src * 'self' https://*.googleapis.com https://generativelanguage.googleapis.com https://api.perplexity.ai https://*.vercel.app https://expenso-ex.vercel.app; script-src * 'self' 'unsafe-inline' 'unsafe-eval'; style-src * 'self' 'unsafe-inline'; frame-src https://expenso-pdfexcel.vercel.app;" />
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
