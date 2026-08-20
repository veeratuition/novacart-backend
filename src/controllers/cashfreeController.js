import crypto from 'crypto';
import cashfreeService from '../services/cashfreeService.js';
import { db } from '../config/firebase.js';

function verifySignature(req) {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const rawBody = req.rawBody;
  const secret = process.env.CASHFREE_CLIENT_SECRET;
  if (!signature || !timestamp || !rawBody || !secret) return false;

  const age = Math.abs(Date.now() - Number(timestamp));
  if (!Number.isFinite(age) || age > 5 * 60 * 1000) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(String(timestamp) + rawBody)
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
}

class CashfreeController {
  async createOrder(req, res) {
    try {
      const body = req.body || {};
      const amount = Number(body.order_amount ?? body.amount);
      const orderId = String(body.order_id || '').trim();
      const customerId = String(body.customer_id || req.user?.uid || '').trim();
      const phone = String(body.customer_phone || '').trim();

      if (!orderId || !Number.isFinite(amount) || amount <= 0 || !customerId || !phone) {
        return res.status(400).json({ success: false, message: 'order_id, positive order_amount, customer_id and customer_phone are required.' });
      }

      const payload = {
        order_id: orderId,
        order_amount: Number(amount.toFixed(2)),
        order_currency: body.order_currency || 'INR',
        customer_details: {
          customer_id: customerId,
          customer_phone: phone,
          customer_name: body.customer_name || undefined,
          customer_email: body.customer_email || undefined,
        },
        order_meta: body.order_meta || undefined,
        order_note: body.order_note || undefined,
      };

      const result = await cashfreeService.createOrder(payload);
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(502).json({ success: false, message: error.message });
    }
  }

  async getOrder(req, res) {
    try {
      const result = await cashfreeService.getOrder(req.params.orderId);
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(502).json({ success: false, message: error.message });
    }
  }

  async webhook(req, res) {
    try {
      if (!verifySignature(req)) return res.status(400).json({ success: false, message: 'Invalid Cashfree webhook signature.' });
      const payload = JSON.parse(req.rawBody);
      const data = payload?.data || {};
      const order = data?.order || {};
      const payment = data?.payment || {};
      const orderId = order?.order_id || payload?.order_id;

      if (db && orderId) {
        const status = payment?.payment_status || payload?.type || 'UNKNOWN';
        await db.collection('orders').doc(String(orderId)).set({
          cashfreeStatus: status,
          cashfreeLastWebhook: payload,
          cashfreeUpdatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      return res.status(200).json({ success: true, received: true });
    } catch (error) {
      console.error('Cashfree webhook error:', error.message);
      return res.status(400).json({ success: false, message: 'Invalid webhook payload.' });
    }
  }
}

export default new CashfreeController();
