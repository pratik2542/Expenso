#!/bin/bash
set -e

# Configuration
KEYSTORE_PATH="android/my-release-key.keystore"
KEYSTORE_ALIAS="alias_name"
KEYSTORE_PASS="password"
BUILD_TOOLS_PATH="/opt/homebrew/share/android-commandlinetools/build-tools/34.0.0"
APK_UNSIGNED="android/app/build/outputs/apk/release/app-release-unsigned.apk"
APK_ALIGNED="android/app-release-aligned.apk"
APK_SIGNED="android/app-release-signed.apk"
PUBLIC_APK="public/Expenso.apk"

echo "🚀 Starting Android Build Process..."

# 0. Update version.json
echo "📝 Updating version.json..."
VERSION=$(node -p "require('./package.json').version")
echo "{\"version\": \"$VERSION\", \"build\": $(date +%s), \"releaseDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}" > public/version.json

# 1. Build Web Assets
echo "📦 Building Next.js project..."
export MOBILE_BUILD=true 
npm run build

# 2. Sync with Capacitor
echo "🔄 Syncing with Capacitor..."
npx cap sync

# 3. Build Android APK
echo "🤖 Building Android APK..."
cd android
./gradlew clean
./gradlew assembleRelease
cd ..

# 4. Align APK
echo "📏 Aligning APK..."
"$BUILD_TOOLS_PATH/zipalign" -v -f 4 "$APK_UNSIGNED" "$APK_ALIGNED"

# 5. Sign APK
echo "✍️ Signing APK..."
"$BUILD_TOOLS_PATH/apksigner" sign --ks "$KEYSTORE_PATH" --ks-key-alias "$KEYSTORE_ALIAS" --ks-pass "pass:$KEYSTORE_PASS" --key-pass "pass:$KEYSTORE_PASS" --out "$APK_SIGNED" "$APK_ALIGNED"

# 6. Publish to Public Folder
echo "🚚 Moving to public folder..."
cp "$APK_SIGNED" "$PUBLIC_APK"

# 7. Cleanup
echo "🧹 Cleaning up intermediate files..."
rm "$APK_ALIGNED"
rm "$APK_SIGNED"

echo "✅ Build Complete!"
echo "🎉 New APK is available at: $PUBLIC_APK"
