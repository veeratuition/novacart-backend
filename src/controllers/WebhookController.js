import ApiResponse from "../utils/apiResponse.js";
import logger from "../utils/logger.js";
import trackingSyncService from "../services/trackingSyncService.js";

class WebhookController {

  /*
  |--------------------------------------------------------------------------
  | Shiprocket Webhook
  |--------------------------------------------------------------------------
  */
  async shiprocketWebhook(req, res) {
    try {
      logger.info("Shiprocket Webhook Received");

      const payload = req.body;

      const result = await trackingSyncService.processWebhook(payload);

      return ApiResponse.success(
        res,
        "Webhook Processed Successfully",
        result
      );

    } catch (error) {
      logger.error(error.stack || error.message);

      return ApiResponse.error(
        res,
        process.env.NODE_ENV === "development"
          ? error.message
          : "Webhook Processing Failed"
      );
    }
  }

}

export default new WebhookController();