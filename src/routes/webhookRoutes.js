import express from "express";
import webhookController from "../controllers/WebhookController.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Shiprocket Webhook
|--------------------------------------------------------------------------
*/

router.post(
  "/shiprocket",
  webhookController.shiprocketWebhook
);

export default router;