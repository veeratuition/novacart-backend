import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import env from "./config/env.js";
import { isFirebaseReady } from "./config/firebase.js";

// PORT సెలక్షన్: Process Env -> Config Env -> Default 5001
const PORT = process.env.PORT || env?.port || 5001;

let server;

async function startServer() {
  try {
    // '0.0.0.0' Binding ద్వారా Localtunnel / Ngrok మరియు Railway Health Checks పక్కాగా పాస్ అవుతాయి
    server = app.listen(PORT, "0.0.0.0", () => {
      console.log("=======================================");
      console.log("🚀 Marketplace Backend Started");
      console.log(`🌍 Environment : ${process.env.NODE_ENV || env?.nodeEnv || 'development'}`);
      console.log(`📡 Server Port : ${PORT}`);
      console.log(`🔥 Firebase   : ${isFirebaseReady() ? "connected" : "not configured"}`);
      console.log("=======================================");
    });
  } catch (error) {
    console.error("❌ Server Startup Failed");
    console.error(error);
    process.exit(1);
  }
}

// Graceful Shutdown Handler (సర్వర్ క్రాష్ లేదా రీస్టార్ట్ అయ్యేటప్పుడు కనెక్షన్లు క్లీన్ గా క్లోజ్ చేయడానికి)
const handleShutdown = (signal) => {
  console.log(`\n⚠️ Received ${signal}. Closing HTTP server gracefully...`);
  if (server) {
    server.close(() => {
      console.log("🛑 HTTP server closed successfully.");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

// Global Crash Handlers (సర్వర్ హఠాత్తుగా క్రాష్ అవ్వకుండా నిరోధిస్తాయి)
process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception thrown:", err);
  // తీవ్రమైన ఎర్రర్ వస్తే సర్వర్‌ని సేఫ్‌గా రీస్టార్ట్ అవ్వనివ్వడం మంచిది
  process.exit(1);
});

startServer();