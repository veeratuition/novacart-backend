
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getAuth } from "firebase-admin/auth";
import { db, isFirebaseReady } from "../config/firebase.js";

const APPLICATIONS = "seller_applications";
const SELLERS = "sellers";
const USERS = "users";

function jwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("JWT_SECRET is not configured on the server.");
  }
  return secret;
}

function createJwt(user) {
  return jwt.sign(
    {
      uid: user.uid,
      role: user.role || "seller",
      email: user.email || "",
      mobile: user.mobile || "",
    },
    jwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "30d",
      issuer: "novacart",
      subject: user.uid,
    },
  );
}

function hashRegistrationToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token))
    .digest("hex");
}

function newRegistrationToken() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeMobile(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function safeApplicationData(body) {
  const allowed = [
    "fullName", "mobile", "email", "dob",
    "shopName", "businessName", "businessType",
    "gstNumber", "panNumber",
    "doorNo", "street", "area", "city", "mandal",
    "district", "state", "pincode", "latitude", "longitude",
    "accountHolderName", "bankName", "accountNumber",
    "ifscCode", "branchName", "upiId",
  ];

  const result = {};
  for (const key of allowed) {
    if (body[key] !== undefined && body[key] !== null) {
      result[key] = body[key];
    }
  }
  return result;
}

async function findSellerByMobile(mobile) {
  const snap = await db
    .collection(SELLERS)
    .where("mobile", "==", mobile)
    .limit(1)
    .get();

  return snap.empty ? null : snap.docs[0];
}

async function findSellerByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  let snap = await db
    .collection(SELLERS)
    .where("email", "==", normalized)
    .limit(1)
    .get();

  if (!snap.empty) return snap.docs[0];

  snap = await db
    .collection(SELLERS)
    .where("loginEmail", "==", normalized)
    .limit(1)
    .get();

  return snap.empty ? null : snap.docs[0];
}

