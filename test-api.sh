#!/bin/bash

# Test API endpoints on your hosted site
# Usage: ./test-api.sh https://your-site.vercel.app

SITE_URL="${1:-http://localhost:3000}"

echo "🔍 Testing API endpoints on: $SITE_URL"
echo "================================================"
echo ""

# Test 1: Test endpoint (basic check)
echo "📋 Test 1: Basic API route test"
echo "GET $SITE_URL/api/test-upload"
curl -s "$SITE_URL/api/test-upload" | jq '.'
echo ""
echo ""

# Test 2: OPTIONS request (CORS preflight)
echo "📋 Test 2: OPTIONS preflight request"
echo "OPTIONS $SITE_URL/api/ai/parse-statement"
curl -X OPTIONS -v "$SITE_URL/api/ai/parse-statement" 2>&1 | grep -E "(HTTP/|Allow|Access-Control)"
echo ""
echo ""

# Test 3: POST with empty body (should fail gracefully)
echo "📋 Test 3: POST request without file"
echo "POST $SITE_URL/api/ai/parse-statement (no file)"
curl -X POST -s "$SITE_URL/api/ai/parse-statement" | jq '.'
echo ""
echo ""

# Test 4: POST with test file
echo "📋 Test 4: POST request with test PDF"
# Create a minimal PDF for testing
echo "%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Times-Roman
>>
>>
>>
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 18 Tf
0 0 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000327 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
420
%%EOF" > /tmp/test.pdf

echo "POST $SITE_URL/api/ai/parse-statement (with test.pdf)"
curl -X POST -s \
  -F "file=@/tmp/test.pdf" \
  "$SITE_URL/api/ai/parse-statement" | jq '.'
echo ""
echo ""

# Clean up
rm -f /tmp/test.pdf

echo "================================================"
echo "✅ Tests complete!"
echo ""
echo "💡 Expected results:"
echo "  - Test 1: Should return success: true"
echo "  - Test 2: Should return 200 OK with Allow headers"
echo "  - Test 3: Should return 400 with 'No file uploaded' error"
echo "  - Test 4: Should return success or error from Perplexity API"
echo ""
echo "⚠️  If you see 405 errors:"
echo "  1. Check Vercel Functions tab - API routes should be listed"
echo "  2. Check environment variables are set"
echo "  3. Redeploy with cache cleared"
echo "  4. Check build logs for errors"
