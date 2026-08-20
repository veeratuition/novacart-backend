import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import authController from "../controllers/authController.js";

const router = express.Router();

const applicationRoot = path.resolve(
  process.cwd(),
  "uploads",
  "seller-applications",
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const applicationId = String(req.params.applicationId || "unknown")
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const folder = String(req.body?.folder || "document")
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    const dir = path.join(applicationRoot, applicationId, folder);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`,
    );
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed =
      /^image\/(jpeg|png|webp|jpg)$/.test(file.mimetype) ||
      file.mimetype === "application/pdf";

    cb(
      allowed ? null : new Error("Only JPG, PNG, WEBP and PDF files are allowed."),
      allowed,
    );
  },
});

// Seller application
router.post("/seller/register", authController.registerSeller);
router.post("/seller/status", authController.sellerStatus);
router.post("/seller/create-account", authController.createSellerAccount);
router.post("/seller/login", authController.sellerLogin);

// Seller application document upload
router.post(
  "/seller/application/:applicationId/upload",
  upload.single("file"),
  authController.uploadApplication,
);

// Save uploaded document URLs
router.post(
  "/seller/application/:applicationId/documents",
  authController.saveDocuments,
);

export default router;
