import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import env from "./config/env.js";
import { isFirebaseReady, getFirebaseInitializationError } from "./config/firebase.js";

const PORT = Number(process.env.PORT || env?.port || 5001);

let server;

async function startServer() {
  try {
    server = app.listen(PORT, "0.0.0.0", () => {
      console.log("=======================================");
      console.log("🚀 NovaCart Backend Started");
      console.log(`🌍 Environment : ${process.env.NODE_ENV || env?.nodeEnv || "development"}`);
      console.log(`📡 Server Port : ${PORT}`);
      console.log(`🔥 Firebase Admin : ${isFirebaseReady() ? "initialized" : "not ready"}`);
      if (!isFirebaseReady()) console.error(`❌ Firebase error: ${getFirebaseInitializationError()?.message || "unknown"}`);
      console.log("=======================================");
    });
  } catch (error) {
    console.error("❌ Server Startup Failed");
    console.error(error);
    process.exit(1);
  }
}

const shutdown = (signal) => {
  console.log(`\n⚠️ Received ${signal}. Closing server...`);

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(() => {
    console.log("🛑 HTTP server closed successfully.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

startServer();
