import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import shipmentRoutes from "./routes/shipmentRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import cashfreeRoutes from "./routes/cashfreeRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import logger from "./utils/logger.js";
import { getFirebaseInitializationError, isFirebaseReady } from "./config/firebase.js";

const app = express();

/*
|--------------------------------------------------------------------------
| Security Middleware (Helmet Configured for Local Tunnels & Dev)
|--------------------------------------------------------------------------
*/
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/*
|--------------------------------------------------------------------------
| Dynamic CORS Automation (Allows Firebase Auth Headers & Tunnels)
|--------------------------------------------------------------------------
*/
app.use(
  cors({
    origin: "*", // అన్ని క్లయింట్‌లను (Localtunnel, Emulator, App) అనుమతిస్తుంది
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization", // 🔴 ఫైర్‌బేస్ టోకెన్ పాస్ అవ్వడానికి అతి ముఖ్యం
      "Bypass-Tunnel-Remainder", // 🔴 Localtunnel తలనొప్పి రాకుండా ఉండటానికి
    ],
    credentials: false,
  })
);

/*
|--------------------------------------------------------------------------
| Body Parser (Support Large Payload)
|--------------------------------------------------------------------------
*/
app.use(express.json({
  limit: "20mb",
  verify: (req, res, buf) => { req.rawBody = buf.toString("utf8"); }
}));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

/*
|--------------------------------------------------------------------------
| Compression & Logging
|--------------------------------------------------------------------------
*/
app.use(compression());
app.use(morgan("dev"));

/*
|--------------------------------------------------------------------------
| Health Check (Root Route)
|--------------------------------------------------------------------------
*/
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Marketplace Backend Running",
    version: "3.0.0-unified",
  });
});

/*
|--------------------------------------------------------------------------
| API Health Check (Automated Recovery Check)
|--------------------------------------------------------------------------
*/
app.get("/api/health", (req, res) => {
  const firebaseReady = isFirebaseReady();
  const initError = getFirebaseInitializationError();

  res.status(200).json({
    success: true,
    status: firebaseReady ? "OK" : "DEGRADED",
    timestamp: new Date().toISOString(),
    services: {
      firebase: firebaseReady ? "ready" : "not_configured",
      shiprocket: process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD ? "configured" : "not_configured",
      cashfree: process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET ? "configured" : "not_configured",
    },
    ...(firebaseReady
      ? {}
      : { error: typeof initError === "object" ? initError?.message : initError }),
  });
});

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/
app.use("/api/shipments", shipmentRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/cashfree", cashfreeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/uploads", express.static("uploads"));

/*
|--------------------------------------------------------------------------
| 404 Route Handler
|--------------------------------------------------------------------------
*/
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route Not Found",
  });
});

/*
|--------------------------------------------------------------------------
| Global Automated Error Handler
|--------------------------------------------------------------------------
*/
app.use((err, req, res, next) => {
  logger.error(err.stack || err.message);

  // 401 లేదా బ్రోకెన్ టోకెన్ ఎర్రర్‌లను క్లియర్ మెసేజ్‌తో ఆటోమేటిక్‌గా రిటర్న్ చేస్తుంది
  const statusCode = err.status || err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
});

export default app;