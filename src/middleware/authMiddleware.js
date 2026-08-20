import jwt from "jsonwebtoken";
import { getAuth } from "firebase-admin/auth";
import {
  isFirebaseReady,
  getFirebaseInitializationError,
} from "../config/firebase.js";

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== "string") return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function verifyNovaCartJwt(token) {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) return null;

  try {
    const decoded = jwt.verify(token, secret, {
      issuer: "novacart",
    });

    if (!decoded || typeof decoded !== "object") return null;
    if (!decoded.uid || !decoded.role) return null;

    return decoded;
  } catch (_) {
    return null;
  }
}

export const verifyFirebaseToken = async (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: No Bearer token provided.",
    });
  }

  // PRIMARY for NovaCart seller accounts:
  // seller login/create-account returns our own JWT.
  const jwtUser = verifyNovaCartJwt(token);
  if (jwtUser) {
    req.user = jwtUser;
    req.authType = "jwt";
    return next();
  }

  // BACKWARD COMPATIBILITY:
  // Existing customer/admin Firebase-authenticated clients can continue
  // using Firebase ID tokens.
  try {
    if (!isFirebaseReady()) {
      const initErr = getFirebaseInitializationError();
      return res.status(503).json({
        success: false,
        message: "Authentication service is unavailable.",
        error: initErr?.message || "Firebase Admin is not initialized.",
      });
    }

    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    req.authType = "firebase";
    return next();
  } catch (error) {
    console.error("❌ Auth Token Error:", error.message);

    let customMessage = "Unauthorized: Invalid or expired authentication token.";
    if (error.code === "auth/id-token-expired") {
      customMessage =
        "Unauthorized: Token has expired. Please login again.";
    } else if (error.code === "auth/argument-error") {
      customMessage = "Unauthorized: Invalid token structure.";
    }

    return res.status(401).json({
      success: false,
      message: customMessage,
    });
  }
};

export const requireFirebaseAuth = verifyFirebaseToken;
export default verifyFirebaseToken;
