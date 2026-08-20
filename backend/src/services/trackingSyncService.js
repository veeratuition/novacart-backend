import { db } from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import logger from "../utils/logger.js";

class TrackingSyncService {
  /*
  |--------------------------------------------------------------------------
  | Helper: Find Order Doc by Shipment ID or AWB Code
  |--------------------------------------------------------------------------
  */
  async _findOrderDoc(shipmentId, awbCode) {
    if (!shipmentId && !awbCode) return null;

    // 1. Query by shipmentId (both String and Number types)
    if (shipmentId) {
      let query = await db
        .collection("orders")
        .where("shipmentId", "==", shipmentId.toString())
        .limit(1)
        .get();

      if (!query.empty) return query.docs[0];

      // Try numeric shipmentId if stored as Number in Firestore
      if (!isNaN(Number(shipmentId))) {
        query = await db
          .collection("orders")
          .where("shipmentId", "==", Number(shipmentId))
          .limit(1)
          .get();

        if (!query.empty) return query.docs[0];
      }
    }

    // 2. Fallback query by AWB Code / Tracking ID
    if (awbCode) {
      const query = await db
        .collection("orders")
        .where("trackingId", "==", awbCode.toString())
        .limit(1)
        .get();

      if (!query.empty) return query.docs[0];
    }

    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | Process Shiprocket Webhook
  |--------------------------------------------------------------------------
  */
  async processWebhook(payload) {
    try {
      logger.info("Shiprocket Webhook Processing Started");

      const shipmentId = payload.shipment_id?.toString() || "";
      const awbCode = payload.awb_code || payload.awb || "";
      const shippingStatus = payload.current_status || payload.status || "Unknown";
      const courierName = payload.courier_name || "";
      const currentLocation = payload.current_location || payload.location || "";
      const statusDate = payload.current_timestamp || payload.status_date || new Date().toISOString();
      const etd = payload.etd || "";

      if (!shipmentId && !awbCode) {
        throw new Error("Shipment ID or AWB Code not found in webhook payload");
      }

      //--------------------------------------------------
      // Find Order in Firestore
      //--------------------------------------------------
      const orderDoc = await this._findOrderDoc(shipmentId, awbCode);

      if (!orderDoc) {
        logger.warn(`Order not found for Shipment ID: ${shipmentId}, AWB: ${awbCode}`);
        return { success: false, message: "Order not found" };
      }

      //--------------------------------------------------
      // Map Order & Shipping Statuses
      //--------------------------------------------------
      let orderStatus = shippingStatus;
      const normalizedStatus = shippingStatus.toUpperCase().trim();

      switch (normalizedStatus) {
        case "PICKUP SCHEDULED":
        case "PICKUP GENERATED":
        case "MANIFEST GENERATED":
          orderStatus = "Pickup Scheduled";
          break;

        case "PICKED UP":
        case "IN TRANSIT":
        case "REACHED AT DESTINATION HUB":
          orderStatus = "In Transit";
          break;

        case "OUT FOR DELIVERY":
          orderStatus = "Out For Delivery";
          break;

        case "DELIVERED":
          orderStatus = "Delivered";
          break;

        case "RTO IN TRANSIT":
        case "RTO IN-TRANSIT":
        case "RTO INITIATED":
          orderStatus = "RTO In Transit";
          break;

        case "RTO DELIVERED":
          orderStatus = "RTO Delivered";
          break;

        case "CANCELED":
        case "CANCELLED":
          orderStatus = "Cancelled";
          break;

        case "UNDELIVERED":
        case "DELAYED":
          orderStatus = "Delivery Delayed";
          break;

        default:
          orderStatus = shippingStatus;
      }

      //--------------------------------------------------
      // Build Firestore Update Payload
      //--------------------------------------------------
      const updateData = {
        shippingStatus,
        orderStatus,
        trackingId: awbCode,
        awbCode,
        courierName,
        currentLocation,
        statusDate,
        updatedAt: FieldValue.serverTimestamp(),

        // Add to tracking timeline history array
        trackingHistory: FieldValue.arrayUnion({
          status: shippingStatus,
          location: currentLocation,
          activity: payload.scans || payload.activity || shippingStatus,
          date: statusDate,
          updatedAt: new Date().toISOString(),
        }),
      };

      if (etd) {
        updateData.estimatedDeliveryDate = etd;
      }

      // Stamp delivered time if marked delivered
      if (normalizedStatus === "DELIVERED") {
        updateData.deliveredAt = FieldValue.serverTimestamp();
        updateData.paymentStatus = "Paid"; // Usually marked paid upon delivery for COD
      }

      await orderDoc.ref.update(updateData);

      logger.info(`✅ Shipment ${shipmentId || awbCode} updated successfully to status: ${orderStatus}`);

      return {
        success: true,
        orderId: orderDoc.id,
        shipmentId,
        shippingStatus,
        orderStatus,
      };
    } catch (error) {
      logger.error(`❌ Shiprocket Webhook Processing Error: ${error.stack || error.message}`);
      throw error;
    }
  }
}

export default new TrackingSyncService();