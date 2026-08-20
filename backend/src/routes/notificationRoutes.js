import express from 'express';
import notificationController from '../controllers/notificationController.js';
import { requireFirebaseAuth } from '../middleware/authMiddleware.js';
const router = express.Router();
router.post('/register-token', requireFirebaseAuth, notificationController.registerToken);
router.post('/send', requireFirebaseAuth, notificationController.send);
router.post('/send-to-user', requireFirebaseAuth, notificationController.sendToUser);
export default router;
