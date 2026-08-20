import { getAuth } from "firebase-admin/auth";
import { isFirebaseReady, getFirebaseInitializationError } from "../config/firebase.js";

export const verifyFirebaseToken = async (req, res, next) => {
  try {
    // 1. Firebase Admin ఇనిషియలైజ్ అయిందో లేదో సరిచూడటం
    const isReady = typeof isFirebaseReady === "function" ? isFirebaseReady() : false;

    if (!isReady) {
      const initErr = typeof getFirebaseInitializationError === "function" 
        ? getFirebaseInitializationError() 
        : "Firebase Admin is not initialized properly";

      console.error("🚨 Auth Middleware Error: Firebase Not Ready ->", initErr);
      return res.status(500).json({
        success: false,
        message: "Server Configuration Error: Authentication service unavailable",
        error: typeof initErr === "object" ? initErr?.message : initErr,
      });
    }

    // 2. Authorization Header చెక్ చేయడం (Case-insensitive check)
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No Bearer token provided in authorization header",
      });
    }

    // 3. Token ని ఎక్స్‌ట్రాక్ట్ మరియు ట్రిమ్ చేయడం
    const token = authHeader.split("Bearer ")[1]?.trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Token string is empty or malformed",
      });
    }

    // 4. Firebase ID Token ని వెరిఫై చేయడం
    const decodedToken = await getAuth().verifyIdToken(token);

    // Verified User డేటాను Request కి అటాచ్ చేయడం
    req.user = decodedToken;
    return next();
  } catch (error) {
    console.error("❌ Auth Token Error:", error.message);

    // Firebase Auth లో నిర్దిష్ట ఎర్రర్లకు తగిన రెస్పాన్స్ ఇవ్వడం
    let customMessage = "Unauthorized: Invalid or expired authentication token";
    if (error.code === "auth/id-token-expired") {
      customMessage = "Unauthorized: Token has expired. Please refresh your session.";
    } else if (error.code === "auth/argument-error") {
      customMessage = "Unauthorized: Invalid token structure.";
    }

    return res.status(401).json({
      success: false,
      message: customMessage,
      error: error.message,
    });
  }
};

// Aliases & Exports
export const requireFirebaseAuth = verifyFirebaseToken;
export default verifyFirebaseToken;