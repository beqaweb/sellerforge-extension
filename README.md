# SellerForge — Chrome Extension

A toolkit for Amazon sellers. The first module automates the native Amazon "Request a Review" workflow for eligible orders.

## Features

- **Automated Review Requests** — Discovers orders on Manage Orders page, navigates to each, and uses Amazon's built-in "Request a Review" flow
- **Cloud Persistence** — Order states are stored in Firebase Firestore, scoped per user
- **Google Sign-In** — Authenticate with Google via Chrome's identity API
- **Deduplication** — Never requests a review twice for the same order
- **Smart Skip Logic** — Skips already-requested orders, retries "too early" orders on future runs

## Project Structure

```
sellerforge-extension/
├── manifest.json              # Chrome extension manifest (MV3)
├── background/
│   ├── service-worker.js      # Entry point, message router
│   ├── run-manager.js         # State machine, run lifecycle
│   └── order-queue.js         # Queue management, deduplication
├── content/
│   ├── content-script.js      # Entry point, message handler
│   ├── page-detector.js       # Detect which Amazon page we're on
│   ├── order-extractor.js     # Extract orders from Manage Orders page
│   ├── pagination-handler.js  # Handle pagination traversal
│   └── review-requester.js    # Handle Request a Review flow
├── firebase/
│   ├── firebase-config.js     # Firebase project config (edit this)
│   ├── firebase-auth.js       # Google Auth functions
│   └── firebase-firestore.js  # Firestore read/write for order states
├── shared/
│   ├── constants.js           # Statuses, message types, page types
│   └── utils.js               # Shared utilities
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.css              # Styles
│   └── popup.js               # Popup logic
├── lib/                       # Firebase SDK (see setup)
└── icons/                     # Extension icons
```

## Setup

### 1. Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project
2. Enable **Google** sign-in under Authentication → Sign-in method
3. Create a **Firestore Database** (start in test mode for development)
4. Copy your project's config values

### 2. Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** of type "Chrome Extension"
3. Set the **Application ID** to your Chrome extension ID
4. Copy the client ID

### 3. Configure the Extension

1. Edit `firebase/firebase-config.js` — paste your Firebase config values
2. Edit `manifest.json` — paste your OAuth client ID in the `oauth2.client_id` field
3. Optionally set the `key` field in manifest.json to pin your extension ID

### 4. Download Firebase SDK

Run the setup script:

```bash
./setup-firebase.sh
```

Or manually download these files into `lib/`:
- `firebase-app-compat.js`
- `firebase-auth-compat.js`
- `firebase-firestore-compat.js`

### 5. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this extension folder

## Usage

1. Navigate to Amazon Seller Central → Manage Orders
2. Click the SellerForge extension icon
3. Sign in with Google
4. Click **Start**
5. The extension will:
   - Discover all orders across pagination pages
   - Check Firestore for previously processed orders
   - Process each eligible order (click "Request a Review" → "Yes")
   - Save results to Firestore
6. Click **Stop** at any time to pause the run

## Firestore Schema

```
users/{userId}/orders/{orderId}
```

Each order document:
| Field | Type | Description |
|---|---|---|
| orderId | string | Amazon order ID |
| status | string | discovered, processing, requested, already_requested, too_early, failed, unrecognized_page |
| detailsUrl | string | URL to order details page |
| marketplace | string | e.g. amazon.com |
| createdAt | string | ISO timestamp |
| updatedAt | string | ISO timestamp |
| lastCheckedAt | string | ISO timestamp |
| lastRequestedAt | string | ISO timestamp (nullable) |
| errorMessage | string | Error detail (nullable) |

## Important Notes

- This extension ONLY uses Amazon's built-in "Request a Review" flow
- It does NOT send custom buyer-seller messages
- It does NOT bypass Amazon restrictions
- Orders marked as `requested` or `already_requested` are permanently skipped
- Orders marked as `too_early` will be retried on future runs
