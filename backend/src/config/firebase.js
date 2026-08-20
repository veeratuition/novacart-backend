import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/*
 * NovaCart Firebase Admin configuration
 *
 * IMPORTANT:
 * - Render must contain a CURRENT Firebase service-account credential.
 * - Prefer FIREBASE_SERVICE_ACCOUNT as one JSON secret.
 * - Otherwise use FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL +
 *   FIREBASE_PRIVATE_KEY.
 *
 * The private key is normalized for Render values containing literal \n.
 */

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizePrivateKey(value) {
  let key = clean(value);

  // Render/env values sometimes arrive with surrounding quotes.
  if (
    key.length >= 2 &&
    ((key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'")))
  ) {
    key = key.slice(1, -1);
  }

  // Convert literal backslash-n sequences to real newlines.
  key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");

  // Repair the common malformed header/footer that was previously used.
  key = key.replace(/^--BEGIN PRIVATE KEY-----/m, "-----BEGIN PRIVATE KEY-----");
  key = key.replace(/^-----BEGIN PRIVATE KEY----+$/m, "-----BEGIN PRIVATE KEY-----");
  key = key.replace(/^--END PRIVATE KEY-----/m, "-----END PRIVATE KEY-----");
  key = key.replace(/^-----END PRIVATE KEY----+$/m, "-----END PRIVATE KEY-----");

  return key.trim();
}

function parseServiceAccountJson() {
  const raw = clean(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not a JSON object.");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT is invalid JSON: ${error.message}`
    );
  }
}

function buildServiceAccount() {
  const jsonAccount = parseServiceAccountJson();

  if (jsonAccount) {
    const account = {
      projectId: clean(jsonAccount.project_id || jsonAccount.projectId),
      clientEmail: clean(jsonAccount.client_email || jsonAccount.clientEmail),
      privateKey: normalizePrivateKey(
        jsonAccount.private_key || jsonAccount.privateKey
      ),
    };

    validateServiceAccount(account, "FIREBASE_SERVICE_ACCOUNT");
    return account;
  }

  const account = {
    projectId: clean(
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      "novacart-4dcd8"
    ),
    clientEmail: clean(process.env.FIREBASE_CLIENT_EMAIL),
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  };

  validateServiceAccount(account, "FIREBASE_*");
  return account;
}

function validateServiceAccount(account, source) {
  if (!account.projectId) {
    throw new Error(`${source}: Firebase project ID is missing.`);
  }

  if (!account.clientEmail) {
    throw new Error(`${source}: Firebase client email is missing.`);
  }

  if (!account.privateKey) {
    throw new Error(`${source}: Firebase private key is missing.`);
  }

  if (!account.privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      `${source}: Firebase private key does not contain a valid BEGIN PRIVATE KEY header.`
    );
  }

  if (!account.privateKey.includes("END PRIVATE KEY")) {
    throw new Error(
      `${source}: Firebase private key does not contain a valid END PRIVATE KEY footer.`
    );
  }
}

let firebaseApp;
let firebaseInitializationError = null;

if (getApps().length === 0) {
  try {
    const serviceAccount = buildServiceAccount();
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });
    console.log(`🔥 Firebase Admin initialized: ${serviceAccount.projectId}`);
  } catch (error) {
    firebaseInitializationError = error;
    console.error('❌ Firebase Admin initialization failed:', error.message);
  }
} else {
  firebaseApp = getApp();
}

export const isFirebaseReady = () => Boolean(firebaseApp) && !firebaseInitializationError;
export const getFirebaseInitializationError = () => firebaseInitializationError;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export { FieldValue };

/*
 * Real Firebase connectivity check.
 *
 * Initialization alone does NOT prove that Google's OAuth credentials
 * are valid. This call forces Firestore to obtain an access token.
 */
export async function verifyFirebaseConnection() {
  try {
    await db.collection("orders").limit(1).get();

    return {
      ready: true,
      projectId: firebaseApp.options.projectId || "unknown",
    };
  } catch (error) {
    console.error("❌ Firebase connectivity check failed:", error);

    const raw = String(error?.message || error);

    if (
      raw.includes("UNAUTHENTICATED") ||
      raw.includes("invalid authentication credentials") ||
      raw.includes("Expected OAuth 2 access token")
    ) {
      throw new Error(
        "Firebase Google OAuth credentials are rejected. " +
        "Replace the Render Firebase service-account credential with a newly generated active key."
      );
    }

    throw error;
  }
}
