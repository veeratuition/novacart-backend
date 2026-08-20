import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

/**
 * Safely parse JSON strings from environment variables
 */
const parseJsonEnv = (envVar) => {
  if (!envVar) return null;
  try {
    return typeof envVar === "string" ? JSON.parse(envVar) : envVar;
  } catch (err) {
    console.error("❌ Failed to parse JSON environment variable:", err.message);
    return null;
  }
};

/**
 * Clean up formatting issues in private key string
 */
const formatPrivateKey = (key) => {
  if (!key) return undefined;
  return key.replace(/\\n/g, "\n").replace(/^"(.*)"$/, "$1");
};

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT) || 5001,

  jwtSecret: process.env.JWT_SECRET || "default_super_secret_key_change_me",

  database: {
    url: process.env.DATABASE_URL || null, // Render / Supabase / Managed Postgres
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    name: process.env.DB_NAME || "novacart_db",
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  },

  firebase: {
    // Render/Environment variable నుండి వచ్చే పూర్తి JSON ఆబ్జెక్ట్
    serviceAccount: parseJsonEnv(process.env.FIREBASE_SERVICE_ACCOUNT),
    
    // ఒకవేళ విడివిడిగా ఇస్తే
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  },

  cashfree: {
    clientId: process.env.CASHFREE_CLIENT_ID,
    clientSecret: process.env.CASHFREE_CLIENT_SECRET,
    environment: process.env.CASHFREE_ENVIRONMENT || process.env.CASHFREE_ENV || 'sandbox',
    apiVersion: process.env.CASHFREE_API_VERSION || '2025-01-01',
  },

  shiprocket: {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD,
    baseUrl: process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in/v1/external",
  },
};

// ==========================================
// Essential Environment Variables Check
// ==========================================
if (env.isProduction && env.jwtSecret === "default_super_secret_key_change_me") {
  console.error("🚨 CRITICAL SECURITY WARNING: JWT_SECRET is using default fallback in PRODUCTION! Set JWT_SECRET in environment variables immediately.");
} else if (!process.env.JWT_SECRET) {
  console.warn("⚠️ WARNING: JWT_SECRET is not set in .env! Using default fallback secret.");
}

if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  console.warn("⚠️ WARNING: Database configuration (DATABASE_URL or DB_HOST) is missing in .env. Defaulting to localhost.");
}

export default env;