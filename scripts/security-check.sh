#!/bin/bash
# Security Pre-Deploy Checklist
# Run this before every deployment to verify security measures

echo "🔒 Security Pre-Deploy Checklist"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

# Check 1: Environment variables
echo "1. Checking environment variables..."
EXPOSED_KEYS=$(grep "^NEXT_PUBLIC_.*API_KEY" .env.local 2>/dev/null | grep -v "FIREBASE" || true)
if [ -n "$EXPOSED_KEYS" ]; then
    echo -e "${RED}❌ FAIL: Server API keys exposed with NEXT_PUBLIC_ prefix${NC}"
    echo "$EXPOSED_KEYS"
    ((FAILED++))
else
    echo -e "${GREEN}✅ PASS: No server secrets exposed (Firebase keys are safe)${NC}"
    ((PASSED++))
fi

# Check 2: Console.log statements
echo ""
echo "2. Checking for console.log statements..."
LOG_COUNT=$(grep -r "console\.log" src/pages src/components --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [ "$LOG_COUNT" -gt "0" ]; then
    echo -e "${YELLOW}⚠️  WARNING: Found $LOG_COUNT console.log statements${NC}"
    ((WARNINGS++))
else
    echo -e "${GREEN}✅ PASS: No console.log found${NC}"
    ((PASSED++))
fi

# Check 3: Debug endpoints
echo ""
echo "3. Checking for debug endpoints..."
if [ -f "src/pages/api/debug-analytics.ts" ]; then
    echo -e "${RED}❌ FAIL: Debug endpoint exists${NC}"
    ((FAILED++))
else
    echo -e "${GREEN}✅ PASS: No debug endpoints${NC}"
    ((PASSED++))
fi

# Check 4: Security headers config
echo ""
echo "4. Checking security headers..."
if [ -f "next.config.security.js" ]; then
    echo -e "${GREEN}✅ PASS: Security headers config exists${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL: Missing security headers config${NC}"
    ((FAILED++))
fi

# Check 5: Security utilities
echo ""
echo "5. Checking security utilities..."
if [ -f "src/lib/security.ts" ]; then
    echo -e "${GREEN}✅ PASS: Security utilities exist${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL: Missing security utilities${NC}"
    ((FAILED++))
fi

# Check 6: Package vulnerabilities
echo ""
echo "6. Running npm audit..."
AUDIT_OUTPUT=$(npm audit 2>&1)
CRITICAL=$(echo "$AUDIT_OUTPUT" | grep -c "critical")
HIGH=$(echo "$AUDIT_OUTPUT" | grep -c "high")

if [ "$CRITICAL" -gt "0" ] || [ "$HIGH" -gt "0" ]; then
    echo -e "${RED}❌ FAIL: Found critical/high vulnerabilities${NC}"
    echo "Run: npm audit fix"
    ((FAILED++))
else
    echo -e "${GREEN}✅ PASS: No critical/high vulnerabilities${NC}"
    ((PASSED++))
fi

# Check 7: TypeScript compilation
echo ""
echo "7. Running TypeScript check..."
if npx tsc --noEmit > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS: TypeScript compilation successful${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL: TypeScript errors found${NC}"
    echo "Run: npx tsc --noEmit"
    ((FAILED++))
fi

# Check 8: Git status
echo ""
echo "8. Checking for sensitive files in git..."
SENSITIVE_FILES=$(git ls-files | grep -E "\.env|\.key|\.pem|secrets" || true)
if [ -n "$SENSITIVE_FILES" ]; then
    echo -e "${RED}❌ FAIL: Sensitive files tracked in git${NC}"
    echo "$SENSITIVE_FILES"
    ((FAILED++))
else
    echo -e "${GREEN}✅ PASS: No sensitive files in git${NC}"
    ((PASSED++))
fi

# Summary
echo ""
echo "================================"
echo "Summary:"
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
if [ "$WARNINGS" -gt "0" ]; then
    echo -e "${YELLOW}⚠️  Warnings: $WARNINGS${NC}"
fi
if [ "$FAILED" -gt "0" ]; then
    echo -e "${RED}❌ Failed: $FAILED${NC}"
fi

echo ""
if [ "$FAILED" -eq "0" ]; then
    echo -e "${GREEN}🎉 Ready for deployment!${NC}"
    exit 0
else
    echo -e "${RED}🚨 Fix failures before deploying!${NC}"
    exit 1
fi
