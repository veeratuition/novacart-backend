import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import authController from '../controllers/authController.js';
import { db } from '../config/firebase.js';

const router = express.Router();
const registrationRoot = path.resolve(process.cwd(), 'uploads/seller-registration');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const applicationId = String(req.params.applicationId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const folder = String(req.body?.folder || 'document').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(registrationRoot, applicationId, folder);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(
    null,
    /^(image\/(jpeg|png|webp|jpg)|application\/pdf)$/.test(file.mimetype),
  ),
});

async function verifyRegistration(req, res, next) {
  try {
    const applicationId = String(req.params.applicationId || req.body?.applicationId || '').trim();
    const token = String(
      req.headers['x-registration-token'] || req.body?.registrationToken || req.query?.registrationToken || '',
    ).trim();

    if (!applicationId || !token) {
      return res.status(401).json({ success: false, message: 'Registration credentials are required.' });
    }

    const snap = await db.collection('seller_applications').doc(applicationId).get();
    if (!snap.exists) return res.status(404).json({ success: false, message: 'Application not found.' });

    const expected = snap.data()?.registrationTokenHash;
    const actual = crypto.createHash('sha256').update(token).digest('hex');
    if (!expected || expected !== actual) {
      return res.status(401).json({ success: false, message: 'Invalid registration credentials.' });
    }

    req.registration = { applicationId, token };
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Registration authorization failed.' });
  }
}

router.post('/seller/register', authController.registerSellerApplication);
router.post('/seller/status', authController.sellerStatus);

router.post('/seller/application/:applicationId/documents', verifyRegistration, async (req, res) => {
  try {
    const documents = req.body?.documents;
    if (!documents || typeof documents !== 'object') {
      return res.status(400).json({ success: false, message: 'Documents object is required.' });
    }
    await db.collection('seller_applications').doc(req.registration.applicationId).set({
      ...documents,
      updatedAt: new Date(),
    }, { merge: true });
    return res.json({ success: true, documents });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/seller/create-account', authController.createSellerAccount);
router.post('/seller/login', authController.sellerLogin);

router.post(
  '/seller/application/:applicationId/upload',
  verifyRegistration,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
      const folder = String(req.body?.folder || 'document').replace(/[^a-zA-Z0-9_-]/g, '_');
      const applicationId = req.registration.applicationId;
      const url = `${req.protocol}://${req.get('host')}/api/auth/seller/application/${applicationId}/file/${folder}/${encodeURIComponent(req.file.filename)}?registrationToken=${encodeURIComponent(req.registration.token)}`;
      return res.json({ success: true, url, folder, name: req.file.originalname, size: req.file.size });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

router.get(
  '/seller/application/:applicationId/file/:folder/:filename',
  verifyRegistration,
  async (req, res) => {
    try {
      const applicationId = req.registration.applicationId;
      const folder = String(req.params.folder).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = path.basename(req.params.filename);
      const filePath = path.resolve(registrationRoot, applicationId, folder, filename);
      const root = path.resolve(registrationRoot, applicationId, folder);
      if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'File not found.' });
      }
      return res.sendFile(filePath);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

export default router;