class AuthController {
  async registerSeller(req, res) {
    try {
      if (!isFirebaseReady()) {
        return res.status(503).json({
          success: false,
          message: "Firebase service is unavailable.",
        });
      }

      const body = req.body || {};
      const mobile = normalizeMobile(body.mobile);
      const email = normalizeEmail(body.email);

      if (!/^[6-9]\d{9}$/.test(mobile)) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid 10-digit Indian mobile number.",
        });
      }

      if (!body.fullName || !body.shopName || !body.city || !body.state || !body.pincode) {
        return res.status(400).json({
          success: false,
          message: "Please complete the required seller details.",
        });
      }

      const existingSeller = await findSellerByMobile(mobile);
      if (existingSeller?.data()?.accountCreated === true) {
        return res.status(409).json({
          success: false,
          message: "A seller account already exists for this mobile number.",
        });
      }

      const applicationData = safeApplicationData({
        ...body,
        mobile,
        email,
      });

      const applicationId = db.collection(APPLICATIONS).doc().id;
      const registrationToken = newRegistrationToken();

      await db.collection(APPLICATIONS).doc(applicationId).set({
        ...applicationData,
        applicationId,
        status: "pending",
        email,
        registrationTokenHash: hashRegistrationToken(registrationToken),
        registrationTokenCreatedAt: new Date().toISOString(),
        accountCreated: false,
        documents: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      return res.status(201).json({
        success: true,
        message: "Seller application submitted successfully.",
        applicationId,
        registrationToken,
        status: "pending",
      });
    } catch (error) {
      console.error("Seller registration error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Seller registration failed.",
      });
    }
  }

  async sellerStatus(req, res) {
    try {
      const { applicationId, registrationToken } = req.body || {};

      if (!applicationId || !registrationToken) {
        return res.status(400).json({
          success: false,
          message: "Application ID and registration token are required.",
        });
      }

      const ref = db.collection(APPLICATIONS).doc(String(applicationId));
      const snap = await ref.get();

      if (!snap.exists) {
        return res.status(404).json({
          success: false,
          message: "Seller application not found.",
        });
      }

      const application = snap.data();

      if (
        application.registrationTokenHash !==
        hashRegistrationToken(registrationToken)
      ) {
        return res.status(401).json({
          success: false,
          message: "Invalid registration token.",
        });
      }

      return res.json({
        success: true,
        status: String(application.status || "pending").toLowerCase(),
        email: application.email || application.loginEmail || "",
        rejectReason: application.rejectReason || "",
        applicationId,
        accountCreated: application.accountCreated === true,
      });
    } catch (error) {
      console.error("Seller status error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Unable to check application status.",
      });
    }
  }

  async saveDocuments(req, res) {
    try {
      const { applicationId } = req.params;
      const { registrationToken, documents } = req.body || {};

      if (!applicationId || !registrationToken || !documents || typeof documents !== "object") {
        return res.status(400).json({
          success: false,
          message: "Application ID, registration token and documents are required.",
        });
      }

      const ref = db.collection(APPLICATIONS).doc(String(applicationId));
      const snap = await ref.get();

      if (!snap.exists) {
        return res.status(404).json({
          success: false,
          message: "Seller application not found.",
        });
      }

      const application = snap.data();

      if (
        application.registrationTokenHash !==
        hashRegistrationToken(registrationToken)
      ) {
        return res.status(401).json({
          success: false,
          message: "Invalid registration token.",
        });
      }

      await ref.set(
        {
          documents: {
            ...(application.documents || {}),
            ...documents,
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      return res.json({
        success: true,
        message: "Seller documents saved successfully.",
        documents,
      });
    } catch (error) {
      console.error("Save seller documents error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Unable to save seller documents.",
      });
    }
  }

  async uploadApplication(req, res) {
    try {
      const { applicationId } = req.params;

      // Multipart/form-data parsers can expose the token in req.body, while
      // some clients/proxies only preserve the custom header. Accept both.
      const token = String(
        req.body?.registrationToken ||
        req.headers["x-registration-token"] ||
        req.headers["X-Registration-Token"] ||
        ""
      ).trim();

      const folder = String(req.body?.folder || "document")
        .replace(/[^a-zA-Z0-9_-]/g, "_");

      if (!applicationId || !token) {
        return res.status(400).json({
          success: false,
          message: "Application ID and registration token are required.",
        });
      }

      const ref = db.collection(APPLICATIONS).doc(String(applicationId));
      const snap = await ref.get();

      if (!snap.exists) {
        return res.status(404).json({
          success: false,
          message: "Seller application not found.",
        });
      }

      const application = snap.data();

      if (application.registrationTokenHash !== hashRegistrationToken(token)) {
        return res.status(401).json({
          success: false,
          message: "Invalid registration token.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded.",
        });
      }

      const url =
        `${req.protocol}://${req.get("host")}` +
        `/api/auth/seller/application/${encodeURIComponent(applicationId)}/file/${encodeURIComponent(folder)}/${encodeURIComponent(req.file.filename)}`;

      return res.json({
        success: true,
        folder,
        url,
        file: {
          name: req.file.originalname,
          size: req.file.size,
          url,
        },
      });
    } catch (error) {
      console.error("Seller application upload error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Seller document upload failed.",
      });
    }
  }

  async createSellerAccount(req, res) {
    try {
      if (!isFirebaseReady()) {
        return res.status(503).json({
          success: false,
          message: "Firebase service is unavailable.",
        });
      }

      const { applicationId, registrationToken, password } = req.body || {};
      const email = normalizeEmail(req.body?.email);

      if (!applicationId || !registrationToken || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "Application ID, registration token, email and password are required.",
        });
      }

      if (String(password).length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters.",
        });
      }

      const ref = db.collection(APPLICATIONS).doc(String(applicationId));
      const snap = await ref.get();

      if (!snap.exists) {
        return res.status(404).json({
          success: false,
          message: "Seller application not found.",
        });
      }

      const application = snap.data();

      if (
        application.registrationTokenHash !==
        hashRegistrationToken(registrationToken)
      ) {
        return res.status(401).json({
          success: false,
          message: "Invalid registration token.",
        });
      }

      if (String(application.status || "").toLowerCase() !== "approved") {
        return res.status(403).json({
          success: false,
          message: "Seller application is not approved yet.",
        });
      }

      if (application.accountCreated === true) {
        return res.status(409).json({
          success: false,
          message: "Seller account has already been created.",
        });
      }

      // Create the Firebase account with the seller's chosen email/password.
      let firebaseUser;
      try {
        firebaseUser = await getAuth().createUser({
          email,
          password: String(password),
          displayName: application.fullName || "NovaCart Seller",
          disabled: false,
        });
      } catch (error) {
        if (error.code === "auth/email-already-exists") {
          return res.status(409).json({
            success: false,
            message: "This email is already registered. Please use another email.",
          });
        }
        throw error;
      }

      const passwordHash = await bcrypt.hash(String(password), 12);

      const sellerData = {
        ...application,
        uid: firebaseUser.uid,
        sellerId: firebaseUser.uid,
        applicationId,
        mobile: application.mobile || "",
        email,
        loginEmail: email,
        passwordHash,
        role: "seller",
        status: "approved",
        isActive: true,
        accountCreated: true,
        registrationTokenHash: null,
        updatedAt: new Date().toISOString(),
        accountCreatedAt: new Date().toISOString(),
      };

      delete sellerData.registrationTokenHash;

      await db.collection(SELLERS).doc(firebaseUser.uid).set(
        sellerData,
        { merge: true },
      );

      await db.collection(USERS).doc(firebaseUser.uid).set(
        {
          uid: firebaseUser.uid,
          sellerId: firebaseUser.uid,
          role: "seller",
          name: application.fullName || "",
          fullName: application.fullName || "",
          mobile: application.mobile || "",
          email,
          status: "approved",
          isActive: true,
          accountCreated: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      await ref.set(
        {
          sellerUid: firebaseUser.uid,
          loginEmail: email,
          email,
          loginCreated: true,
          accountCreated: true,
          status: "approved",
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      const customToken = await getAuth().createCustomToken(
        firebaseUser.uid,
        {
          role: "seller",
          seller: true,
        },
      );

      const token = createJwt({
        uid: firebaseUser.uid,
        role: "seller",
        email,
        mobile: application.mobile || "",
      });

      return res.status(201).json({
        success: true,
        message: "Seller account created successfully.",
        uid: firebaseUser.uid,
        sellerId: firebaseUser.uid,
        email,
        role: "seller",
        token,
        customToken,
      });
    } catch (error) {
      console.error("Create seller account error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Unable to create seller account.",
      });
    }
  }

  async sellerLogin(req, res) {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password || "");

      if (!email || !email.includes("@") || !password) {
        return res.status(400).json({
          success: false,
          message: "Email address and password are required.",
        });
      }

      const sellerDoc = await findSellerByEmail(email);

      if (!sellerDoc || sellerDoc.data()?.accountCreated !== true) {
        return res.status(401).json({
          success: false,
          message: "Seller account not found or not activated.",
        });
      }

      const seller = sellerDoc.data();
      const valid = await bcrypt.compare(
        password,
        String(seller.passwordHash || ""),
      );

      if (!valid) {
        return res.status(401).json({
          success: false,
          message: "Invalid email address or password.",
        });
      }

      const uid = seller.uid || seller.sellerId || sellerDoc.id;
      const mobile = normalizeMobile(seller.mobile || seller.phone);

      // NovaCart login is JWT-based; Firebase client authentication is not required.
      const token = createJwt({
        uid,
        role: "seller",
        email,
        mobile,
      });

      return res.json({
        success: true,
        message: "Seller login successful.",
        uid,
        sellerId: uid,
        email,
        role: "seller",
        token,
      });
    } catch (error) {
      console.error("Seller login error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Seller login failed.",
      });
    }
  }
}

export default new AuthController();
