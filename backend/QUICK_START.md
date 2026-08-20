# NovaCart unified backend - quick start

This single Node/Express backend is the common server layer for Shiprocket,
Cashfree PG, Firebase Cloud Messaging notifications, and product image uploads.
It does not use Google Cloud Functions, Firebase Storage, or Secret Manager.

## 1. Install

npm install

## 2. Environment

Copy `.env.example` to `.env` and fill the secrets.

## 3. Run

npm run dev

Health:
GET http://localhost:5001/api/health

## 4. App API base URL

Point Customer/Seller/Admin apps to the deployed backend base URL.

Examples:
POST /api/cashfree/orders
POST /api/shipments/create
POST /api/notifications/register-token
POST /api/notifications/send-to-user
POST /api/uploads/images

All app-originated routes use Firebase ID token:
Authorization: Bearer <firebase_id_token>

Cashfree webhook is the exception:
POST /api/cashfree/webhook
It verifies Cashfree's x-webhook-signature against the raw body.

## 5. Cashfree

Sandbox uses https://sandbox.cashfree.com/pg.
Production uses https://api.cashfree.com/pg.
The API version defaults to 2025-01-01.

Cashfree returns a payment_session_id from create-order. The client app uses
that session ID with Cashfree's supported checkout SDK.

## 6. Shiprocket

The existing shipment controller remains in place and uses server-side
Shiprocket credentials. Amazon Shipping is explicitly excluded from courier
selection. Product applicable/product weight is required; there is no fake
500 g fallback.

## 7. Notifications

Register the device's FCM token once:
POST /api/notifications/register-token
Then send to a user with:
POST /api/notifications/send-to-user

## 8. Images

POST multipart/form-data to `/api/uploads/images` with field name `images`.
Maximum 10 files, 8 MB each. Files are served from `/uploads/...`.
For production, mount a persistent volume or move only this upload directory
to a managed object store; local ephemeral disks can lose files on redeploy.
