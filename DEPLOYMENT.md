# NovaCart backend deployment

Deploy the `backend` directory as the Render service root. Use `npm ci` as the build command and `npm start` as the start command.

Set the variables from `.env.example` in Render. Firebase Admin accepts exactly one of `FIREBASE_SERVICE_ACCOUNT` (the complete JSON as one Render environment-variable value), `FIREBASE_SERVICE_ACCOUNT_BASE64`, or all of `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`. Do not upload a service-account JSON file or commit it to Git.

After deploy, open `/api/health`. It must return `success: true` and `services.firebase: ready` before creating a shipment. A `503` with `firebase: not_configured` means configuration is missing; the service intentionally remains up instead of crashing with a 502.

The mobile app authenticates every shipping request with a Firebase ID token. The backend verifies it and allows a seller to access only orders whose `sellerId` matches that token's UID.
