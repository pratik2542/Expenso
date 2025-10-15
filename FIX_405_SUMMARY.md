# 405 Error Fix - Summary

## Changes Made

### 1. API Routes Enhanced
Both `/api/ai/parse-statement.ts` and `/api/import/parse-spreadsheet.ts` now include:

✅ **Explicit runtime configuration:**
```typescript
export const runtime = 'nodejs'  // Force Node.js runtime (not Edge)
```

✅ **CORS headers:**
```typescript
res.setHeader('Access-Control-Allow-Origin', '*')
res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
```

✅ **OPTIONS preflight handling:**
```typescript
if (req.method === 'OPTIONS') {
  return res.status(200).end()
}
```

✅ **Better error logging:**
```typescript
console.log('[parse-statement] Starting file upload processing')
console.error('[parse-statement] Method not allowed:', req.method)
```

### 2. Vercel Configuration Updated
`vercel.json` now includes:
- Memory allocation: 1024MB
- API rewrites to ensure routes are handled correctly
- Comprehensive CORS headers
- Proper Allow headers

### 3. Upload UI Improvements
`AddExpenseModal.tsx` now features:
- ✅ Explicit `htmlFor` labels (`uploadPdfInput`, `uploadSheetInput`)
- ✅ File input reset after upload (allows re-selecting same file)
- ✅ Disabled inputs during upload
- ✅ Visible status messages with loading spinner:
  - "Uploading PDF..." / "Uploading Excel/CSV..."
  - "Analyzing your statement with AI..."
  - "Parsing transactions..."
  - "Successfully extracted X transactions!"
- ✅ Better error messages with status codes
- ✅ Console logging for debugging

### 4. Testing Tools Created

**Test HTML Page:** `/public/api-test.html`
- Visit: `https://your-site.vercel.app/api-test.html`
- Interactive tests for all API endpoints
- Shows status codes, headers, and responses
- Checks environment variables

**Test Bash Script:** `test-api.sh`
- Usage: `./test-api.sh https://your-site.vercel.app`
- Tests all API endpoints from command line
- Creates test PDF file
- Shows curl commands and results

**Test Endpoint:** `/api/test-upload.ts`
- Visit: `https://your-site.vercel.app/api/test-upload`
- Basic health check
- Shows which environment variables are set
- Supports GET and POST

## How to Deploy and Test

### Step 1: Commit and Push Changes
```bash
cd "/Users/pratiksinhmakwana/OneDrive - Ddrops Company/PC/ExpenseTracker/web"
git add -A
git commit -m "Fix 405 error: Add runtime config, CORS, and better error handling"
git push origin main
```

### Step 2: Redeploy on Vercel
1. Go to Vercel Dashboard
2. Wait for automatic deployment OR click "Redeploy"
3. **Important:** Uncheck "Use existing Build Cache"
4. Click "Redeploy"

### Step 3: Test with HTML Test Page
Visit: `https://your-site.vercel.app/api-test.html`

Click each test button:
1. ✅ Test 1: Should show "success: true" with environment info
2. ✅ Test 2: Should return 200 OK with CORS headers
3. ✅ Test 3: Should return 400 with "No file uploaded" error
4. ✅ Test 4: Should return 200 or 500 (API error), **NOT 405**
5. ✅ Test 5: Should show all environment variables are set

### Step 4: Test with Real Upload
1. Go to your app: `https://your-site.vercel.app/expenses`
2. Click "Add Expense"
3. Try uploading a PDF
4. You should see status messages:
   - "Uploading PDF..."
   - "Analyzing your statement with AI..."
   - "Parsing transactions..."
5. Should succeed or show a meaningful error (NOT 405)

## What Each Fix Does

### Runtime Configuration
```typescript
export const runtime = 'nodejs'
```
**Why:** Next.js 15 might try to use Edge runtime for API routes, which doesn't support `formidable` (file uploads). This forces Node.js runtime.

### CORS Headers
```typescript
res.setHeader('Access-Control-Allow-Origin', '*')
```
**Why:** Browsers send OPTIONS preflight request before POST. Without CORS headers, this fails with 405.

### OPTIONS Handling
```typescript
if (req.method === 'OPTIONS') {
  return res.status(200).end()
}
```
**Why:** Preflight requests use OPTIONS method. Must respond with 200, not 405.

### Response Limit
```typescript
api: { responseLimit: false }
```
**Why:** Large PDFs with many transactions might exceed default response size limit.

## Troubleshooting

### If Still Getting 405:

1. **Check Vercel Functions Tab**
   - Go to: Vercel Dashboard → Your Project → Functions
   - Should see: `/api/ai/parse-statement`
   - If missing: API route not deployed

2. **Check Build Logs**
   - Go to: Vercel Dashboard → Deployments → Latest → Build Logs
   - Search for errors related to `parse-statement.ts`
   - Look for TypeScript or import errors

3. **Check Environment Variables**
   - Go to: Vercel Dashboard → Settings → Environment Variables
   - All variables should be set for all environments

4. **Check Network Tab in Browser**
   - Open DevTools (F12) → Network tab
   - Try upload
   - Click failed request
   - Check:
     - Request Method: Should be POST
     - Status Code: Should NOT be 405
     - Response: Should have error message

5. **Check Vercel Logs**
   - Go to: Vercel Dashboard → Your Project → Functions
   - Click `/api/ai/parse-statement`
   - View real-time logs
   - Should see: `[parse-statement] Starting file upload processing`

### If Getting Different Error:

- **400 Error:** Good! Means route is working, just no file
- **500 Error:** API route is running but has internal error (check logs)
- **502/504 Error:** Timeout or memory issue (increase timeout in vercel.json)

## Expected Behavior After Fix

### Successful Upload:
1. Click "Upload PDF" button
2. Select PDF file
3. See blue status box: "Uploading PDF..." (with spinner)
4. Status changes to: "Analyzing your statement with AI..."
5. Status changes to: "Parsing transactions..."
6. Status shows: "Successfully extracted X transactions!" (with checkmark)
7. Transactions appear in list below
8. Can click checkboxes to select/deselect
9. Click "Import Selected" to add to expenses

### Failed Upload (with meaningful error):
1. Click "Upload PDF" button
2. Select invalid file
3. See blue status box: "Uploading PDF..."
4. Red error box appears with specific error:
   - "PDF is password-protected..."
   - "Invalid or corrupted PDF file..."
   - "No transactions found..."
5. Can try again with different file

## Files Changed
- ✅ `src/pages/api/ai/parse-statement.ts` - Added runtime config, CORS, OPTIONS handling
- ✅ `src/pages/api/import/parse-spreadsheet.ts` - Same fixes as above
- ✅ `src/components/AddExpenseModal.tsx` - Better UI, status messages, error handling
- ✅ `vercel.json` - Updated with memory, rewrites, comprehensive CORS
- ✅ `src/pages/api/test-upload.ts` - New test endpoint
- ✅ `public/api-test.html` - New interactive test page
- ✅ `test-api.sh` - New bash test script

## Next Steps

1. ✅ Commit and push changes
2. ✅ Redeploy on Vercel (clear cache)
3. ✅ Test with `/api-test.html`
4. ✅ Test real upload in app
5. ✅ Check Vercel logs if still failing

## Support

If still not working after these fixes:
1. Share the results from `/api-test.html` (screenshot)
2. Share the Network tab screenshot showing the failed request
3. Share the Vercel Functions tab screenshot
4. Share any error messages from Vercel logs
