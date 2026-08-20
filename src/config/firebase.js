import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

let initError = null;

function formatPrivateKey(key) {
  if (!key) return null;
  let cleanKey = key.trim();
  if (cleanKey.startsWith('"') && cleanKey.endsWith('"')) {
    cleanKey = cleanKey.slice(1, -1);
  }
  cleanKey = cleanKey.replace(/\\n/g, "\n");
  return cleanKey;
}

if (!getApps().length) {
  try {
    let serviceAccount = null;
    const localJsonPath = path.resolve(process.cwd(), "serviceAccountKey.json");

    // 1. స్థానిక serviceAccountKey.json నుండి లోడ్ చేయడం
    if (fs.existsSync(localJsonPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(localJsonPath, "utf8"));
      console.log("🚀 Firebase loaded directly from serviceAccountKey.json!");
    } 
    // 2. Base64 Env variable నుండి రీడ్ చేయడం
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const decoded = Buffer.from(
        process.env.FIREBASE_SERVICE_ACCOUNT_BASE64.trim(),
        "base64"
      ).toString("utf-8");
      serviceAccount = JSON.parse(decoded);
      console.log("🚀 Firebase loaded via Base64 env variable!");
    } 
    // 3. .env లోని వేరియబుల్స్ నుండి లోడ్ చేయడం (camelCase & snake_case రెండింటికీ సపోర్ట్)
    else if (process.env.FIREBASE_PRIVATE_KEY) {
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      };
      console.log("🚀 Firebase loaded via .env environment variables!");
    } else {
      initError = "No valid Firebase credentials found (JSON, Base64, or .env)!";
      console.error("🚨 CRITICAL: " + initError);
    }

    if (serviceAccount && (serviceAccount.privateKey || serviceAccount.private_key)) {
      initializeApp({ credential: cert(serviceAccount) });
      console.log("🔥 Firebase Admin successfully initialized!");
    } else if (!initError) {
      initError = "Invalid service account structure or missing private key.";
      console.error("🚨 CRITICAL: " + initError);
    }
  } catch (err) {
    initError = err.message;
    console.error("❌ Firebase Initialization Error:", err.message);
  }
}

// Firestore ఇన్‌స్టాన్స్‌ని సురక్షితంగా ఎక్స్‌పోర్ట్ చేయడం
export const db = getApps().length > 0 ? getFirestore() : null;

export function isFirebaseReady() {
  return getApps().length > 0;
}

export function getFirebaseInitializationError() {
  return initError;
}