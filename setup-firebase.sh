#!/bin/bash
# SellerForge — Firebase SDK Setup Script
#
# Downloads the Firebase compat SDK files needed by the extension.
# Run this from the extension root directory.

FIREBASE_VERSION="10.12.0"
BASE_URL="https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}"

echo "Downloading Firebase SDK v${FIREBASE_VERSION}..."

curl -sL "${BASE_URL}/firebase-app-compat.js" -o lib/firebase-app-compat.js
echo "  ✓ firebase-app-compat.js"

curl -sL "${BASE_URL}/firebase-auth-compat.js" -o lib/firebase-auth-compat.js
echo "  ✓ firebase-auth-compat.js"

curl -sL "${BASE_URL}/firebase-firestore-compat.js" -o lib/firebase-firestore-compat.js
echo "  ✓ firebase-firestore-compat.js"

echo ""
echo "Done! Firebase SDK files are in lib/"
echo ""
echo "Next steps:"
echo "  1. Update firebase/firebase-config.js with your Firebase project config"
echo "  2. Update manifest.json oauth2.client_id with your Google OAuth client ID"
echo "  3. Load the extension in Chrome at chrome://extensions (Developer mode)"
