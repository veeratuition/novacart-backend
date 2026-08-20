import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

let firebaseApp = null;
let firestore = null;
let firebaseInitializationError = null;

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function normalizePrivateKey(value) {
  let key = clean(value);
  if (key.length >= 2 && ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  return key;
}

function validateAccount(account, source) {
  if (!account.projectId) throw new Error(`${source}: FIREBASE_PROJECT_ID is missing.`);
  if (!account.clientEmail) throw new Error(`${source}: FIREBASE_CLIENT_EMAIL is missing.`);
  if (!account.privateKey) throw new Error(`${source}: FIREBASE_PRIVATE_KEY is missing.`);
  if (!account.privateKey.includes("-----BEGIN PRIVATE KEY-----") || !account.privateKey.includes("-----END PRIVATE KEY-----")) {
    throw new Error(`${source}: FIREBASE_PRIVATE_KEY is not a valid PEM private key.`);
  }
}

function accountFromSeparateEnv() {
  const projectId = clean(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT);
  const clientEmail = clean(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  // Only use this source when all three values are present.
  if (projectId && clientEmail && privateKey) {
    const account = { projectId, clientEmail, privateKey };
    validateAccount(account, "Separate Firebase environment variables");
    return account;
  }

  return null;
}

function accountFromJsonEnv() {
  const raw = clean(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT contains invalid JSON: ${error.message}`);
  }

  const account = {
    projectId: clean(parsed.project_id || parsed.projectId),
    clientEmail: clean(parsed.client_email || parsed.clientEmail),
    privateKey: normalizePrivateKey(parsed.private_key || parsed.privateKey),
  };

  validateAccount(account, "FIREBASE_SERVICE_ACCOUNT");
  return account;
}

function buildServiceAccount() {
  // PRIMARY: complete Firebase service-account JSON.
  // This keeps project ID, client email and private key from the SAME key
  // together and avoids accidental key/email mismatches on Render.
  const json = accountFromJsonEnv();
  if (json) return json;

  // FALLBACK: separate Render variables.
  const separate = accountFromSeparateEnv();
  if (separate) return separate;

  throw new Error(
    "Firebase credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in Render Environment."
  );
}

try {
  if (getApps().length) {
    firebaseApp = getApp();
  } else {
    const serviceAccount = buildServiceAccount();

    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });

    console.log(`🔥 Firebase Admin initialized: ${serviceAccount.projectId}`);
  }

  firestore = getFirestore(firebaseApp);
  console.log("🔥 Firestore client initialized.");
} catch (error) {
  firebaseInitializationError = error;
  console.error("❌ Firebase Admin initialization failed:", error.message);
}

export function isFirebaseReady() {
  return !!firebaseApp && !!firestore && !firebaseInitializationError;
}

export function getFirebaseInitializationError() {
  return firebaseInitializationError;
}

export function getFirebaseApp() {
  if (!firebaseApp) throw new Error("Firebase Admin is not initialized.");
  return firebaseApp;
}

export function getDb() {
  if (!firestore) {
    throw new Error(firebaseInitializationError?.message || "Firestore is not initialized.");
  }
  return firestore;
}

export const db = firestore;
export { FieldValue };

export async function verifyFirebaseConnection() {
  if (!isFirebaseReady()) {
    throw firebaseInitializationError || new Error("Firebase Admin is not initialized.");
  }

  // Force a real Google-authenticated Firestore request.
  await firestore.collection("seller_applications").limit(1).get();

  return {
    ready: true,
    projectId: firebaseApp.options.projectId || "unknown",
  };
}

// Exporting getAuth is not required by controllers, but keeping the helper
// here makes the intended Firebase Admin app explicit and avoids accidental
// default-app creation in future code.
export function getFirebaseAuth() {
  if (!firebaseApp) throw new Error("Firebase Admin is not initialized.");
  return getAuth(firebaseApp);
}
