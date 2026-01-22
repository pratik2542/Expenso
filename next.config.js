const { securityHeaders } = require('./next.config.security')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  
  // Security headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-User-Id' },
        ],
      },
      {
        source: '/version.json',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
        ],
      },
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'expenso-ex.vercel.app',
          },
        ],
        destination: 'https://expense-ai-manager.vercel.app/:path*',
        permanent: true,
      },
    ]
  },
  // Ensure Next includes pdfjs-dist in serverless traces so it's available at runtime on Vercel
  outputFileTracingIncludes: {
    'src/pages/api/ai/parse-statement.ts': [
      './node_modules/pdfjs-dist/**',
      './node_modules/pdfjs-dist/legacy/build/pdf.js',
      './node_modules/pdfjs-dist/build/pdf.js',
      './node_modules/pdfjs-dist/legacy/build/pdf.mjs',
      './node_modules/pdfjs-dist/build/pdf.mjs',
      './node_modules/pdfjs-dist/build/pdf.worker.js',
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.js',
    ],
  },
  
    experimental: {
      optimizePackageImports: ['lucide-react', 'firebase', '@tanstack/react-query'],
    },
  
  output: process.env.MOBILE_BUILD === 'true' ? 'export' : undefined,
  images: {
    unoptimized: true,
    domains: [],
    formats: ['image/webp', 'image/avif'],
  },
}

module.exports = nextConfig;
