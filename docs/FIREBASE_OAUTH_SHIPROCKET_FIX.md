# NovaCart Firebase OAuth / Shiprocket fix

## Why this fixes the current error

The Seller app is already refreshing its Firebase ID token. The current error:

`16 UNAUTHENTICATED: Request had invalid authentication credentials.
Expected OAuth 2 access token...`

is happening when the Render backend accesses Firebase/Firestore.

The previous `/api/health` check only showed that Firebase Admin could initialize.
It did not prove that Google's OAuth token could be obtained.

This patch changes `/api/health` to perform a real Firestore read.

## IMPORTANT: rotate the exposed credentials

The Firebase private key, Shiprocket password and Cashfree secret that were
previously pasted into chat must be treated as exposed. Do NOT put them in
GitHub.

Create a NEW Firebase service-account key for the `novacart-4dcd8` project
and use the NEW key in Render.

Preferred Render environment variable:

`FIREBASE_SERVICE_ACCOUNT`

Paste the complete service-account JSON as one environment variable.

Do not use an old/revoked private key.

## Render

1. Open `novacart-backend`.
2. Environment.
3. Replace the old Firebase credential with the NEW service-account JSON.
4. Save changes.
5. Manual Deploy -> Deploy latest commit.
6. Open:
   `/api/health`

Expected:

`success: true`
`services.firebase: "ready"`

The response now means Firestore authentication actually worked.

## Local

After replacing the backend files:

`npm install`

`npm start`

Then:

`Invoke-WebRequest -UseBasicParsing http://localhost:5001/api/health`

Only test `Ship Now` after `/api/health` says Firebase is ready.

## Do not unblock the GitHub secret scanner

Never push the old secret to GitHub and never use an "allow secret" link.
The correct fix is to rotate credentials and keep secrets only in Render
Environment Variables.
