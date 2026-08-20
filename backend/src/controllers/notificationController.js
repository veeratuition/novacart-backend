import { getMessaging } from 'firebase-admin/messaging';
import { isFirebaseReady } from '../config/firebase.js';
import { db } from '../config/firebase.js';

function stringData(data = {}) {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [String(k), String(v)]));
}

class NotificationController {
  async registerToken(req, res) {
    try {
      if (!isFirebaseReady()) return res.status(503).json({ success:false, message:'Firebase Admin is not configured.' });
      const token = String(req.body?.token || '').trim();
      if (!token) return res.status(400).json({ success:false, message:'FCM token is required.' });
      await db.collection('fcmTokens').doc(req.user.uid).set({
        uid:req.user.uid,
        token,
        updatedAt:new Date().toISOString(),
      }, { merge:true });
      return res.json({ success:true, message:'Notification token registered.' });
    } catch (error) {
      return res.status(500).json({ success:false, message:error.message });
    }
  }

  async send(req, res) {
    try {
      if (!isFirebaseReady()) return res.status(503).json({ success:false, message:'Firebase Admin is not configured.' });
      const { token, tokens, title, body, data = {} } = req.body || {};
      if (!title || !body || (!token && (!Array.isArray(tokens) || tokens.length === 0))) {
        return res.status(400).json({ success:false, message:'title, body and token/tokens are required.' });
      }
      const messaging = getMessaging();
      let result;
      if (token) {
        result = await messaging.send({ token, notification:{ title:String(title), body:String(body) }, data:stringData(data) });
      } else {
        result = await messaging.sendEachForMulticast({ tokens:tokens.slice(0,500), notification:{ title:String(title), body:String(body) }, data:stringData(data) });
      }
      return res.json({ success:true, data:result });
    } catch (error) {
      return res.status(502).json({ success:false, message:error.message });
    }
  }

  async sendToUser(req, res) {
    try {
      if (!isFirebaseReady()) return res.status(503).json({ success:false, message:'Firebase Admin is not configured.' });
      const uid = String(req.body?.uid || '').trim();
      const title = String(req.body?.title || '').trim();
      const body = String(req.body?.body || '').trim();
      if (!uid || !title || !body) return res.status(400).json({ success:false, message:'uid, title and body are required.' });
      const snap = await db.collection('fcmTokens').doc(uid).get();
      if (!snap.exists || !snap.data()?.token) return res.status(404).json({ success:false, message:'No notification token registered for this user.' });
      const result = await getMessaging().send({ token:snap.data().token, notification:{title,body}, data:stringData(req.body?.data || {}) });
      return res.json({ success:true, data:result });
    } catch (error) {
      return res.status(502).json({ success:false, message:error.message });
    }
  }
}
export default new NotificationController();
