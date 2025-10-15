# 405 Error - Root Cause Analysis

## The Build Error

```
Error: Function Runtimes must have a valid version, for example `now-php@1.0.0`.
```

This error occurred because `vercel.json` had invalid `runtime` configuration. 

## What Was Wrong

In `vercel.json`, this was invalid:
```json
{
  "functions": {
    "src/pages/api/ai/parse-statement.ts": {
      "runtime": "nodejs18.x"  // ❌ Invalid for vercel.json
    }
  }
}
```

## The Fix

✅ Removed the `runtime` key from `vercel.json`:
```json
{
  "functions": {
    "src/pages/api/ai/parse-statement.ts": {
      "maxDuration": 60,
      "memory": 1024
      // No runtime key - Next.js handles this automatically
    }
  }
}
```

## Why This Fixes It

1. **Next.js API Routes automatically use Node.js runtime** when:
   - They're in `pages/api/` directory
   - They use `bodyParser: false` config
   - They import Node.js-only packages (like `formidable`, `fs`)

2. **The `runtime` key in vercel.json** is for custom runtimes (like `now-php@1.0.0`), NOT for specifying Node.js versions

3. **Vercel automatically detects** the correct runtime based on:
   - Your `package.json` dependencies
   - Your Next.js configuration
   - Your API route configuration

## Deploy Now

```bash
git add vercel.json
git commit -m "Fix vercel.json: Remove invalid runtime configuration"
git push origin main
```

This should fix the build error and your API routes should work correctly!

## After Deployment

1. Check build succeeds (no more runtime error)
2. Visit: `https://your-site.vercel.app/api/test-upload`
3. Try uploading a PDF
4. Should work without 405 error

## Additional Context

The 405 error you were seeing was likely a side effect of:
- Vercel unable to deploy the functions due to invalid config
- Functions not being created at all
- Requests falling through to a default 405 handler

With the corrected `vercel.json`, Vercel will:
- ✅ Build successfully
- ✅ Create the API route functions
- ✅ Use Node.js runtime automatically
- ✅ Handle POST requests correctly
- ✅ Support file uploads with formidable
