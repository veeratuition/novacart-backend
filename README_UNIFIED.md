# NovaCart Unified Backend v3

One Node/Express backend for:
- Firebase Auth verification + Firestore
- Shiprocket order/rate/AWB/label/invoice/tracking flow
- Cashfree PG create-order + order-status + signed webhook
- Firebase Cloud Messaging notifications
- Product image upload without Firebase Storage

## Routes

### Shiprocket
- POST /api/shipments/create
- GET /api/shipments/track/:awb
- POST /api/shipments/cancel
- GET /api/shipments/label/:shipmentId
- GET /api/shipments/invoice/:shipmentId

### Cashfree
- POST /api/cashfree/orders (Firebase Bearer token)
- GET /api/cashfree/orders/:orderId (Firebase Bearer token)
- POST /api/cashfree/webhook (Cashfree signature; no Firebase token)

### Notifications
- POST /api/notifications/send (Firebase Bearer token)

### Images
- POST /api/uploads/images (multipart field: images, max 10, 8MB each)
- GET /uploads/products/{sellerId}/{filename}

## Run
npm install
copy .env.example .env
npm run dev

## Production
Use a persistent-volume/managed object store for /uploads before production.
Do not commit .env or Firebase service-account JSON.

## Security
- Shiprocket and Cashfree secrets stay server-side.
- Cashfree webhook uses raw-body HMAC verification and a 5-minute replay window.
- Firebase ID tokens protect app-originated routes.
