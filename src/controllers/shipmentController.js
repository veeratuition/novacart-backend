import { db } from "../config/firebase.js";
import ApiResponse from "../utils/apiResponse.js";
import logger from "../utils/logger.js";
import shiprocketService from "../services/shiprocketService.js";

class ShipmentController {
  _ensureOrderOwnership(order, userId) {
    if (order.sellerId && order.sellerId !== userId) {
      const error = new Error("You are not allowed to manage this order.");
      error.statusCode = 403;
      throw error;
    }
  }

  async _findOrderByShipmentId(shipmentId) {
    let query = await db.collection("orders").where("shipmentId", "==", String(shipmentId)).limit(1).get();
    if (query.empty && !Number.isNaN(Number(shipmentId))) {
      query = await db.collection("orders").where("shipmentId", "==", Number(shipmentId)).limit(1).get();
    }
    return query.empty ? null : query.docs[0];
  }
  /*
  |--------------------------------------------------------------------------
  | Shiprocket Authentication Test
  |--------------------------------------------------------------------------
  */
  async authTest(req, res) {
    try {
      logger.info("Shiprocket Authentication Test API Called");

      const token = await shiprocketService.getToken();

      return ApiResponse.success(
        res,
        "Shiprocket Authentication Successful",
        {
          authenticated: true,
          tokenLength: token?.length || 0,
        }
      );
    } catch (error) {
      logger.error(`Shiprocket Auth Test Error: ${error.stack || error.message}`);

      return ApiResponse.error(
        res,
        error.message || "Internal Server Error"
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Create Shipment (Delhivery/eCart Priority + 40% COD Charge to Customer)
  |--------------------------------------------------------------------------
  */
  async createShipment(req, res) {
    try {
      logger.info("Create Shipment API Called");

      const { orderId } = req.body;

      if (!orderId) {
        return ApiResponse.error(res, "orderId is required");
      }

      // ---------------- 1. FETCH & VALIDATE ORDER ----------------
      const orderDoc = await db.collection("orders").doc(orderId).get();

      if (!orderDoc.exists) {
        return ApiResponse.error(res, "Order not found in database");
      }

      const order = orderDoc.data();
      this._ensureOrderOwnership(order, req.user.uid);

      // Check if shipment is already created
      if (order.shipmentId || order.shiprocketOrderId) {
        return ApiResponse.error(
          res,
          `Shipment already exists for this order (Shipment ID: ${order.shipmentId})`
        );
      }

      if (!order.phone) {
        return ApiResponse.error(res, "Customer phone number is missing");
      }
      if (!order.address || !order.city || !order.state || !order.pincode) {
        return ApiResponse.error(res, "Customer address details are incomplete");
      }

      // ---------------- 2. FETCH & VALIDATE PRODUCT ----------------
      if (!order.productId) {
        return ApiResponse.error(res, "productId is missing on the order");
      }

      const productDoc = await db.collection("products").doc(order.productId).get();

      if (!productDoc.exists) {
        return ApiResponse.error(res, "Product not found");
      }

      const product = productDoc.data();

      // Shipping weight comes from the product's applicable/product weight,
      // never from a fake 500 g fallback. If the saved product weight is per
      // unit, multiply by the order quantity. Dimensions are sent only when
      // Shiprocket requires them; they do not replace product weight.
      const quantity = Math.max(1, parseInt(String(order.quantity ?? 1), 10) || 1);
      const unitWeight = Number(
        product.applicableWeightKg ??
        product.applicable_weight_kg ??
        product.productWeightKg ??
        product.product_weight_kg ??
        product.weightKg ??
        product.weight ??
        0
      );
      const weight = unitWeight > 0 ? unitWeight * quantity : 0;
      const length = Number(product.length || 10);
      const width = Number(product.width || product.breadth || 10);
      const height = Number(product.height || 10);

      if (weight <= 0) {
        return ApiResponse.error(res, "Product applicable/product weight is missing. Add the product weight before shipping.");
      }

      // ---------------- 3. FETCH SELLER & PICKUP LOCATION / PINCODE ----------------
      let pickupLocation = "Office"; // Default location name
      let pickupPincode = "533101"; // Default pincode

      if (order.sellerId) {
        try {
          const sellerDoc = await db.collection("sellers").doc(order.sellerId).get();
          if (sellerDoc.exists) {
            const seller = sellerDoc.data();
            pickupLocation = seller.pickupLocation || seller.pickup_location || "Office";
            pickupPincode = seller.pincode || seller.pickupPincode || pickupPincode;
          }
        } catch (sellerErr) {
          logger.warn("Seller fetch failed, using defaults: " + sellerErr.message);
        }
      }

      // ---------------- 4. CHECK SERVICEABILITY & PRIORITY SELECTION ----------------
      let bestCourierId = null;
      let selectedCourierName = "";
      let courierFreightRate = 0;
      let customerShippingCharge = 0;

      const isCod = String(order.paymentMethod || "").toUpperCase() === "COD";

      try {
        const serviceabilityRes = await shiprocketService.checkServiceability({
          pickupPincode,
          deliveryPincode: order.pincode,
          weight: weight,
          length: length,
          width: width,
          height: height,
          isCod,
        });

        const availableCouriers = serviceabilityRes?.data?.available_courier_companies || [];

        if (availableCouriers.length > 0) {
          const eligibleCouriers = availableCouriers.filter((courier) => {
            const name = String(courier.courier_name || "").toLowerCase();
            const id = String(courier.courier_company_id || "");
            return !name.includes("amazon") && !["4", "29", "32", "181", "182", "195"].includes(id);
          });

          if (eligibleCouriers.length === 0) {
            return ApiResponse.error(res, "No eligible non-Amazon courier is available for this route.");
          }

          const preferredCouriers = eligibleCouriers.filter((courier) => {
            const name = String(courier.courier_name || "").toLowerCase();
            return name.includes("delhivery") || name.includes("ecart");
          });

          let chosenCourier = null;

          if (preferredCouriers.length > 0) {
            preferredCouriers.sort((a, b) => Number(a.rate) - Number(b.rate));
            chosenCourier = preferredCouriers[0];
            logger.info(`Priority Courier Selected (Delhivery/eCart): ${chosenCourier.courier_name}`);
          } else {
            eligibleCouriers.sort((a, b) => Number(a.rate) - Number(b.rate));
            chosenCourier = eligibleCouriers[0];
            logger.info(`Fallback Cheapest Courier Selected: ${chosenCourier.courier_name}`);
          }

          bestCourierId = chosenCourier.courier_company_id;
          selectedCourierName = chosenCourier.courier_name;
          courierFreightRate = Number(chosenCourier.rate || 0);

          if (isCod && courierFreightRate > 0) {
            customerShippingCharge = Math.round(courierFreightRate * 0.40);
          }

          logger.info(
            `Selected Courier: ${selectedCourierName} | Total Freight Rate: ₹${courierFreightRate} | Customer 40% Share: ₹${customerShippingCharge}`
          );
        }
      } catch (servErr) {
        logger.warn("Serviceability check skipped/failed: " + servErr.message);
      }

      // ---------------- 5. FORMAT CUSTOMER NAME & DATE ----------------
      const fullName = (order.customerName || order.billing_name || "Customer").trim();
      const nameParts = fullName.split(" ");
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      const now = new Date();
      const formattedDate = `${now.toISOString().split("T")[0]} ${now.toTimeString().substring(0, 5)}`;

      // ---------------- 6. EXACT CHECKOUT AMOUNT CALCULATION ----------------
      const productSubTotal = Number(order.totalAmount ?? (Number(product.sellingPrice || 0) * quantity));
      const unitSellingPrice = Number((productSubTotal / (quantity || 1)).toFixed(2));

      // ---------------- 7. BUILD SHIPROCKET PAYLOAD ----------------
      const payload = {
        order_id: orderId,
        order_date: formattedDate,
        pickup_location: pickupLocation,

        billing_customer_name: firstName,
        billing_last_name: lastName,
        billing_address: order.address,
        billing_address_2: order.addressLine2 || "",
        billing_city: order.city,
        billing_pincode: String(order.pincode),
        billing_state: order.state,
        billing_country: "India",
        billing_email: order.email || "customer@example.com",
        billing_phone: String(order.phone).replace(/\D/g, "").slice(-10),

        shipping_is_billing: true,

        order_items: [
          {
            name: product.productName || product.title || "Product Item",
            sku: product.sku || `SKU-${order.productId}`,
            units: quantity,
            selling_price: unitSellingPrice,
            discount: 0,
            tax: 0,
            hsn: product.hsnCode || "",
          },
        ],

        payment_method: isCod ? "COD" : "Prepaid",

        shipping_charges: customerShippingCharge,
        total_discount: 0,
        sub_total: productSubTotal,

        length: length,
        breadth: width,
        height: height,
        weight: weight,
      };

      // ---------------- 8. SHIPROCKET CREATE ORDER ----------------
      const shiprocketResponse = await shiprocketService.createOrder(payload);
      const resData = shiprocketResponse?.data || shiprocketResponse;

      if (!resData?.shipment_id) {
        const errorDetails = resData?.errors
          ? (typeof resData.errors === "object" ? JSON.stringify(resData.errors) : String(resData.errors))
          : (resData?.message || JSON.stringify(resData));
        throw new Error(`Shiprocket Order Creation Error: ${errorDetails}`);
      }

      let awbCode = resData.awb_code || "";
      let courierName = resData.courier_name || selectedCourierName || "";
      let courierCompanyId = resData.courier_company_id || bestCourierId || "";

      // ---------------- 9. ASSIGN AWB WITH SELECTED COURIER ----------------
      if (!awbCode && resData.shipment_id) {
        try {
          const awbResponse = await shiprocketService.assignAWB(resData.shipment_id, bestCourierId);
          const awbData = awbResponse?.response?.data || awbResponse?.data || awbResponse;

          if (awbData?.awb_code) {
            awbCode = awbData.awb_code;
            courierName = awbData.courier_name || courierName;
            courierCompanyId = awbData.courier_company_id || courierCompanyId;
            logger.info(`AWB Assigned Successfully: ${awbCode} (${courierName})`);
          }
        } catch (err) {
          logger.error("AWB Assign Failed: " + err.message);
        }
      }

      // ---------------- 10. REQUEST PICKUP IF AWB GENERATED ----------------
      let pickupRequested = false;
      let pickupResponse = null;

      if (resData.shipment_id && awbCode) {
        try {
          pickupResponse = await shiprocketService.requestPickup(resData.shipment_id);
          pickupRequested = true;
          logger.info("Pickup Requested Successfully");
        } catch (err) {
          logger.error("Pickup Request Failed: " + err.message);
        }
      }

      // ---------------- 11. UPDATE FIRESTORE ORDER (SAFE NATIVE DATES) ----------------
      const updateData = {
        shiprocketOrderId: resData.order_id?.toString() || "",
        shipmentId: resData.shipment_id?.toString() || "",
        awbCode: String(awbCode || ""),
        trackingId: String(awbCode || ""),
        courierName: courierName,
        courierCompanyId: courierCompanyId,
        shiprocketTotalCost: courierFreightRate,
        addedCustomerCodCharge: customerShippingCharge,
        channelOrderId: resData.channel_order_id || "",
        statusCode: resData.status_code || 0,
        shippingStatus: resData.status || "NEW",
        orderStatus: "Shipped",
        pickupRequested: pickupRequested,
        pickupResponse: pickupResponse || null,
        shipmentCreatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await orderDoc.ref.update(updateData);

      return ApiResponse.success(
        res,
        "Shipment Created Successfully",
        {
          orderId,
          shipmentId: resData.shipment_id,
          awbCode,
          courierName,
          shiprocketTotalCost: courierFreightRate,
          addedCustomerCodCharge: customerShippingCharge,
          pickupRequested,
        }
      );
    } catch (error) {
      logger.error("Create Shipment Error: " + (error.stack || error.message));

      return ApiResponse.error(res, error.message || "Failed to create shipment", error.statusCode || 500);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Retry AWB on Existing Shipment
  |--------------------------------------------------------------------------
  */
  async retryAwb(req, res) {
    try {
      const { orderId } = req.body || {};

      if (!orderId) {
        return ApiResponse.error(res, "orderId is required");
      }

      const orderDoc = await db.collection("orders").doc(String(orderId)).get();

      if (!orderDoc.exists) {
        return ApiResponse.notFound(res, "Order not found in database");
      }

      const order = orderDoc.data();
      this._ensureOrderOwnership(order, req.user.uid);

      if (order.awbCode) {
        return ApiResponse.success(res, "AWB already assigned", {
          orderId: String(orderId),
          shipmentId: order.shipmentId || "",
          awbCode: String(order.awbCode),
          courierName: order.courierName || "",
          alreadyAssigned: true,
        });
      }

      if (!order.shipmentId) {
        return ApiResponse.error(
          res,
          "Existing Shiprocket Shipment ID is missing. Create the shipment first."
        );
      }

      const shipmentId = Number(order.shipmentId);
      if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
        return ApiResponse.error(res, "Invalid Shiprocket Shipment ID.");
      }

      const courierId = order.courierCompanyId
        ? Number(order.courierCompanyId)
        : null;

      const awbResponse = await shiprocketService.assignAWB(
        shipmentId,
        Number.isFinite(courierId) && courierId > 0 ? courierId : null
      );

      const awbData =
        awbResponse?.response?.data ||
        awbResponse?.data ||
        awbResponse;

      const awbCode = String(awbData?.awb_code || "").trim();

      if (!awbCode) {
        throw new Error(
          `Shiprocket did not return an AWB code: ${JSON.stringify(awbData)}`
        );
      }

      const updateData = {
        awbCode,
        trackingId: awbCode,
        courierName: awbData?.courier_name || order.courierName || "",
        courierCompanyId:
          awbData?.courier_company_id ||
          order.courierCompanyId ||
          "",
        shippingStatus: "AWB_ASSIGNED",
        updatedAt: new Date().toISOString(),
      };

      await orderDoc.ref.update(updateData);

      return ApiResponse.success(res, "AWB Assigned Successfully", {
        orderId: String(orderId),
        shipmentId: String(order.shipmentId),
        awbCode,
        courierName: updateData.courierName,
        courierCompanyId: updateData.courierCompanyId,
        alreadyAssigned: false,
      });
    } catch (error) {
      logger.error(`Retry AWB Error: ${error.stack || error.message}`);
      return ApiResponse.error(
        res,
        error.message || "Failed to assign AWB",
        error.statusCode || 500
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Track Shipment
  |--------------------------------------------------------------------------
  */
  async trackShipment(req, res) {
    try {
      const { awb } = req.params;

      if (!awb) {
        return ApiResponse.error(res, "AWB number is required");
      }

      const orderQuery = await db.collection("orders").where("awbCode", "==", String(awb)).limit(1).get();
      if (orderQuery.empty) return ApiResponse.notFound(res, "Order not found for the given AWB.");
      this._ensureOrderOwnership(orderQuery.docs[0].data(), req.user.uid);

      const trackingData = await shiprocketService.trackShipment(awb);

      return ApiResponse.success(
        res,
        "Shipment Tracked Successfully",
        trackingData
      );
    } catch (error) {
      logger.error(`Track Shipment Error: ${error.stack || error.message}`);
      return ApiResponse.error(res, error.message || "Internal Server Error", error.statusCode || 500);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Cancel Shipment
  |--------------------------------------------------------------------------
  */
  async cancelShipment(req, res) {
    try {
      const { awb, shipmentId, orderId } = req.body;

      if (!awb && !shipmentId && !orderId) {
        return ApiResponse.error(
          res,
          "AWB code, Shipment ID, or Order ID is required to cancel shipment"
        );
      }

      let orderDoc = null;
      let targetOrderData = null;
      let shiprocketOrderIdToCancel = null;

      if (orderId) {
        orderDoc = await db.collection("orders").doc(orderId).get();
        if (orderDoc.exists) {
          targetOrderData = orderDoc.data();
          this._ensureOrderOwnership(targetOrderData, req.user.uid);
          shiprocketOrderIdToCancel = targetOrderData?.shiprocketOrderId;
        }
      }

      if (!shiprocketOrderIdToCancel && shipmentId) {
        const orderQuery = await db
          .collection("orders")
          .where("shipmentId", "==", shipmentId.toString())
          .limit(1)
          .get();

        if (!orderQuery.empty) {
          orderDoc = orderQuery.docs[0];
          targetOrderData = orderDoc.data();
          this._ensureOrderOwnership(targetOrderData, req.user.uid);
          shiprocketOrderIdToCancel = targetOrderData?.shiprocketOrderId;
        }
      }

      if (!shiprocketOrderIdToCancel && awb) {
        const orderQuery = await db
          .collection("orders")
          .where("awbCode", "==", awb.toString())
          .limit(1)
          .get();

        if (!orderQuery.empty) {
          orderDoc = orderQuery.docs[0];
          targetOrderData = orderDoc.data();
          this._ensureOrderOwnership(targetOrderData, req.user.uid);
          shiprocketOrderIdToCancel = targetOrderData?.shiprocketOrderId;
        }
      }

      if (!shiprocketOrderIdToCancel) {
        return ApiResponse.error(
          res,
          "Shiprocket Order ID missing on this order. Cannot cancel in Shiprocket."
        );
      }

      const cleanShiprocketOrderId = Number(shiprocketOrderIdToCancel);

      if (isNaN(cleanShiprocketOrderId)) {
        return ApiResponse.error(
          res,
          "Invalid Shiprocket Order ID format."
        );
      }

      logger.info(`Cancelling Shiprocket Order ID: ${cleanShiprocketOrderId}`);
      const cancelResponse = await shiprocketService.cancelOrder([cleanShiprocketOrderId]);

      if (orderDoc && orderDoc.ref) {
        await orderDoc.ref.update({
          shippingStatus: "CANCELLED",
          orderStatus: "Cancelled",
          updatedAt: new Date().toISOString(),
        });
      }

      return ApiResponse.success(
        res,
        "Shipment Cancelled Successfully",
        cancelResponse
      );
    } catch (error) {
      logger.error(`Cancel Shipment Error: ${error.stack || error.message}`);
      return ApiResponse.error(res, error.message || "Internal Server Error", error.statusCode || 500);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Generate Label
  |--------------------------------------------------------------------------
  */
  async generateLabel(req, res) {
    try {
      const { shipmentId } = req.params;

      if (!shipmentId) {
        return ApiResponse.error(res, "Shipment ID is required");
      }

      const orderDoc = await this._findOrderByShipmentId(shipmentId);
      if (!orderDoc) return ApiResponse.notFound(res, "Order not found for the given Shipment ID.");
      this._ensureOrderOwnership(orderDoc.data(), req.user.uid);

      const labelResponse = await shiprocketService.generateLabel(
        Number(shipmentId)
      );

      return ApiResponse.success(
        res,
        "Label Generated Successfully",
        labelResponse
      );
    } catch (error) {
      logger.error(`Generate Label Error: ${error.stack || error.message}`);
      return ApiResponse.error(res, error.message || "Internal Server Error", error.statusCode || 500);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Generate Invoice
  |--------------------------------------------------------------------------
  */
  async generateInvoice(req, res) {
    try {
      const { shipmentId } = req.params;

      if (!shipmentId) {
        return ApiResponse.error(res, "Shipment ID is required");
      }

      const orderDoc = await this._findOrderByShipmentId(shipmentId);
      if (!orderDoc) {
        return ApiResponse.error(res, "Order not found for given Shipment ID");
      }

      const order = orderDoc.data();
      this._ensureOrderOwnership(order, req.user.uid);

      if (!order.shiprocketOrderId) {
        return ApiResponse.error(res, "Shiprocket Order ID not found on this order");
      }

      const invoiceResponse = await shiprocketService.generateInvoice(
        Number(order.shiprocketOrderId)
      );

      return ApiResponse.success(
        res,
        "Invoice Generated Successfully",
        invoiceResponse
      );
    } catch (error) {
      logger.error(`Generate Invoice Error: ${error.stack || error.message}`);
      return ApiResponse.error(res, error.message || "Internal Server Error", error.statusCode || 500);
    }
  }
}

export default new ShipmentController();
