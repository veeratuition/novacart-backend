import axios from 'axios';
import logger from '../utils/logger.js';

class CashfreeService {
  constructor() {
    const environment = String(
      process.env.CASHFREE_ENVIRONMENT ||
      process.env.CASHFREE_ENV ||
      'sandbox'
    ).trim().toLowerCase();

    this.environment = environment === 'production' ? 'production' : 'sandbox';
    this.baseURL = this.environment === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
    this.apiVersion = process.env.CASHFREE_API_VERSION || '2025-01-01';
    this.client = axios.create({ baseURL: this.baseURL, timeout: 20000 });
  }

  headers() {
    const id = process.env.CASHFREE_CLIENT_ID;
    const secret = process.env.CASHFREE_CLIENT_SECRET;
    if (!id || !secret) throw new Error('Cashfree client ID/secret is not configured.');
    return {
      'x-client-id': id,
      'x-client-secret': secret,
      'x-api-version': this.apiVersion,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async createOrder(payload) {
    try {
      const response = await this.client.post('/orders', payload, { headers: this.headers() });
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Cashfree create order failed: ${message}`);
      throw new Error(message || 'Cashfree order creation failed.');
    }
  }

  async getOrder(orderId) {
    try {
      const response = await this.client.get(`/orders/${encodeURIComponent(orderId)}`, { headers: this.headers() });
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Cashfree get order failed: ${message}`);
      throw new Error(message || 'Cashfree order lookup failed.');
    }
  }
}

export default new CashfreeService();
