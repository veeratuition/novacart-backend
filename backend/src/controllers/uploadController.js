import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const safePart = (value) =>
  String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');

class UploadController {
  async images(req, res) {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) {
        return res.status(400).json({
          success: false,
          message: 'No images uploaded.',
        });
      }

      const sellerId = String(req.user.uid);
      const urls = files.map(
        (file) =>
          `${req.protocol}://${req.get('host')}/uploads/products/${sellerId}/${file.filename}`,
      );

      return res.json({
        success: true,
        sellerId,
        url: urls[0],
        urls,
        files: files.map((file, index) => ({
          name: file.originalname,
          size: file.size,
          url: urls[index],
        })),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async sellerDocument(req, res) {
    try {
      const file = req.file;
      const folder = safePart(req.body?.folder || 'document');

      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No seller document uploaded.',
        });
      }

      const sellerId = String(req.user.uid);
      const url =
        `${req.protocol}://${req.get('host')}` +
        `/api/uploads/seller-documents/${sellerId}/${folder}/${encodeURIComponent(file.filename)}`;

      return res.json({
        success: true,
        sellerId,
        folder,
        url,
        file: {
          name: file.originalname,
          size: file.size,
          url,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async downloadSellerDocument(req, res) {
    try {
      const sellerId = String(req.params.sellerId);
      const folder = safePart(req.params.folder);
      const filename = path.basename(req.params.filename);

      const requester = req.user || {};
      const sameSeller = requester.uid === sellerId;
      const admin =
        requester.admin === true ||
        requester.role === 'admin' ||
        requester.role === 'super_admin';

      if (!sameSeller && !admin) {
        return res.status(403).json({
          success: false,
          message: 'You are not allowed to access this seller document.',
        });
      }

      const filePath = path.resolve(
        process.cwd(),
        'uploads',
        'seller-documents',
        sellerId,
        folder,
        filename,
      );

      const root = path.resolve(
        process.cwd(),
        'uploads',
        'seller-documents',
        sellerId,
      );

      if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'Seller document not found.',
        });
      }

      return res.sendFile(filePath);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

export default new UploadController();
