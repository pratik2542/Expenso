import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
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
