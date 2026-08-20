import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import uploadController from '../controllers/uploadController.js';
import { requireFirebaseAuth } from '../middleware/authMiddleware.js';

const productRoot = path.resolve(process.cwd(), 'uploads/products');
const sellerDocumentRoot = path.resolve(
  process.cwd(),
  'uploads/seller-documents',
);

const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sellerDir = path.join(productRoot, req.user.uid);
    fs.mkdirSync(sellerDir, { recursive: true });
    cb(null, sellerDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`,
    );
  },
});

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sellerId = String(req.user.uid);
    const folder = String(req.body?.folder || 'document')
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    const sellerDir = path.join(sellerDocumentRoot, sellerId, folder);
    fs.mkdirSync(sellerDir, { recursive: true });
    cb(null, sellerDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`,
    );
  },
});

const imageUpload = multer({
  storage: productStorage,
  limits: { files: 10, fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(null, /^image\/(jpeg|png|webp|jpg)$/.test(file.mimetype)),
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(
      null,
      /^(image\/(jpeg|png|webp|jpg)|application\/pdf)$/.test(
        file.mimetype,
      ),
    ),
});

const router = express.Router();

router.post(
  '/images',
  requireFirebaseAuth,
  imageUpload.array('images', 10),
  uploadController.images,
);

router.post(
  '/seller-documents',
  requireFirebaseAuth,
  documentUpload.single('file'),
  uploadController.sellerDocument,
);

router.get(
  '/seller-documents/:sellerId/:folder/:filename',
  requireFirebaseAuth,
  uploadController.downloadSellerDocument,
);

export default router;
