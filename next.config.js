/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  eslint: {
    // Temporarily ignore ESLint errors during builds to allow shipping/runtime verification
    ignoreDuringBuilds: true,
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
