import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

import shipmentRoutes from "./routes/shipmentRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import logger from "./utils/logger.js";
import { verifyFirebaseConnection } from "./config/firebase.js";
import authRoutes from "./routes/authRoutes.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "NovaCart Backend Running",
    version: "2.0.1",
  });
});

/*
 * IMPORTANT:
 * This health endpoint performs an actual Firestore read.
 * "firebase: ready" is therefore meaningful and catches bad
 * Google service-account credentials before Shiprocket is called.
 */
app.get("/api/health", async (req, res) => {
  try {
    const firebase = await verifyFirebaseConnection();

    res.status(200).json({
      success: true,
      status: "OK",
      timestamp: new Date().toISOString(),
      services: {
        firebase: "ready",
        shiprocket:
          process.env.SHIPROCKET_EMAIL &&
          process.env.SHIPROCKET_PASSWORD
            ? "configured"
            : "not_configured",
        cashfree:
          process.env.CASHFREE_CLIENT_ID &&
          process.env.CASHFREE_CLIENT_SECRET
            ? "configured"
            : "not_configured",
      },
      firebaseProject: firebase.projectId,
    });
  } catch (error) {
    logger.error(error.stack || error.message);

    res.status(503).json({
      success: false,
      status: "DEGRADED",
      timestamp: new Date().toISOString(),
      services: {
        firebase: "error",
        shiprocket:
          process.env.SHIPROCKET_EMAIL &&
          process.env.SHIPROCKET_PASSWORD
            ? "configured"
            : "not_configured",
      },
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Firebase service unavailable.",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/webhooks", webhookRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route Not Found",
  });
});

app.use((err, req, res, next) => {
  logger.error(err.stack || err.message);

  res.status(err.status || err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

export default app;
