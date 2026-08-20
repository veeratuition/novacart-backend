import jwt from 'jsonwebtoken';
import { getAuth } from 'firebase-admin/auth';
import { isFirebaseReady, getFirebaseInitializationError } from '../config/firebase.js';

const JWT_SECRET = process.env.JWT_SECRET || '';

export const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No Bearer token provided.' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized: Empty token.' });

    // New production auth: NovaCart JWT.
    if (JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded?.uid) {
          req.user = decoded;
          req.authType = 'jwt';
          return next();
        }
      } catch (_) {
        // Fall through to Firebase ID-token compatibility below.
      }
    }

    // Backward compatibility: existing Firebase-authenticated sessions.
    const isReady = typeof isFirebaseReady === 'function' ? isFirebaseReady() : false;
    if (!isReady) {
      const initErr = typeof getFirebaseInitializationError === 'function'
        ? getFirebaseInitializationError()
        : 'Firebase Admin is not initialized properly';
      return res.status(500).json({
        success: false,
        message: 'Server Configuration Error: Authentication service unavailable',
        error: typeof initErr === 'object' ? initErr?.message : initErr,
      });
    }

    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    req.authType = 'firebase';
    return next();
  } catch (error) {
    console.error('❌ Auth Token Error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or expired authentication token.',
      error: error.message,
    });
  }
};

export const requireFirebaseAuth = verifyFirebaseToken;
export default verifyFirebaseToken;
