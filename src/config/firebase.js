import {
  initializeApp,
  cert,
  getApps,
  getApp,
} from "firebase-admin/app";

import {
  getFirestore,
  FieldValue,
} from "firebase-admin/firestore";

// ============================================================
// NOVACART FIREBASE ADMIN CONFIGURATION
// ============================================================

let firebaseApp = null;
let firestore = null;
let firebaseInitializationError = null;

// ============================================================
// HELPERS
// ============================================================

function clean(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function normalizePrivateKey(value) {
  let key = clean(value);

  // Remove accidental surrounding quotes.
  if (
    key.length >= 2 &&
    (
      (key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'"))
    )
  ) {
    key = key.slice(1, -1);
  }

  // Render environment variables may contain literal \n.
  key = key.replace(/\\n/g, "\n");

  // Normalize Windows line endings.
  key = key.replace(/\r\n/g, "\n");

  // Fix accidental malformed headers.
  key = key.replace(
    /^--BEGIN PRIVATE KEY-----/m,
    "-----BEGIN PRIVATE KEY-----"
  );

  key = key.replace(
    /^--END PRIVATE KEY-----/m,
    "-----END PRIVATE KEY-----"
  );

  return key.trim();
}

// ============================================================
// SERVICE ACCOUNT JSON
// ============================================================

function parseServiceAccountJSON() {
  const raw = clean(process.env.FIREBASE_SERVICE_ACCOUNT);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT must contain a JSON object."
      );
    }

    return parsed;
  } catch (error) {
    throw new Error(
      `Invalid FIREBASE_SERVICE_ACCOUNT JSON: ${error.message}`
    );
  }
}

// ============================================================
// BUILD SERVICE ACCOUNT
// ============================================================

function buildServiceAccount() {
  // Preferred method:
  // Render -> FIREBASE_SERVICE_ACCOUNT
  const jsonAccount = parseServiceAccountJSON();

  if (jsonAccount) {
    const account = {
      projectId: clean(
        jsonAccount.project_id ||
        jsonAccount.projectId
      ),

      clientEmail: clean(
        jsonAccount.client_email ||
        jsonAccount.clientEmail
      ),

      privateKey: normalizePrivateKey(
        jsonAccount.private_key ||
        jsonAccount.privateKey
      ),
    };

    validateServiceAccount(
      account,
      "FIREBASE_SERVICE_ACCOUNT"
    );

    return account;
  }

  // Fallback:
  // FIREBASE_PROJECT_ID
  // FIREBASE_CLIENT_EMAIL
  // FIREBASE_PRIVATE_KEY

  const account = {
    projectId: clean(
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      "novacart-4dcd8"
    ),

    clientEmail: clean(
      process.env.FIREBASE_CLIENT_EMAIL
    ),

    privateKey: normalizePrivateKey(
      process.env.FIREBASE_PRIVATE_KEY
    ),
  };

  validateServiceAccount(
    account,
    "FIREBASE_* environment variables"
  );

  return account;
}

// ============================================================
// VALIDATE SERVICE ACCOUNT
// ============================================================

function validateServiceAccount(account, source) {
  if (!account.projectId) {
    throw new Error(
      `${source}: Firebase project ID is missing.`
    );
  }

  if (!account.clientEmail) {
    throw new Error(
      `${source}: Firebase client email is missing.`
    );
  }

  if (!account.privateKey) {
    throw new Error(
      `${source}: Firebase private key is missing.`
    );
  }

  if (
    !account.privateKey.includes(
      "-----BEGIN PRIVATE KEY-----"
    )
  ) {
    throw new Error(
      `${source}: Firebase private key has an invalid BEGIN header.`
    );
  }

  if (
    !account.privateKey.includes(
      "-----END PRIVATE KEY-----"
    )
  ) {
    throw new Error(
      `${source}: Firebase private key has an invalid END footer.`
    );
  }
}

// ============================================================
// INITIALIZE FIREBASE ADMIN
// ============================================================

try {
  if (getApps().length > 0) {
    firebaseApp = getApp();
  } else {
    const serviceAccount = buildServiceAccount();

    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });

    console.log(
      `🔥 Firebase Admin initialized: ${serviceAccount.projectId}`
    );
  }

  firestore = getFirestore(firebaseApp);

  console.log("🔥 Firestore initialized successfully.");
} catch (error) {
  firebaseInitializationError = error;

  console.error(
    "❌ Firebase Admin initialization failed:"
  );

  console.error(error);

  /*
   * IMPORTANT:
   * Do not immediately crash the entire Node process.
   *
   * authMiddleware.js can use:
   * isFirebaseReady()
   * getFirebaseInitializationError()
   *
   * to return a proper API error.
   */
}

// ============================================================
// FIREBASE STATUS
// ============================================================

export function isFirebaseReady() {
  return (
    firebaseApp !== null &&
    firestore !== null &&
    firebaseInitializationError === null
  );
}

// ============================================================
// FIREBASE INITIALIZATION ERROR
// ============================================================

export function getFirebaseInitializationError() {
  return firebaseInitializationError;
}

// ============================================================
// FIREBASE APP
// ============================================================

export function getFirebaseApp() {
  if (!firebaseApp) {
    throw new Error(
      "Firebase Admin is not initialized."
    );
  }

  return firebaseApp;
}

// ============================================================
// FIRESTORE
// ============================================================

export function getDb() {
  if (!firestore) {
    throw new Error(
      "Firestore is not initialized."
    );
  }

  return firestore;
}

// Named export used by existing controllers.
export const db = firestore;

// ============================================================
// FIREBASE CONNECTIVITY CHECK
// ============================================================

export async function verifyFirebaseConnection() {
  if (!isFirebaseReady()) {
    const error =
      getFirebaseInitializationError();

    throw new Error(
      error?.message ||
      "Firebase Admin is not initialized."
    );
  }

  try {
    /*
     * Real Firestore request.
     *
     * This forces Google OAuth authentication.
     */
    await firestore
      .collection("orders")
      .limit(1)
      .get();

    return {
      ready: true,
      projectId:
        firebaseApp.options.projectId ||
        "unknown",
    };
  } catch (error) {
    console.error(
      "❌ Firebase Firestore connectivity check failed:"
    );

    console.error(error);

    throw error;
  }
}

// ============================================================
// FIRESTORE FIELD VALUE
// ============================================================

export { FieldValue };