# NovaCart Backend Deployment

## Firebase Admin credentials on Render

Do NOT upload a Firebase service-account JSON file to GitHub.

In Render -> Environment, the safest option is to set the complete service-account JSON in `FIREBASE_SERVICE_ACCOUNT`.

Use the EXACT JSON downloaded for the service account whose private key you want to keep using. The backend now prefers this complete JSON so project ID, client email and private key always stay paired.

If you do not use JSON, the fallback is:
- FIREBASE_PROJECT_ID = novacart-4dcd8
- FIREBASE_CLIENT_EMAIL = the client_email belonging to the SAME key
- FIREBASE_PRIVATE_KEY = the private_key belonging to the SAME key, with literal `\n` between lines if Render stores it on one line

Do not mix a private key from one service-account key with a client email from another.

After changing credentials, redeploy the service.

## Health check

Open:

GET /api/health

A successful response contains:

`"firebase":"ready"`

The health endpoint performs a real Firestore read, so it validates Google authentication rather than merely checking whether the SDK initialized.

## Seller registration

POST /api/auth/seller/register

The seller registration endpoint uses the same Firestore Admin credential and therefore must only be tested after `/api/health` returns Firebase ready.
