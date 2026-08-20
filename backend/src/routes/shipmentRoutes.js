import express from "express";
import shipmentController from "../controllers/shipmentController.js";
import { requireFirebaseAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Shipment Routes
|--------------------------------------------------------------------------
|
| Base URL:
| /api/shipments
|
*/

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/
router.get(
  "/auth-test",
  shipmentController.authTest
);

/*
|--------------------------------------------------------------------------
| Create Shipment
|--------------------------------------------------------------------------
*/
router.post(
  "/create",
  requireFirebaseAuth,
  shipmentController.createShipment
);

/*
|--------------------------------------------------------------------------
| Track Shipment
|--------------------------------------------------------------------------
*/
router.post(
  "/retry-awb",
  requireFirebaseAuth,
  shipmentController.retryAwb
);

router.get(
  "/track/:awb",
  requireFirebaseAuth,
  shipmentController.trackShipment
);

/*
|--------------------------------------------------------------------------
| Cancel Shipment
|--------------------------------------------------------------------------
*/
router.post(
  "/cancel",
  requireFirebaseAuth,
  shipmentController.cancelShipment
);

/*
|--------------------------------------------------------------------------
| Generate Shipping Label
|--------------------------------------------------------------------------
*/
router.get(
  "/label/:shipmentId",
  requireFirebaseAuth,
  shipmentController.generateLabel
);

/*
|--------------------------------------------------------------------------
| Generate Invoice
|--------------------------------------------------------------------------
*/
router.get(
  "/invoice/:shipmentId",
  requireFirebaseAuth,
  shipmentController.generateInvoice
);

export default router;
