import axios from "axios";
import logger from "../utils/logger.js";

class ShiprocketService {
  constructor() {
    this.baseURL = process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in/v1/external";
    this.token = null;
    this.tokenExpiry = null;
    this.authPromise = null; // Race-condition prevention lock
    this.MAX_RETRIES = 2;

    // Axios Instance with Default Headers & Timeout
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Authentication & Token Management (with Race-Condition Lock)
  |--------------------------------------------------------------------------
  */
  async authenticate(forceRefresh = false) {
    // 1. Return cached token if still valid
    if (
      !forceRefresh &&
      this.token &&
      this.tokenExpiry &&
      new Date() < this.tokenExpiry
    ) {
      return this.token;
    }

    // 2. Prevent concurrent /auth/login calls (Race condition fix)
    if (this.authPromise) {
      return await this.authPromise;
    }

    this.authPromise = (async () => {
      try {
        const email = process.env.SHIPROCKET_EMAIL;
        const password = process.env.SHIPROCKET_PASSWORD;

        if (!email || !password) {
          throw new Error("Shiprocket EMAIL or PASSWORD is missing in environment variables!");
        }

        logger.info("Authenticating with Shiprocket API...");

        const response = await this.client.post("/auth/login", { email, password });

        if (!response.data?.token) {
          throw new Error("Shiprocket token not received in response");
        }

        this.token = response.data.token;

        // Token valid for 10 days, set safety margin to 9 days
        this.tokenExpiry = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);

        logger.info("✅ Shiprocket Authentication Successful");
        return this.token;
      } catch (error) {
        const errorMsg =
          error.response?.data?.message ||
          error.message ||
          "Shiprocket Authentication Failed";
        logger.error(`❌ Shiprocket Auth Error: ${errorMsg}`);
        throw new Error(errorMsg);
      } finally {
        this.authPromise = null; // Clear lock
      }
    })();

    return await this.authPromise;
  }

  async getToken() {
    return await this.authenticate();
  }

  /*
  |--------------------------------------------------------------------------
  | Centralized Request Helper (Timeout, Retry, 401 Refresh & Logging)
  |--------------------------------------------------------------------------
  */
  async request(config, retryCount = 0) {
    try {
      const token = await this.authenticate();

      // Safe clone of config to prevent mutating original object
      const requestConfig = {
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        },
      };

      const response = await this.client(requestConfig);

      logger.info(
        `Shiprocket ${requestConfig.method?.toUpperCase() || "GET"} ${requestConfig.url} Success`
      );

      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const url = config.url;

      // If 401 Unauthorized, force refresh token once and retry
      if (status === 401 && retryCount === 0) {
        logger.warn(
          `Shiprocket 401 Unauthorized encountered for ${url}. Refreshing token and retrying...`
        );
        await this.authenticate(true);
        return this.request(config, retryCount + 1);
      }

      // Retry Logic for Network Errors / Timeouts / 5xx Server Errors
      if (
        retryCount < this.MAX_RETRIES &&
        (!status || status >= 500 || error.code === "ECONNABORTED")
      ) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        logger.warn(
          `Shiprocket request failed for ${url}. Retrying (${retryCount + 1}/${this.MAX_RETRIES}) after ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.request(config, retryCount + 1);
      }

      // Clean Error Message Handling
      const resData = error.response?.data;
      let errorMessage = "Shiprocket API Failed";

      if (typeof resData?.message === "string") {
        errorMessage = resData.message;
      } else if (typeof resData?.error === "string") {
        errorMessage = resData.error;
      } else if (resData?.errors) {
        errorMessage = typeof resData.errors === "object"
          ? JSON.stringify(resData.errors)
          : String(resData.errors);
      } else if (error.message) {
        errorMessage = error.message;
      }

      logger.error(`Shiprocket API Error [${url}]: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | API Endpoints
  |--------------------------------------------------------------------------
  */

  async createOrder(payload) {
    return await this.request({
      method: "POST",
      url: "/orders/create/adhoc",
      data: payload,
    });
  }

  async assignAWB(shipmentId, courierId = null) {
    const data = { shipment_id: Number(shipmentId) };
    if (courierId) {
      data.courier_id = Number(courierId);
    }

    return await this.request({
      method: "POST",
      url: "/courier/assign/awb",
      data: data,
    });
  }

  // Helper Alias to assign specific courier
  async assignAWBWithCourier(shipmentId, courierId) {
    return await this.assignAWB(shipmentId, courierId);
  }

  async trackShipment(awb) {
    return await this.request({
      method: "GET",
      url: `/courier/track/awb/${awb}`,
    });
  }

  async cancelOrder(ids) {
    if (!ids || (Array.isArray(ids) && ids.length === 0)) {
      throw new Error("Shipment/Order ID required for cancellation");
    }

    // Shiprocket expects IDs to be formatted cleanly inside an array
    const rawIds = Array.isArray(ids) ? ids : [ids];
    const payloadIds = rawIds.map((id) => (isNaN(Number(id)) ? id : Number(id)));

    return await this.request({
      method: "POST",
      url: "/orders/cancel",
      data: { ids: payloadIds },
    });
  }

  async generateLabel(shipmentId) {
    if (!shipmentId) {
      throw new Error("Shipment ID required for generating label");
    }

    const shipmentIds = Array.isArray(shipmentId)
      ? shipmentId.map(Number)
      : [Number(shipmentId)];

    return await this.request({
      method: "POST",
      url: "/courier/generate/label",
      data: { shipment_id: shipmentIds },
    });
  }

  async generateInvoice(ids) {
    if (!ids) {
      throw new Error("Order ID required for generating invoice");
    }

    const rawIds = Array.isArray(ids) ? ids : [ids];
    const payloadIds = rawIds.map((id) => (isNaN(Number(id)) ? id : Number(id)));

    return await this.request({
      method: "POST",
      url: "/orders/print/invoice",
      data: { ids: payloadIds },
    });
  }

  async requestPickup(shipmentId) {
    if (!shipmentId) {
      throw new Error("Shipment ID required for requesting pickup");
    }

    const shipmentIds = Array.isArray(shipmentId)
      ? shipmentId.map(Number)
      : [Number(shipmentId)];

    return await this.request({
      method: "POST",
      url: "/courier/generate/pickup",
      data: { shipment_id: shipmentIds },
    });
  }

  /*
  | Upgraded Check Serviceability Method
  */
  async checkServiceability(pickupPincode, deliveryPincode, weight, cod = 0, length = 10, width = 10, height = 10) {
    let params = {};

    if (typeof pickupPincode === "object" && pickupPincode !== null) {
      const opts = pickupPincode;
      params = {
        pickup_postcode: opts.pickupPincode,
        delivery_postcode: opts.deliveryPincode,
        weight: opts.weight,
        cod: opts.isCod ? 1 : (opts.cod ? 1 : 0),
        length: opts.length || 10,
        breadth: opts.width || opts.breadth || 10,
        height: opts.height || 10,
      };
    } else {
      params = {
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        weight: weight,
        cod: cod,
        length: length,
        breadth: width,
        height: height,
      };
    }

    return await this.request({
      method: "GET",
      url: "/courier/serviceability",
      params: params,
    });
  }

  async getShipmentDetails(shipmentId) {
    return await this.request({
      method: "GET",
      url: `/shipments/${shipmentId}`,
    });
  }
}

export default new ShiprocketService();