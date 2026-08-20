import express from 'express';
import cashfreeController from '../controllers/cashfreeController.js';
import { requireFirebaseAuth } from '../middleware/authMiddleware.js';

const router = express.Router();
router.post('/orders', requireFirebaseAuth, cashfreeController.createOrder);
router.get('/orders/:orderId', requireFirebaseAuth, cashfreeController.getOrder);
router.post('/webhook', cashfreeController.webhook);
export default router;
